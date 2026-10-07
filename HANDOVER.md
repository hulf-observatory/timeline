# City Timeline: handover notes

What it is: one static page comparing Hyderabad's archive maps, toposheets, satellite images and
the 2031 land use plans over time (grid of synced maps, time slider, map slider; swipe and compare
on the phone). Details and how to run it: `README.md`.

## Hosting

- **Page:** this repo on GitHub Pages, https://hulf-observatory.github.io/timeline/. Deploy = push
  to `main`. Nothing to install, no server, no nginx, no tile proxy.
- **Data:** read from the open-data site `hulf-observatory/hyderabad-data` (GitHub Pages for the
  catalogue and small files, GitHub Releases through the `hyd-tiles` Cloudflare Worker for raster
  tiles). The page knows one address, `DATA_BASE`, at the top of its script. Publishing a new data
  release does not need a change here unless the scheme itself changes.
- **Heritage list:** `heritage.json` lives in the data repo; `tools/heritage.py` rebuilds it when
  the GHMC source changes (see README).

## Known limits

1. **Place search** asks Photon (komoot's public OpenStreetMap geocoder) from the visitor's browser,
   from 3 characters, with the typed text only. If Photon is unreachable the observatory's own
   areas and heritage list still work ("Place search unavailable" under them). If komoot objects
   to the traffic, host an instance or drop the OSM part.
2. **Basemap and satellite** come from Esri's public tile servers (same as the maps viewer).
3. **Time slider** is desktop only; the phone has Swipe and Compare.
4. The Worker runs on Cloudflare's free plan (100,000 tile requests a day).

## Main site

The site's City Timeline card and the waterscapes story link should point at
https://hulf-observatory.github.io/timeline/ (earlier plans used /timeline/ on the main site's
host; that path no longer exists).
