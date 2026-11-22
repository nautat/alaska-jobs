"""Stream ACS 5-year table-based summary files and keep only Alaska (+US) rows.

The Census API now needs a key, so we use the bulk files on www2.census.gov.
Each table file covers every US geography; we filter while streaming.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import requests
from common import RAW, UA

YEAR = 2024
BASE = (
    f"https://www2.census.gov/programs-surveys/acs/summary_file/{YEAR}/"
    f"table-based-SF/data/5YRData/acsdt5y{YEAR}-{{t}}.dat"
)
TABLES = [
    "b01003",  # total population
    "b23025",  # employment status
    "c24030",  # industry by sex (civilian employed 16+)
    "c24010",  # occupation by sex
    "b24080",  # class of worker by sex
    "b19013",  # median household income
    "b19301",  # per capita income
    "b19052",  # households with wage income
    "b19053",  # households with self-employment income
    "b19054",  # households with interest/dividend/rent income
    "b19055",  # households with Social Security income
    "b19056",  # households with SSI
    "b19057",  # households with public assistance income
    "b19059",  # households with retirement income
    "b25001",  # total housing units
    "b25004",  # vacancy status (seasonal/recreational homes)
]
KEEP = re.compile(
    rb"^(GEO_ID|0100000US\||0400000US02\||0500000US02|1600000US02|860Z200US99(676|683|688)\|)"
)
DEST = RAW / "acs"


def fetch(table: str) -> str:
    dest = DEST / f"{table}_ak.dat"
    if dest.exists() and dest.stat().st_size > 0:
        return f"{table}: cached"
    url = BASE.format(t=table)
    n = 0
    with requests.get(url, headers=UA, stream=True, timeout=300) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        with tmp.open("wb") as f:
            for line in r.iter_lines():
                if KEEP.match(line):
                    f.write(line + b"\n")
                    n += 1
        tmp.rename(dest)
    return f"{table}: {n} rows"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(6) as ex:
        for msg in ex.map(fetch, TABLES):
            print(msg)


if __name__ == "__main__":
    main()
