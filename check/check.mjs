#!/usr/bin/env node
// Headless check for City Timeline. No npm deps: drives Google Chrome over the DevTools
// protocol with Node's built-in WebSocket (Node 22+).
//
//   node check/check.mjs                 # test catalogue (test/) through a local server
//   node check/check.mjs --live          # the real catalogue at DATA_BASE (GitHub Pages)
//   node check/check.mjs --url http://127.0.0.1:8130/   # use an already running server
//   node check/check.mjs --no-phone      # skip the 390x844 pass
//
// Fails (exit 1) on: console errors, uncaught exceptions, failed or >=400 requests, requests
// to hosts other than own origin, the data site, the tile Worker, *.arcgisonline.com,
// photon.komoot.io, or github.com / objects.githubusercontent.com (download redirects);
// a visible load error when the catalogue is fine; or a missing load error when it is not.
// Screenshots go to screenshots/ (gitignored).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const PHONE = !argv.includes('--no-phone');
const urlArg = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;
const PORT = 8131;
const BASE = urlArg || `http://127.0.0.1:${PORT}/`;
const DATA = LIVE ? null : BASE + 'test/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => procs.forEach((p) => { try { p.kill(); } catch { /* */ } }));

async function waitHttp(url, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok) return; } catch { /* */ } await sleep(200); }
  throw new Error('timeout waiting for ' + url);
}
if (!urlArg) {
  const p = spawn('python3', ['dev-server.py', '--port', String(PORT), '--quiet'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  procs.push(p);
  await waitHttp(BASE + 'index.html');
}
if (!existsSync(CHROME)) { console.error('Chrome not found at', CHROME); process.exit(2); }
const dbgPort = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'tl-chrome-'))}`,
  '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'],
{ stdio: 'ignore' });
procs.push(chrome);
await waitHttp(`http://127.0.0.1:${dbgPort}/json/version`);
const targets = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0; const pending = new Map(); const handlers = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method) handlers.forEach((h) => h(m));
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

const problems = [];
const origin = new URL(BASE).origin;
const HOSTS = ['data.hyderabad.urbanobservatory.in', 'hulf-observatory.github.io', 'hyd-tiles.hulf-observatory.workers.dev',
  'photon.komoot.io', 'github.com', 'objects.githubusercontent.com'];
const allowed = (u) => {
  if (u.startsWith('data:') || u.startsWith('blob:') || u === 'about:blank') return true;
  const x = new URL(u);
  return x.origin === origin || HOSTS.includes(x.hostname) || x.hostname.endsWith('.arcgisonline.com');
};
let expectMissing = null;   // a URL prefix whose 404s are the point of the test
const reqs = new Map();
handlers.push((m) => {
  const p = m.params;
  const ignore = (u) => expectMissing && typeof u === 'string' && u.startsWith(expectMissing);
  if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) problems.push('console.' + p.type + ': ' + p.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.consoleAPICalled' && p.type === 'warning') console.log('  (warn)', p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && p.entry.level === 'error' && !ignore(p.entry.url)) problems.push('log: ' + p.entry.text + ' ' + (p.entry.url || ''));
  if (m.method === 'Network.requestWillBeSent') { reqs.set(p.requestId, p.request.url); if (!allowed(p.request.url)) problems.push('foreign host: ' + p.request.url); }
  if (m.method === 'Network.responseReceived' && p.response.status >= 400 && !ignore(p.response.url)) problems.push(`HTTP ${p.response.status}: ${p.response.url}`);
  if (m.method === 'Network.loadingFailed' && !p.canceled && !ignore(reqs.get(p.requestId))) problems.push(`failed: ${reqs.get(p.requestId)} ${p.errorText}`);
});
await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

async function waitFor(expr, ms = 25000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evaluate(expr).catch(() => false)) return true; await sleep(200); }
  console.error('problems so far:', problems);
  throw new Error('timeout: ' + expr);
}
// every map on screen has its style and tiles in (bounded: tile servers can be slow)
const idle = (expr = 'window.__tl.panes.map(p => p.map)') => evaluate(`new Promise(r => { const ms = ${expr}; let n = ms.length; if (!n) return r();
  const done = () => { if (--n <= 0) setTimeout(r, 400); }; ms.forEach(m => m.loaded() && m.areTilesLoaded() ? done() : m.once('idle', done)); setTimeout(r, 20000); })`);
mkdirSync(join(ROOT, 'screenshots'), { recursive: true });
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'screenshots', name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  shot', 'screenshots/' + name + '.png');
}
async function clickAt(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); }
async function clickSel(sel) {
  const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  await clickAt(r[0], r[1]);
}
const nav = async (url) => { await send('Page.navigate', { url }); await waitFor(`document.readyState === 'complete' && !!window.__tl`); };
const pageUrl = (data) => BASE + (data ? '?data=' + encodeURIComponent(data) : '');

// ---------------------------------------------------------------- grid
console.log('open', pageUrl(DATA));
await nav(pageUrl(DATA));
await waitFor(`window.__tl.panes.length >= 3 && document.getElementById('loadErr').hidden`);
await sleep(500); await idle();
const grid = JSON.parse(await evaluate(`JSON.stringify({ data: window.__tl.DATA_BASE, years: Object.keys(window.__tl.YEARS), panes: window.__tl.panes.map(p => p.entry.fixed ? p.entry.fixed.t : p.entry.year),
  off: document.querySelectorAll('.pane.off').length, loading: document.querySelectorAll('.loading-tag.on').length,
  heritage: document.querySelectorAll('#heritageList .row').length, tiles: window.__tl.panes.filter(p => !p.entry.fixed).map(p => p.map.getStyle().sources[Object.keys(p.map.getStyle().sources)[1]].tiles[0]) })`));
