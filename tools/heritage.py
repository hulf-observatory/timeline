#!/usr/bin/env python3
"""Optional: build heritage.json (the Places panel's heritage list) for the data repository.

  python3 tools/heritage.py [--src <Heritage Buildings.gpkg>] [--out heritage.json]

Reads the GHMC heritage buildings GeoPackage (read-only) and writes
[{name, ward, zone, c:[lng,lat]}], sorted by zone then name. The app does not read this file
from here: it goes into the open-data repository (hulf-observatory/hyderabad-data) as
`heritage.json` at its root, where the page fetches it from DATA_BASE.
Names, wards and zones come UPPERCASE in the source; they are title-cased here.
Only needed when the heritage source changes. Stdlib only (sqlite3 reads the .gpkg).
"""
import argparse, json, os, re, sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.normpath(os.path.join(HERE, "..", "..", "observatory-data", "Spatial_Data_Repositoy", "Vector",
                                            "GHMC Public Amenities", "Heritage Buildings.gpkg"))
ap = argparse.ArgumentParser()
ap.add_argument("--src", default=DEFAULT_SRC, help="Heritage Buildings.gpkg (default: the observatory-data checkout beside this repo)")
ap.add_argument("--out", default="heritage.json", help="where to write (default: ./heritage.json)")
args = ap.parse_args()


def title(s):
    s = re.sub(r"\s+", " ", s.strip()).lower()
    return re.sub(r"(^|[\s(/&-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), s)


db = sqlite3.connect(f"file:{args.src}?mode=ro", uri=True)
rows = db.execute('select "Assessor A", "Wardno Nam", "Zone", "Longitude", "Latitude" from "Heritage Buildings"')
out = [{"name": title(n), "ward": title(w.split("-", 1)[-1]), "zone": title(z), "c": [round(x, 6), round(y, 6)]}
       for n, w, z, x, y in rows]
out.sort(key=lambda h: (h["zone"], h["name"]))
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
with open(args.out, "w") as f:
    json.dump(out, f, indent=0)
print(f"{len(out)} heritage buildings -> {args.out}")
