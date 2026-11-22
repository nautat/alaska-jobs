"""Fetch BEA regional county tables (bulk zips, no key) and keep the Alaska CSVs."""

from __future__ import annotations

import zipfile

from common import RAW, get

TABLES = ["CAINC4", "CAINC5N", "CAEMP25N", "CAINC35"]
DEST = RAW / "bea"


def main() -> None:
    for t in TABLES:
        z = get(f"https://apps.bea.gov/regional/zip/{t}.zip", DEST / f"{t}.zip")
        with zipfile.ZipFile(z) as zf:
            names = [n for n in zf.namelist() if f"{t}_AK_" in n or "__ALL_AREAS" in n]
            ak = [n for n in names if "_AK_" in n]
            for n in ak:
                (DEST / n).write_bytes(zf.read(n))
            print(t, ak)


if __name__ == "__main__":
    main()
