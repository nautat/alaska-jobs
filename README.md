# How Alaska Makes a Living

An interactive report on Alaska's jobs and income, with a deep dive on Talkeetna and the Upper Susitna Valley.

## Rebuild

```bash
uv run python pipeline/build.py            # fetch (cached in data/raw/) + build
uv run python pipeline/build.py --build    # rebuild JSON from cached downloads only
```

## Preview

```bash
python3 -m http.server 8811 --directory report
```

Then open http://localhost:8811.

## Deploy (Vercel)

Live at https://alaska-jobs.vercel.app (project `alaska-jobs`).

```bash
uv run python pipeline/package_web.py   # report/ → dist/ (adds the full HTML wrapper)
cd dist && vercel deploy --prod --yes
```

## Layout

- `pipeline/fetch_*.py` downloads public data into `data/raw/`. Sources:
  - BLS QCEW
  - Census ACS bulk files
  - BEA regional tables
  - Census ZIP Business Patterns
  - Census boundaries
  - CFEC fishing statistics
  - PFD history
- `pipeline/build_*.py` turns the raw files into `report/data/*.json` and `report/geo/*.topo.json`. `pipeline/SCHEMA.md` describes those files.
- `report/index.html` + `report/js/core.js` are the page shell and shared chart helpers. Each `report/js/sec_*.js` file draws one section.
