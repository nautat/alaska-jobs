"""Build report/data/overview.json and report/data/boroughs.json (see SCHEMA.md)."""

from __future__ import annotations

import math
from functools import cache

import numpy as np
import pandas as pd
from common import BOROUGHS, RAW, SPOTLIGHT, SUPERSECTORS, write_json

SNAP = 2024
SEASON_YEARS = (2022, 2023, 2024)
STATE = "02000"

# ACS resident industry groups (male line numbers; female = +27)
IND = {
    "ag_fish": [4],
    "mining": [5],
    "construction": [6],
    "manufacturing": [7],
    "trade": [8, 9],
    "transport": [10],
    "info_fin": [13, 14],
    "prof": [17],
    "education": [22],
    "health": [23],
    "leisure": [24],
    "other": [27],
    "public_admin": [28],
}


# ---------------------------------------------------------------- readers
def clean(x):
    """Convert numpy/pandas scalars to JSON-safe python values (NaN → None)."""
    if x is None:
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating, float)):
        return None if math.isnan(x) else float(x)
    return x


def rnd(x, n=4):
    x = clean(x)
    return None if x is None else round(x, n)


@cache
def acs(table: str) -> pd.DataFrame:
    df = pd.read_csv(
        RAW / "acs" / f"{table.lower()}_ak.dat", sep="|", dtype={"GEO_ID": str}
    )
    df = df.set_index("GEO_ID")
    for c in df.columns:
        v = pd.to_numeric(df[c], errors="coerce").astype(float)
        if "_M" in c:
            v = v.where(v != -555555555, 0.0)
        df[c] = v.where(v >= 0)
    return df


def acs_e(table: str, geo: str, line: int):
    df = acs(table)
    col = f"{table.upper()}_E{line:03d}"
    return clean(df.at[geo, col]) if geo in df.index else None


def qcew(year: int, period, area: str) -> pd.DataFrame | None:
    p = RAW / "qcew" / f"{year}_{period}_{area}.csv"
    if not p.exists():
        return None
    df = pd.read_csv(
        p, dtype={"industry_code": str, "area_fips": str, "disclosure_code": str}
    )
    return df[df["size_code"] == 0]


def qrow(df: pd.DataFrame, own: int, ind: str):
    r = df[(df.own_code == own) & (df.industry_code == ind)]
    if r.empty:
        return None
    return r.iloc[0]


def qval(df, own, ind, col="annual_avg_emplvl"):
    r = qrow(df, own, ind)
    if r is None or r["disclosure_code"] == "N":
        return None
    return clean(r[col])


def qlq(df, own, ind):
    r = qrow(df, own, ind)
    if r is None or r["disclosure_code"] == "N" or r.get("lq_disclosure_code") == "N":
        return None
    v = clean(r["lq_annual_avg_emplvl"])
    return None if v is None else round(v, 2)


@cache
def bea(table: str) -> pd.DataFrame:
    p = next((RAW / "bea").glob(f"{table}_AK_*.csv"))
    df = pd.read_csv(p, dtype=str, encoding="latin-1", skipfooter=4, engine="python")
    df.columns = [c.strip() for c in df.columns]
    df["fips"] = df["GeoFIPS"].str.strip().str.strip('"').str.strip()
    df["line"] = pd.to_numeric(df["LineCode"], errors="coerce")
    return df


def bea_v(table: str, fips: str, line: int, year: int):
    df = bea(table)
    r = df[(df.fips == fips) & (df.line == line)]
    if r.empty or str(year) not in df.columns:
        return None
    v = pd.to_numeric(r.iloc[0][str(year)], errors="coerce")
    return clean(v)


def cfec_page(path) -> dict | None:
    if not path.exists():
        return None
    try:
        tables = pd.read_html(path)
    except ValueError:
        return None
    for t in tables:
        s = t.astype(str)
        if not s.apply(lambda c: c.str.contains("All Fisheries Combined")).any().any():
            continue
        col0 = s.iloc[:, 0]
        rows = t[
            (col0 == "All Fisheries Combined")
            & s.iloc[:, 1].str.contains("Group Total")
        ]
        if rows.empty:
            return None
        r = rows.iloc[0]

        def num(v):
            v = pd.to_numeric(str(v).replace(",", ""), errors="coerce")
            return clean(v)

        return {
            "holders": num(r.iloc[2]),
            "permits": num(r.iloc[3]),
            "fishermen": num(r.iloc[4]),
            "earnings": num(r.iloc[7]),
        }
    return None


def pfd_latest() -> dict:
    t = pd.read_html(RAW / "pfd" / "summary.html")[0]
    t.columns = t.iloc[0]
    t = t.iloc[1:]
    t = t[pd.to_numeric(t["Dividend Year"], errors="coerce").notna()]
    r = t.iloc[0]
    amt = float(str(r["Dividend Amount"]).replace("$", "").replace(",", ""))
    return {"year": int(r["Dividend Year"]), "amount": amt}


# ---------------------------------------------------------------- pieces
def acs_geo(fips: str) -> str:
    return "0400000US02" if fips == STATE else f"0500000US{fips}"


