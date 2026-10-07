# City Timeline

Compare Hyderabad's archive maps, satellite imagery, toposheets and the 2031 proposed land use
over time: a grid of synced map windows, a time slider, and a map slider. Rasters only.

Live at **https://hulf-observatory.github.io/timeline/** (GitHub Pages, this repo's `main`).
One static page (`index.html`) plus `place-search.js` and `vendor/` (MapLibre GL 5.24, fonts).
No server, no build step.

## Where the data comes from

Everything the page shows is open data addressed as in
`observatory-work/notes/open-data-scheme.md`:

| What | From |
|---|---|
| `layers.json` (the catalogue), `nav/areas.json` (search areas), `heritage.json` | `DATA_BASE` = https://hulf-observatory.github.io/hyderabad-data/ (GitHub Pages) |
| Raster tiles | each layer's absolute `tile_url` on the Worker, https://hyd-tiles.hulf-observatory.workers.dev/r/<release>/<id>/{z}/{x}/{y}.webp |
| Downloads | each layer's `download.pmtiles` (Worker → 302 to the GitHub Release) |
| Basemap and satellite | Esri public tile servers |
| Place search | Photon (komoot's public OpenStreetMap geocoder); the observatory's areas and heritage list work without it |

`DATA_BASE` is one constant at the top of the script in `index.html`. `?data=<url>/` overrides it
for testing. `layers.json` is fetched with `cache: no-cache`; tiles are versioned by the release
tag in their URL, so nothing appends `?v=`.

What the timeline takes from the catalogue: raster layers in the groups `archive_maps`,
`archive_imagery`, `toposheets` and `landuse` with `display` not false; the year is the first four
digits of the title (land use is dated 2031). One entry per year; a window shows the map covering
most of its frame, adjacent sheets join, overlapping ones are never stacked. Left out by constants
near the top of the script: the 1854 plans (`SKIP_YEARS`), the 1954 NE44 city detail
(`SKIP_LAYERS`); off at launch: 1911, 1954, 1956, 2031 (`LAUNCH_SKIP`).

Each window has a ⓘ with the maps in view, their source, licence and a PMTiles download, and shows
"Loading…" while its tiles come in. If the catalogue cannot be fetched the page says so.

## Run locally

    python3 dev-server.py              # http://127.0.0.1:8130/  (reads the live data)
    # or: python3 -m http.server 8130

Against the small test catalogue in `test/` (three fake years drawn from the Worker's synthetic
test raster, plus the real areas and heritage lists):

    http://127.0.0.1:8130/?data=http://127.0.0.1:8130/test/

## Check

    node check/check.mjs            # headless Chrome against test/; screenshots in screenshots/
    node check/check.mjs --live     # against the real catalogue

Needs Google Chrome in /Applications and Node 22+. Fails on console errors, failed requests,
requests to hosts outside the data site / Worker / Esri / Photon, a window saying "outside extent"
over the test raster, or a missing error card when the catalogue is absent.

## Deploy

Push to `main`; GitHub Pages serves the repo root (`.nojekyll` keeps `vendor/` and dotfiles as
they are). Data updates happen in `hulf-observatory/hyderabad-data`; the page picks up a new
`layers.json` on the next visit.

## Optional: the heritage list

`tools/heritage.py` builds `heritage.json` for the data repository from the GHMC heritage
buildings GeoPackage (read-only; stdlib only). Only needed when that source changes:

    python3 tools/heritage.py --out ../hyderabad-data/heritage.json

## Place search module

`place-search.js` is a byte-identical copy of the maps viewer's module (also used by the
Accessibility Atlas). Edit it in the viewer and copy it here.

## Licence

MIT (code). The maps themselves carry their own licences, shown in each window's ⓘ.
