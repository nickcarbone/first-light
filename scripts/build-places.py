#!/usr/bin/env python3
"""Build data/places.json from Natural Earth's 10m populated places.

Run once (or whenever you want to change the place list):
    python3 scripts/build-places.py path/to/ne_10m_populated_places.geojson

Source: https://github.com/nvkelso/natural-earth-vector (public domain).
Keeps every national capital plus places of scale rank 5 or better, which
gives roughly 1,100 well-spread places. Places Natural Earth gives no time
zone borrow the zone of the nearest place that has one.
"""
import json
import math
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "data" / "places.json"

features = json.loads(src.read_text())["features"]
rows = []
for f in features:
    p = f["properties"]
    if not (p["SCALERANK"] <= 5 or p["ADM0CAP"] == 1):
        continue
    iso = p.get("ISO_A2") or ""
    if iso in ("-99", None):
        iso = ""
    rows.append({
        "id": int(p["NE_ID"]),
        "name": p["NAME"],
        "country": p["ADM0NAME"],
        "iso": iso,
        "lat": round(float(p["LATITUDE"]), 4),
        "lon": round(float(p["LONGITUDE"]), 4),
        "tz": p.get("TIMEZONE") or "",
        "pop": int(p.get("POP_MAX") or 0),
    })


def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


with_tz = [r for r in rows if r["tz"]]
for r in rows:
    if not r["tz"]:
        r["tz"] = min(with_tz, key=lambda o: dist(r, o))["tz"]

rows.sort(key=lambda r: r["lon"])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "source": "Natural Earth 10m populated places (public domain)",
    "count": len(rows),
    "places": rows,
}, ensure_ascii=False, separators=(",", ":")))
print(f"wrote {len(rows)} places to {out}")
