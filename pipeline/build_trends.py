"""Build report/data/seasonal.json and report/data/trends.json (see SCHEMA.md)."""

from __future__ import annotations

import math
import re

import pandas as pd
from common import BOROUGHS, RAW, SPOTLIGHT, SUPERSECTORS, write_json

QCEW = RAW / "qcew"
BEA = RAW / "bea"
CFEC = RAW / "cfec"

STATE_YEARS = range(2014, 2026)
MATSU_YEARS = range(2022, 2025)
BEA_EMP_YEARS = range(2001, 2023)
INCOME_YEARS = range(2001, 2025)
TRANSFER_YEARS = range(2001, 2023)
BOROUGH_YEARS = range(2010, 2023)
CFEC_YEARS = range(2000, 2024)

BEA_SECTORS = {
    "100": "Fishing & forestry",
    "200": "Mining, oil & gas",
    "300": "Utilities",
    "400": "Construction",
    "500": "Manufacturing",
    "600": "Wholesale trade",
    "700": "Retail trade",
    "800": "Transportation & warehousing",
    "900": "Information",
    "1000": "Finance & insurance",
    "1100": "Real estate",
    "1200": "Professional & technical",
    "1300": "Management of companies",
    "1400": "Admin & waste services",
    "1500": "Educational services",
    "1600": "Health care & social assistance",
    "1700": "Arts & recreation",
    "1800": "Accommodation & food",
    "1900": "Other services",
}


