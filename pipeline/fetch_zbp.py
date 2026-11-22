"""Fetch Census ZIP Business Patterns (2023) and keep Upper Su ZIP codes."""

from __future__ import annotations

import io
import zipfile

import pandas as pd
from common import RAW, UPPER_SU_ZIPS, get

DEST = RAW / "zbp"


def main() -> None:
    for kind in ("detail", "totals"):
        z = get(
            f"https://www2.census.gov/programs-surveys/cbp/datasets/2023/zbp23{kind}.zip",
            DEST / f"zbp23{kind}.zip",
        )
        with zipfile.ZipFile(z) as zf:
            name = zf.namelist()[0]
            df = pd.read_csv(io.BytesIO(zf.read(name)), dtype=str, encoding="latin-1")
        df.columns = [c.lower() for c in df.columns]
        keep = df[df["zip"].isin(UPPER_SU_ZIPS)]
        keep.to_csv(DEST / f"zbp23{kind}_uppersu.csv", index=False)
        print(kind, len(keep), "rows")


if __name__ == "__main__":
    main()