console.log('grid:', JSON.stringify(grid));
if (!grid.years.length) problems.push('no years from the catalogue');
if (grid.off && !LIVE) problems.push(`${grid.off} window(s) say "outside extent" over the test raster`);
if (grid.loading) problems.push(`${grid.loading} "Loading…" tag(s) still on after idle`);
if (grid.heritage < 10) problems.push(`heritage list has ${grid.heritage} rows`);
if (grid.tiles.some((t) => !/^https:\/\//.test(t))) problems.push('a tile URL is not absolute: ' + grid.tiles.join(' '));
await shot('grid');

// "Loading…" shows while tiles come in: slow the network, move every window to a new area, catch the tag on
await send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 40 * 1024, uploadThroughput: 40 * 1024 });
await evaluate(`window.__tl.panes[0].map.jumpTo({ center: [78.56, 17.32], zoom: 11.3 }); true`);
let sawLoading = false;
for (let i = 0; i < 60 && !sawLoading; i++) { sawLoading = (await evaluate(`document.querySelectorAll('.loading-tag.on').length`)) > 0; if (!sawLoading) await sleep(50); }
if (!sawLoading) problems.push('no "Loading…" tag appeared while tiles were loading');
else { await sleep(700); await shot('loading'); }
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await idle();
if (await evaluate(`document.querySelectorAll('.loading-tag.on').length`)) problems.push('"Loading…" tag still on after idle');
await evaluate(`window.__tl.panes[0].map.fitBounds([[78.4448,17.4080],[78.5022,17.4440]], { padding: 8, duration: 0 }); true`);
await idle();

// ⓘ on the first year window: source, licence and the PMTiles download
await clickSel('.pane .inf');
await waitFor(`!!document.querySelector('.pane .infopop:not([hidden]) .item')`, 3000);
const info = JSON.parse(await evaluate(`JSON.stringify({ text: document.querySelector('.pane .infopop:not([hidden])').innerText, dl: (document.querySelector('.pane .infopop:not([hidden]) a.dl') || {}).href || '' })`));
console.log('info:', info.text.replace(/\n/g, ' | '));
// downloads are switched off for now (SHOW_DOWNLOADS in index.html); the popover must still name the layer
if (!info.text || !info.text.trim()) problems.push('info popover is empty');
if (!/licen|CC |©/i.test(info.text) && !LIVE) problems.push('info popover shows no licence');
await shot('info');
await clickAt(700, 870);   // outside: closes it
await waitFor(`!document.querySelector('.pane .infopop:not([hidden])')`, 3000);

// ---------------------------------------------------------------- time slider
await clickSel('#modes button[data-mode="time"]');
await waitFor(`!!window.__tl.T.map`);
await sleep(500); await idle('[window.__tl.T.map]');
const tl = JSON.parse(await evaluate(`JSON.stringify({ stops: [...document.querySelectorAll('#tstops button')].map(b => b.textContent), lab: document.getElementById('tlab').textContent, val: document.getElementById('tval').textContent })`));
console.log('time:', JSON.stringify(tl));
if (tl.stops.length < 2) problems.push('time slider has fewer than 2 stops');
await clickSel('#tnext'); await sleep(300); await idle('[window.__tl.T.map]');
await shot('time');

// ---------------------------------------------------------------- map slider
await clickSel('#modes button[data-mode="swipe"]');
await waitFor(`!!window.__tl.S.a && !!window.__tl.S.b`);
await sleep(500); await idle('[window.__tl.S.a, window.__tl.S.b]');
const sw = JSON.parse(await evaluate(`JSON.stringify({ a: document.getElementById('svalA').textContent, b: document.getElementById('svalB').textContent })`));
console.log('swipe:', JSON.stringify(sw));
await clickSel('#sinfA');
await waitFor(`!!document.querySelector('#sinfoA:not([hidden]) .item')`, 3000);
await shot('swipe');
await clickAt(700, 870);

// ---------------------------------------------------------------- phone
if (PHONE) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(pageUrl(DATA));
  await waitFor(`window.__tl.panes.length >= 3 && document.getElementById('loadErr').hidden`);
  await sleep(600); await idle();
  const ph = JSON.parse(await evaluate(`JSON.stringify({ dots: document.querySelectorAll('#dots i').length, sheet: getComputedStyle(document.getElementById('places')).position })`));
  console.log('phone:', JSON.stringify(ph));
  if (ph.sheet !== 'fixed') problems.push('phone: the side panel is not a bottom sheet');
  await shot('phone');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}

// ---------------------------------------------------------------- the catalogue is missing
expectMissing = BASE + 'missing/';
await nav(pageUrl(expectMissing));
await waitFor(`!document.getElementById('loadErr').hidden`, 10000);
const err = await evaluate(`document.getElementById('loadErr').innerText`);
console.log('error card:', err.replace(/\n/g, ' | '));
if (!/HTTP 404/.test(err)) problems.push('error card does not name the HTTP status');
await shot('error');
expectMissing = null;

console.log(problems.length ? `\n${problems.length} problem(s):\n  ` + problems.join('\n  ') : '\nall good');
process.exit(problems.length ? 1 : 0);
