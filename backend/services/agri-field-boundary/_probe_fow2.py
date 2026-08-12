import os
os.environ["FOW_ADMIN_ISO"] = "FR"
from fow_aoi import fetch_fow_via_duckdb

west, south, east, north = 3.95, 48.55, 4.05, 48.62
try:
    geoms, meta = fetch_fow_via_duckdb(west, south, east, north)
    print("count", len(geoms), "meta", meta)
except Exception as e:
    print("FAIL", type(e).__name__, str(e)[:500])
