"""Package report/ as a standalone static site in dist/ (for Vercel or any static host).

The artifact version of report/index.html has no <!doctype>/<html>/<head>, because the
artifact host wraps it. Here we add that wrapper so the page renders in standards mode.
"""

from __future__ import annotations

import shutil

from common import ROOT

SRC = ROOT / "report"
DIST = ROOT / "dist"


def main() -> None:
    # Keep the Vercel project link (dist/.vercel) across rebuilds.
    if DIST.exists():
        for p in DIST.iterdir():
            if p.name != ".vercel":
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    shutil.copytree(SRC, DIST, dirs_exist_ok=True)
    page = (SRC / "index.html").read_text(encoding="utf-8")
    head_end = page.index("</style>") + len("</style>")
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        + page[:head_end]
        + "\n</head>\n<body>\n"
        + page[head_end:]
        + "\n</body>\n</html>\n"
    )
    (DIST / "index.html").write_text(html, encoding="utf-8")
    (DIST / "vercel.json").write_text(
        '{\n  "headers": [\n    {"source": "/(data|geo)/(.*)", "headers": '
        '[{"key": "Cache-Control", "value": "public, max-age=0, must-revalidate"}]}\n  ]\n}\n'
    )
    n = sum(1 for p in DIST.rglob("*") if p.is_file())
    print(f"dist/: {n} files")


if __name__ == "__main__":
    main()