# ---------- helpers ----------
def clean(v):
    """Convert numpy/pandas scalars to JSON-safe Python values (NaN -> None)."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float):
        return None if math.isnan(v) else (int(v) if v.is_integer() else round(v, 4))
    if hasattr(v, "item"):
        return clean(v.item())
    return v


def read_qcew(year: int, period, area: str) -> pd.DataFrame:
    df = pd.read_csv(
        QCEW / f"{year}_{period}_{area}.csv",
        dtype={"area_fips": str, "industry_code": str, "disclosure_code": str},
    )
    df["sup"] = df["disclosure_code"].fillna("").str.strip().eq("N")
    return df


def qrow(df: pd.DataFrame, own: int, ind: str):
    r = df[(df.own_code == own) & (df.industry_code == ind)]
    if r.empty or bool(r.iloc[0]["sup"]):
        return None
    return r.iloc[0]


def monthly(df: pd.DataFrame, own: int, ind: str) -> list:
    r = qrow(df, own, ind)
    if r is None:
        return [None, None, None]
    return [clean(r[f"month{i}_emplvl"]) for i in (1, 2, 3)]


def read_bea(name: str) -> pd.DataFrame:
    path = next(BEA.glob(f"{name}_AK_*.csv"))
    df = pd.read_csv(path, dtype=str, encoding="latin-1")
    df.columns = [c.strip() for c in df.columns]
    df = df[df["LineCode"].notna()].copy()
    df["fips"] = df["GeoFIPS"].str.strip().str.strip('"').str.strip()
    df["line"] = df["LineCode"].str.strip()
    df = df[df["fips"].str.fullmatch(r"\d{5}")]
    return df


def bea_num(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    s = str(x).strip()
    if s.startswith("("):
        return None
    try:
        return clean(float(s))
    except ValueError:
        return None


def bea_series(df: pd.DataFrame, fips: str, line: str, years) -> list:
    r = df[(df.fips == fips) & (df.line == line)]
    if r.empty:
        return [None for _ in years]
    r = r.iloc[0]
    return [bea_num(r.get(str(y))) for y in years]


def num(s):
    if s is None:
        return None
    s = str(s).strip().replace("$", "").replace(",", "").replace("%", "")
    if s in ("", "X", "nan", "NaN"):
        return None
    try:
        return clean(float(s))
    except ValueError:
        return None


def cfec_groups(path) -> dict:
    """Return {group: {holders, permits, fishermen, permits_fished, pounds, earnings}}."""
    out = {}
    for t in pd.read_html(path):
        if t.shape[1] != 8:
            continue
        t = t.copy()
        t[0] = t[0].ffill()
        for _, row in t[t[1].astype(str).str.contains("Group Total")].iterrows():
            g = re.sub(r"\s*\(con't\)", "", str(row[0])).strip()
            out[g] = {
                "holders": num(row[2]),
                "permits": num(row[3]),
                "fishermen": num(row[4]),
                "permits_fished": num(row[5]),
                "pounds": num(row[6]),
                "earnings": num(row[7]),
            }
    return out


# ---------- seasonal ----------
def build_seasonal() -> dict:
    codes = list(SUPERSECTORS)
    state = {
        "months": [],
        "total": [],
        "gov": [],
        "supersectors": {c: [] for c in codes},
    }
    for y in STATE_YEARS:
        for q in range(1, 5):
            df = read_qcew(y, q, "02000")
            state["months"] += [f"{y}-{3 * (q - 1) + i:02d}" for i in (1, 2, 3)]
            state["total"] += monthly(df, 0, "10")
            govs = [monthly(df, o, "10") for o in (1, 2, 3)]
            state["gov"] += [
                None if any(g[i] is None for g in govs) else sum(g[i] for g in govs)
                for i in range(3)
            ]
            for c in codes:
                state["supersectors"][c] += monthly(df, 5, c)

    matsu = {"months": [], "total": [], "supersectors": {c: [] for c in codes}}
    for y in MATSU_YEARS:
        for q in range(1, 5):
            df = read_qcew(y, q, "02170")
            matsu["months"] += [f"{y}-{3 * (q - 1) + i:02d}" for i in (1, 2, 3)]
            matsu["total"] += monthly(df, 0, "10")
            for c in codes:
                matsu["supersectors"][c] += monthly(df, 5, c)
    return {"labels": SUPERSECTORS, "state": state, "matsu": matsu}


# ---------- trends ----------
def build_trends() -> dict:
    emp = read_bea("CAEMP25N")
    yrs = list(BEA_EMP_YEARS)
    bea_emp = {
        "years": yrs,
        "total": bea_series(emp, "02000", "10", yrs),
        "wage_salary": bea_series(emp, "02000", "20", yrs),
        "proprietors": bea_series(emp, "02000", "40", yrs),
        "sectors": {
            lab: bea_series(emp, "02000", ln, yrs) for ln, lab in BEA_SECTORS.items()
        },
        "gov": {
            "federal_civilian": bea_series(emp, "02000", "2001", yrs),
            "military": bea_series(emp, "02000", "2002", yrs),
            "state_local": bea_series(emp, "02000", "2010", yrs),
        },
    }

    syrs = list(STATE_YEARS)
    annual = {y: read_qcew(y, "a", "02000") for y in syrs}
    series = {}
    for code, label in SPOTLIGHT.items():
        jobs, pay = [], []
        for y in syrs:
            r = qrow(annual[y], 5, code)
            jobs.append(None if r is None else clean(r["annual_avg_emplvl"]))
            pay.append(None if r is None else clean(r["avg_annual_pay"]))
        series[code] = {"label": label, "jobs": jobs, "pay": pay}
    qcew_spot = {"years": syrs, "series": series}

    inc = read_bea("CAINC4")
    iyrs = list(INCOME_YEARS)
    lines = {
        "wages": "50",
        "supplements": "60",
        "proprietors": "70",
        "dir": "46",
        "transfers": "47",
        "contributions": "36",
        "residence_adj": "42",
    }
    income = {
        "years": iyrs,
        "per_capita": bea_series(inc, "02000", "30", iyrs),
        "personal_income_k": bea_series(inc, "02000", "10", iyrs),
        "components_k": {
            k: bea_series(inc, "02000", ln, iyrs) for k, ln in lines.items()
        },
    }

    tr = read_bea("CAINC35")
    tyrs = list(TRANSFER_YEARS)
    tlines = {
        "social_security_k": "2110",
        "medicare_k": "2210",
        "medicaid_k": "2220",
        "income_maint_k": "2300",
        "veterans_k": "2500",
        "other_gov_k": "2700",
        "total_k": "1000",
    }
    transfers = {
        "years": tyrs,
        **{k: bea_series(tr, "02000", ln, tyrs) for k, ln in tlines.items()},
    }

    # PFD history
    t = pd.read_html(RAW / "pfd" / "summary.html")[0]
    t.columns = [" ".join(str(c).split()) for c in t.iloc[0]]
    t = t.iloc[1:]
    pfd = []
    for _, r in t.iterrows():
        yr = str(r["Dividend Year"]).strip()
        if not yr.isdigit():
            continue
        pfd.append(
            {
                "year": int(yr),
                "amount": num(r["Dividend Amount"]),
                "disbursed": num(r["Total Disbursed Amount"]),
                "recipients": num(r["Applications Paid"]),
            }
        )
    pfd.sort(key=lambda d: d["year"])

    # CFEC
    cyrs = list(CFEC_YEARS)
    res = {"years": cyrs, "holders": [], "fishermen": [], "earnings": []}
    for y in cyrs:
        g = cfec_groups(CFEC / f"{y}_00_AK.htm").get("All Fisheries Combined", {})
        for k in ("holders", "fishermen", "earnings"):
            res[k].append(g.get(k))
    g23 = cfec_groups(CFEC / "2023_00_AK.htm")
    groups = [
        {"group": k, **{f: v[f] for f in ("holders", "fishermen", "earnings")}}
        for k, v in g23.items()
        if k != "All Fisheries Combined"
    ]
    groups.sort(key=lambda d: -(d["earnings"] or 0))
    residency = []
    for page, who in [
        ("00_AK", "Alaska"),
        ("00_WA", "Washington"),
        ("00_OR", "Oregon"),
        ("00_CA", "California"),
        ("00_Oth", "Other states & countries"),
    ]:
        a = cfec_groups(CFEC / f"2023_{page}.htm").get("All Fisheries Combined", {})
        residency.append(
            {"who": who, **{f: a.get(f) for f in ("holders", "fishermen", "earnings")}}
        )

    # Borough employment (BEA total incl. proprietors)
    byrs = list(BOROUGH_YEARS)
    bser = {}
    for f in BOROUGHS:
        if f in ("02063", "02066"):
            continue
        bser[f] = bea_series(emp, f, "10", byrs)
    vc = bea_series(emp, "02261", "10", byrs)
    ch = bea_series(emp, "02063", "10", byrs)
    cr = bea_series(emp, "02066", "10", byrs)
    bser["valdez-cordova"] = [
        v if v is not None else (a + b if a is not None and b is not None else None)
        for v, a, b in zip(vc, ch, cr, strict=True)
    ]

    return {
        "bea_emp": bea_emp,
        "qcew_spot": qcew_spot,
        "income": income,
        "transfers": transfers,
        "pfd": pfd,
        "cfec_resident": res,
        "cfec_groups": {"year": 2023, "rows": groups},
        "cfec_residency": {"year": 2023, "rows": residency},
        "borough_emp": {"years": byrs, "series": bser},
    }


def main() -> None:
    seasonal = build_seasonal()
    trends = build_trends()

    # Sanity checks
    pfd22 = next(p for p in trends["pfd"] if p["year"] == 2022)
    assert pfd22["amount"] == 3284, pfd22
    i22 = trends["bea_emp"]["years"].index(2022)
    assert trends["bea_emp"]["total"][i22] == 457687, trends["bea_emp"]["total"][i22]
    assert len(seasonal["state"]["months"]) == 12 * len(STATE_YEARS)
    assert all(v is not None for v in trends["borough_emp"]["series"]["valdez-cordova"])

    p1 = write_json("seasonal.json", seasonal)
    p2 = write_json("trends.json", trends)
    for p in (p1, p2):
        print(p.relative_to(p.parents[2]), f"{p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
