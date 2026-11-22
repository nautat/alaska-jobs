"""Run the whole pipeline: fetch raw data (cached), then build report JSON.

uv run python pipeline/build.py            # use cached downloads
uv run python pipeline/build.py --build    # skip fetch steps
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
FETCH = [
    "fetch_acs",
    "fetch_qcew",
    "fetch_bea",
    "fetch_zbp",
    "fetch_geo",
    "fetch_extras",
]
BUILD = ["build_geo", "build_boroughs", "build_trends", "build_uppersu"]


def run(step: str) -> None:
    print(f"── {step}", flush=True)
    subprocess.run(
        [sys.executable, str(HERE / f"{step}.py")], check=True, cwd=HERE.parent
    )


def main() -> None:
    steps = BUILD if "--build" in sys.argv else FETCH + BUILD
    for s in steps:
        run(s)
    print("done → report/")


if __name__ == "__main__":
    main()