def acs_basics(fips: str) -> dict:
    g = acs_geo(fips)
    pop = acs_e("b01003", g, 1)
    clf = acs_e("b23025", g, 3)
    emp = acs_e("b23025", g, 4)
    unemp = acs_e("b23025", g, 5)
    tot = acs_e("b24080", g, 1)
    self_ = sum(acs_e("b24080", g, n) or 0 for n in (5, 10, 15, 20))
    ind = {}
    total_ind = acs_e("c24030", g, 1)
    for k, lines in IND.items():
        v = sum(
            (acs_e("c24030", g, n) or 0) + (acs_e("c24030", g, n + 27) or 0)
            for n in lines
        )
        ind[k] = rnd(v / total_ind) if total_ind else None
    top = max(
        (k for k in ind if ind[k] is not None), key=lambda k: ind[k], default=None
    )
    return {
        "pop": pop,
        "employed": emp,
        "unemp_rate": rnd(unemp / clf) if clf else None,
        "self_employed_share": rnd(self_ / tot) if tot else None,
        "resident_industry": ind,
        "top_resident_industry": top,
    }


def qcew_snapshot(fips: str) -> dict:
    d = qcew(SNAP, "a", fips)
    assert d is not None, fips
    jobs = qval(d, 0, "10")
    fed, st, loc = (qval(d, o, "10") for o in (1, 2, 3))
    priv = qval(d, 5, "10")
    gov = [x for x in (fed, st, loc) if x is not None]
    ss = {c: {"jobs": qval(d, 5, c), "lq": qlq(d, 5, c)} for c in SUPERSECTORS}
    spot = {c: {"jobs": qval(d, 5, c), "lq": qlq(d, 5, c)} for c in SPOTLIGHT}
    cand = {
        c: v["jobs"] for c, v in ss.items() if v["jobs"] is not None and c != "1029"
    }
    top = SUPERSECTORS[max(cand, key=cand.get)] if cand else None
    return {
        "jobs": jobs,
        "avg_pay": qval(d, 0, "10", "avg_annual_pay"),
        "gov_share": rnd(sum(gov) / jobs) if jobs and gov else None,
        "fed_jobs": fed,
        "state_jobs": st,
        "local_jobs": loc,
        "private_jobs": priv,
        "supersectors": ss,
        "spotlight": spot,
        "top_supersector": top,
    }


def income(fips: str) -> dict:
    y = SNAP
    g = lambda ln: bea_v("CAINC4", fips, ln, y)
    return {
        "year": y,
        "pi_k": g(10),
        "pop": g(20),
        "per_capita": g(30),
        "wages_k": g(50),
        "supplements_k": g(60),
        "proprietors_k": g(70),
        "dir_k": g(46),
        "transfers_k": g(47),
        "contributions_k": g(36),
        "residence_adj_k": g(42),
    }


def transfers_detail(fips: str) -> dict:
    g = lambda ln: bea_v("CAINC35", fips, ln, 2022)
    return {
        "year": 2022,
        "total_k": g(1000),
        "social_security_k": g(2110),
        "medicare_k": g(2210),
        "medicaid_k": g(2220),
        "income_maint_k": g(2300),
        "veterans_k": g(2500),
        "other_gov_k": g(2700),
    }


def seasonal(fips: str) -> dict:
    tot = [[] for _ in range(12)]
    lei = [[] for _ in range(12)]
    lei_ok = True
    for y in SEASON_YEARS:
        for q in range(1, 5):
            d = qcew(y, q, fips)
            if d is None:
                continue
            for m in range(3):
                col = f"month{m + 1}_emplvl"
                v = qval(d, 0, "10", col)
                if v is not None:
                    tot[(q - 1) * 3 + m].append(v)
                lv = qval(d, 5, "1026", col)
                if lv is None:
                    lei_ok = False
                else:
                    lei[(q - 1) * 3 + m].append(lv)
    months = [round(sum(v) / len(v)) if v else None for v in tot]
    ok = [m for m in months if m]
    leisure = [round(sum(v) / len(v)) if v else None for v in lei] if lei_ok else None
    return {
        "months": months,
        "ratio": round(max(ok) / min(ok), 3) if ok else None,
        "leisure": leisure,
    }


def growth(fips: str) -> dict:
    if fips in ("02063", "02066"):
        j0 = bea_v("CAEMP25N", "02261", 10, 2010)
        a, b = (bea_v("CAEMP25N", f, 10, 2022) for f in ("02063", "02066"))
        j1 = a + b if a is not None and b is not None else None
        grp = "valdez-cordova"
    else:
        j0 = bea_v("CAEMP25N", fips, 10, 2010)
        j1 = bea_v("CAEMP25N", fips, 10, 2022)
        grp = None
    pct = rnd(j1 / j0 - 1) if j0 and j1 is not None else None
    return {"y0": 2010, "y1": 2022, "jobs0": j0, "jobs1": j1, "pct": pct, "group": grp}


