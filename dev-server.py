#!/usr/bin/env python3
"""Static server for working on City Timeline locally (stdlib only).

  python3 dev-server.py [--port 8130] [--quiet]      # http://127.0.0.1:8130/

Serves this folder, nothing else. The page reads its data (layers.json, nav/areas.json,
heritage.json) from the open-data site on GitHub Pages; to use the small test catalogue in
test/ instead, open

  http://127.0.0.1:8130/?data=http://127.0.0.1:8130/test/

`python3 -m http.server` does the same job; this adds CORS and no-cache headers so a page
served from another port can read test/ as if it were the data site.
"""
import argparse, http.server, os

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8130)
ap.add_argument("--quiet", action="store_true")
args = ap.parse_args()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        if not args.quiet:
            super().log_message(*a)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


print(f"timeline: http://127.0.0.1:{args.port}/   (test data: ?data=http://127.0.0.1:{args.port}/test/)", flush=True)
Server(("127.0.0.1", args.port), Handler).serve_forever()
