"""Fetch PFD payment history and CFEC commercial-fishing pages."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from common import BOROUGHS, RAW, get

PFD_URL = (
    "https://pfd.alaska.gov/Division-Info/summary-of-dividend-applications-payments"
)
CFEC = "https://www.cfec.state.ak.us/gpbycen/{y}/{p}.htm"
CFEC_YEAR = 2023  # latest year published as of this build
# Statewide residency splits + Upper Su communities (Talkeetna, Trapper Creek, Willow)
CFEC_PAGES = [
    "00_ALL",
    "00_AK",
    "00_WA",
    "00_OR",
    "00_CA",
    "00_Oth",
    "170421",
    "170423",
    "170425",
]
BROWSER_UA = {"User-Agent": "Mozilla/5.0"}


def main() -> None:
    get(PFD_URL, RAW / "pfd" / "summary.html", headers=BROWSER_UA)
    pages = CFEC_PAGES + [f[2:] for f in BOROUGHS]
    jobs = [
        (CFEC.format(y=CFEC_YEAR, p=p), RAW / "cfec" / f"{CFEC_YEAR}_{p}.htm")
        for p in pages
    ]
    # Statewide resident totals over time, for a trend line.
    jobs += [
        (CFEC.format(y=y, p="00_AK"), RAW / "cfec" / f"{y}_00_AK.htm")
        for y in range(2000, CFEC_YEAR)
    ]

    def one(j):
        try:
            get(*j, headers=BROWSER_UA)
        except Exception as e:  # noqa: BLE001
            return f"FAIL {j[0]}: {e}"

    with ThreadPoolExecutor(6) as ex:
        fails = [m for m in ex.map(one, jobs) if m]
    print(f"{len(jobs)} CFEC pages, {len(fails)} failures", *fails, sep="\n")


if __name__ == "__main__":
    main()