def borough(fips: str) -> dict:
    out = {"name": BOROUGHS[fips]}
    a = acs_basics(fips)
    out.update({k: a[k] for k in ("pop", "employed", "unemp_rate")})
    out.update(qcew_snapshot(fips))
    out["resident_industry"] = a["resident_industry"]
    out["top_resident_industry"] = a["top_resident_industry"]
    out["self_employed_share"] = a["self_employed_share"]
    inc = income(fips)
    td = transfers_detail(fips)
    out["income"] = inc
    out["transfers_detail"] = td
    out["transfer_share"] = (
        rnd(inc["transfers_k"] / inc["pi_k"])
        if inc["pi_k"] and inc["transfers_k"]
        else None
    )
    pi22 = bea_v("CAINC4", fips, 10, 2022)
    out["pfd_share"] = (
        rnd(td["other_gov_k"] / pi22) if pi22 and td["other_gov_k"] else None
    )
    c = cfec_page(RAW / "cfec" / f"2023_{fips[2:]}.htm")
    out["cfec"] = {"year": 2023, **c} if c else None
    out["seasonal"] = seasonal(fips)
    out["growth"] = growth(fips)
    return out


def overview() -> dict:
    d = qcew(SNAP, "a", STATE)
    by_own = {
        name: {"jobs": qval(d, o, "10"), "avg_pay": qval(d, o, "10", "avg_annual_pay")}
        for name, o in (("federal", 1), ("state", 2), ("local", 3), ("private", 5))
    }
    total = qval(d, 0, "10")
    supers = [
        {
            "code": c,
            "label": lab,
            "jobs": qval(d, 5, c),
            "avg_pay": qval(d, 5, c, "avg_annual_pay"),
            "lq": qlq(d, 5, c),
        }
        for c, lab in SUPERSECTORS.items()
    ]
    spot = [
        {
            "code": c,
            "label": lab,
            "jobs": qval(d, 5, c),
            "avg_pay": qval(d, 5, c, "avg_annual_pay"),
            "lq": qlq(d, 5, c),
        }
        for c, lab in SPOTLIGHT.items()
    ]
    e = bea("CAEMP25N")
    st = e[e.fips == STATE]
    sectors = []
    for _, r in st[(st.line >= 100) & (st.line <= 1900)].sort_values("line").iterrows():
        sectors.append(
            {
                "line": int(r.line),
                "label": str(r["Description"]).strip().rstrip("/0123456789 ").strip(),
                "jobs": clean(pd.to_numeric(r["2022"], errors="coerce")),
            }
        )
    g = lambda ln: bea_v("CAEMP25N", STATE, ln, 2022)
    all_jobs = {
        "year": 2022,
        "total": g(10),
        "wage_salary": g(20),
        "proprietors": g(40),
        "sectors": sectors,
        "gov": {
            "federal_civilian": g(2001),
            "military": g(2002),
            "state": g(2011),
            "local": g(2012),
        },
    }
    a = acs_basics(STATE)
    gov_jobs = sum(by_own[k]["jobs"] for k in ("federal", "state", "local"))
    # per-capita income: newest year with data
    pci_year = max(
        y for y in range(2020, 2026) if bea_v("CAINC4", STATE, 30, y) is not None
    )
    headline = {
        "population": a["pop"],
        "employed": a["employed"],
        "self_employed_share": a["self_employed_share"],
        "gov_share_jobs": rnd(gov_jobs / total),
        "per_capita_income": bea_v("CAINC4", STATE, 30, pci_year),
        "per_capita_income_year": pci_year,
        "pfd": pfd_latest(),
    }
    return {
        "year": SNAP,
        "qcew_total": {
            "jobs": total,
            "avg_pay": qval(d, 0, "10", "avg_annual_pay"),
            "by_own": by_own,
        },
        "supersectors": supers,
        "spotlight": spot,
        "all_jobs_bea": all_jobs,
        "headline": headline,
    }


def main() -> None:
    ov = overview()
    tot = ov["qcew_total"]["jobs"]
    assert 300_000 < tot < 360_000, tot
    # Suppressed statewide cells must be null, never zero.
    for s in ov["supersectors"] + ov["spotlight"]:
        assert s["jobs"] is None or s["jobs"] > 0, s

    bs = {f: borough(f) for f in BOROUGHS}
    assert len(bs) == 30
    for f, b in bs.items():
        assert b["jobs"] and b["jobs"] > 0, f
        for c, v in b["supersectors"].items():
            assert v["jobs"] is None or v["jobs"] >= 0, (f, c)
    s = sum(b["jobs"] for b in bs.values())
    assert abs(s - tot) / tot < 0.02, (
        s,
        tot,
    )  # boroughs sum to state (± unknown-area jobs)

    p1 = write_json("overview.json", ov)
    p2 = write_json("boroughs.json", {"year": SNAP, "boroughs": bs})
    for p in (p1, p2):
        print(p.name, f"{p.stat().st_size / 1024:.1f} KB")
    print("state jobs", tot, "borough sum", s)


if __name__ == "__main__":
    main()
