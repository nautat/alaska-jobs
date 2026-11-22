"""Fetch BLS QCEW open-data CSV slices (API covers 2014 onward)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from common import BOROUGHS, RAW, RETIRED, get

API = "https://data.bls.gov/cew/data/api/{y}/{p}/area/{a}.csv"
DEST = RAW / "qcew"
LATEST = 2025  # newest statewide data (2025 annual has heavy suppression)
SNAP = 2024  # complete snapshot year used for borough detail
YEARS = range(2014, LATEST + 1)
AREAS = ["02000", "US000", *BOROUGHS]


def jobs():
    # Annual detail for every area, latest year and a 2014 baseline.
    for y in (2014, 2019, SNAP):
        for a in AREAS:
            yield API.format(y=y, p="a", a=a), DEST / f"{y}_a_{a}.csv"
    for y in (2014, 2019):  # retired codes, for the 2014-2024 borough comparison
        for a in RETIRED:
            yield API.format(y=y, p="a", a=a), DEST / f"{y}_a_{a}.csv"
    # Statewide annual each year (industry trends) and quarterly (monthly jobs).
    for y in YEARS:
        yield API.format(y=y, p="a", a="02000"), DEST / f"{y}_a_02000.csv"
        for q in range(1, 5):
            yield API.format(y=y, p=q, a="02000"), DEST / f"{y}_{q}_02000.csv"
    # Borough quarterly for the last three years (seasonal swing by borough).
    for y in range(SNAP - 2, SNAP + 1):
        for q in range(1, 5):
            for a in BOROUGHS:
                yield API.format(y=y, p=q, a=a), DEST / f"{y}_{q}_{a}.csv"


def fetch(job):
    url, dest = job
    try:
        get(url, dest)
        return None
    except Exception as e:  # noqa: BLE001
        return f"FAIL {url}: {e}"


def main() -> None:
    todo = list(dict.fromkeys(jobs()))
    with ThreadPoolExecutor(8) as ex:
        fails = [m for m in ex.map(fetch, todo) if m]
    print(f"{len(todo)} files, {len(fails)} failures")
    for m in fails:
        print(m)


if __name__ == "__main__":
    main()
