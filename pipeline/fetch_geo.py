"""Fetch Census cartographic boundary files for Alaska."""

from __future__ import annotations

from common import RAW, get

BASE = "https://www2.census.gov/geo/tiger/GENZ2023/shp/"
FILES = {
    "county": "cb_2023_us_county_500k.zip",
    "place": "cb_2023_02_place_500k.zip",
    "state": "cb_2023_us_state_500k.zip",
}
# Roads + rail for the Upper Su locator map (TIGER primary/secondary roads, rail).
TIGER = {
    "roads": "https://www2.census.gov/geo/tiger/TIGER2023/PRISECROADS/tl_2023_02_prisecroads.zip",
    "rail": "https://www2.census.gov/geo/tiger/TIGER2023/RAILS/tl_2023_us_rails.zip",
    "water": "https://www2.census.gov/geo/tiger/TIGER2023/AREAWATER/tl_2023_02170_areawater.zip",
    "linearwater": "https://www2.census.gov/geo/tiger/TIGER2023/LINEARWATER/tl_2023_02170_linearwater.zip",
}
DEST = RAW / "geo"


def main() -> None:
    for name, f in FILES.items():
        print(name, get(BASE + f, DEST / f))
    for name, url in TIGER.items():
        print(name, get(url, DEST / url.rsplit("/", 1)[1]))


if __name__ == "__main__":
    main()
