"""Build report/data/uppersu.json: the Upper Susitna Valley deep dive.

Inputs (all cached by the fetchers):
  data/raw/acs/*_ak.dat           ACS 2020-24 5-year, Alaska rows only
  data/raw/zbp/zbp23*_uppersu.csv ZIP Business Patterns 2023
  data/raw/cfec/2023_1704xx.htm   CFEC permit/earnings by community
  data/raw/qcew/{y}_{q}_02170.csv QCEW quarterly, Mat-Su
"""

from __future__ import annotations

import math

import pandas as pd
from common import RAW, UPPER_SU, UPPER_SU_ZIPS, write_json

ACS = RAW / "acs"

# --- area definitions -------------------------------------------------------
CDP_IDS = {
    "0274830": "talkeetna",
    "0278680": "trapper_creek",
    "0285280": "willow",
    "0274350": "susitna_north",
    "0212350": "chase",
}
AREAS = [
    *[
        {"id": CDP_IDS[g], "name": UPPER_SU[g], "kind": "cdp", "geo": f"1600000US{g}"}
        for g in CDP_IDS
    ],
    {
        "id": "upper_su",
        "name": "Upper Susitna (5 CDPs)",
        "kind": "aggregate",
        "geo": None,
    },
    *[
        {
            "id": f"z{z}",
            "name": f"ZIP {z} ({n})",
            "kind": "zcta",
            "geo": f"860Z200US{z}",
        }
        for z, n in UPPER_SU_ZIPS.items()
    ],
    {
        "id": "matsu",
        "name": "Matanuska-Susitna Borough",
        "kind": "borough",
        "geo": "0500000US02170",
    },
    {"id": "alaska", "name": "Alaska", "kind": "state", "geo": "0400000US02"},
]

# --- ACS group definitions (see SCHEMA.md) -----------------------------------
IND = {  # C24030 male lines; female = +27
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
IND_LABELS = {
    "ag_fish": "Agriculture, fishing & forestry",
    "mining": "Mining, oil & gas",
    "construction": "Construction",
    "manufacturing": "Manufacturing",
    "trade": "Wholesale & retail trade",
    "transport": "Transportation & utilities",
    "info_fin": "Information, finance & real estate",
    "prof": "Professional & business services",
    "education": "Education",
    "health": "Health care & social assistance",
    "leisure": "Arts, recreation, lodging & food",
    "other": "Other services",
    "public_admin": "Public administration",
}
OCC = {  # C24010 male lines; female = +36
    "management": [4],
    "stem": [7],
    "edu_legal_arts": [11],
    "health_pract": [16],
    "health_support": [20],
    "protective": [21],
    "food": [24],
    "cleaning": [25],
    "personal_care": [26],
    "sales": [28],
    "office": [29],
    "farm_fish": [31],
    "construction_extraction": [32],
    "repair": [33],
    "production": [35],
    "transport_moving": [36, 37],
}
OCC_LABELS = {
    "management": "Management, business & finance",
    "stem": "Computer, engineering & science",
    "edu_legal_arts": "Education, legal, community & arts",
    "health_pract": "Healthcare practitioners",
    "health_support": "Healthcare support",
    "protective": "Protective service",
    "food": "Food preparation & serving",
    "cleaning": "Building & grounds maintenance",
    "personal_care": "Personal care & service",
    "sales": "Sales",
    "office": "Office & administrative support",
    "farm_fish": "Farming, fishing & forestry",
    "construction_extraction": "Construction & extraction",
    "repair": "Installation, maintenance & repair",
    "production": "Production",
    "transport_moving": "Transportation & material moving",
}
CLS = {  # B24080 male lines; female = +10
    "private": [4],
    "self_inc": [5],
    "nonprofit": [6],
    "local_gov": [7],
    "state_gov": [8],
    "federal_gov": [9],
    "self_uninc": [10],
    "unpaid": [11],
}
CLS_LABELS = {
    "private": "Private-company employee",
    "self_inc": "Self-employed (incorporated)",
    "nonprofit": "Nonprofit employee",
    "local_gov": "Local government",
    "state_gov": "State government",
    "federal_gov": "Federal government",
    "self_uninc": "Self-employed (not incorporated)",
    "unpaid": "Unpaid family worker",
}
SRC = {
    "wages": "b19052",
    "self_emp": "b19053",
    "interest_div_rent": "b19054",
    "social_security": "b19055",
    "ssi": "b19056",
    "public_assistance": "b19057",
    "retirement": "b19059",
}
SRC_LABELS = {
    "wages": "Wages or salary",
    "self_emp": "Self-employment income",
    "interest_div_rent": "Interest, dividends or rent",
    "social_security": "Social Security",
    "ssi": "Supplemental Security Income",
    "public_assistance": "Public assistance",
    "retirement": "Retirement income",
}

ZBP_SECTORS = {
    "11": "Agriculture, forestry & fishing",
    "21": "Mining, oil & gas",
    "22": "Utilities",
    "23": "Construction",
    "31": "Manufacturing",
    "42": "Wholesale trade",
    "44": "Retail trade",
    "48": "Transportation (incl. flightseeing)",
    "51": "Information",
    "52": "Finance & insurance",
    "53": "Real estate & rental",
    "54": "Professional services",
    "55": "Management of companies",
    "56": "Admin & support services",
    "61": "Education",
    "62": "Health care & social assistance",
    "71": "Arts & recreation",
    "72": "Accommodation & food",
    "81": "Other services",
    "99": "Unclassified",
}
CFEC_PAGES = {"Talkeetna": "170421", "Trapper Creek": "170423", "Willow": "170425"}


# --- ACS helpers -------------------------------------------------------------
def read_acs(table: str) -> pd.DataFrame:
    df = pd.read_csv(ACS / f"{table}_ak.dat", sep="|", dtype=str).set_index("GEO_ID")
    return df.apply(pd.to_numeric, errors="coerce")


TABLES = {
    t: read_acs(t)
    for t in [
        "b01003",
        "b23025",
        "c24030",
        "c24010",
        "b24080",
        "b19013",
        "b19301",
        "b25001",
        "b25004",
        *SRC.values(),
    ]
}


def cell(table: str, geo: str, line: int) -> tuple[float | None, float | None]:
    """Return (estimate, moe) for one ACS cell with sentinels handled."""
    df = TABLES[table]
    t = table.upper()
    if geo not in df.index:  # e.g. B19301 is not published for every small place
        return None, None
    e = df.at[geo, f"{t}_E{line:03d}"]
    m = df.at[geo, f"{t}_M{line:03d}"]
    e = None if pd.isna(e) or e < 0 else float(e)
    if pd.isna(m):
        m = None
    elif m == -555555555:
        m = 0.0
    elif m < 0:
        m = None
    else:
        m = float(m)
    return e, m


def add(*pairs):
    """Sum [e, m] pairs; MOE by root-sum-square."""
    if any(p[0] is None for p in pairs):
        return [None, None]
    e = sum(p[0] for p in pairs)
    ms = [p[1] for p in pairs]
    m = None if any(x is None for x in ms) else math.sqrt(sum(x * x for x in ms))
    return [e, m]


def share(x, y):
    """Proportion x/y with ACS proportion MOE."""
    (xe, xm), (ye, ym) = x, y
    if xe is None or not ye:
        return [None, None]
    p = xe / ye
    if xm is None or ym is None:
        return [p, None]
    under = xm**2 - p**2 * ym**2
    if under < 0:
        under = xm**2 + p**2 * ym**2
    return [p, math.sqrt(under) / ye]


def sexsum(table: str, geo: str, lines: list[int], offset: int):
    return add(
        *[cell(table, geo, ln) for ln in lines],
        *[cell(table, geo, ln + offset) for ln in lines],
    )


def raw_counts(geo: str) -> dict:
    """All additive counts for one geography, as [e, m] pairs."""
    c = {
        "pop": list(cell("b01003", geo, 1)),
        "lf_total": list(cell("b23025", geo, 1)),
        "lf": list(cell("b23025", geo, 2)),
        "civ_lf": list(cell("b23025", geo, 3)),
        "employed": list(cell("b23025", geo, 4)),
        "unemployed": list(cell("b23025", geo, 5)),
        "ind_total": list(cell("c24030", geo, 1)),
        "occ_total": list(cell("c24010", geo, 1)),
        "cls_total": list(cell("b24080", geo, 1)),
        "housing_units": list(cell("b25001", geo, 1)),
        "seasonal_units": list(cell("b25004", geo, 6)),
        "ind": {k: sexsum("c24030", geo, v, 27) for k, v in IND.items()},
        "occ": {k: sexsum("c24010", geo, v, 36) for k, v in OCC.items()},
        "cls": {k: sexsum("b24080", geo, v, 10) for k, v in CLS.items()},
        "src": {
            k: (list(cell(t, geo, 2)), list(cell(t, geo, 1))) for k, t in SRC.items()
        },
    }
    return c


def sum_counts(items: list[dict]) -> dict:
    out = {}
    for k, v in items[0].items():
        if k == "src":
            out[k] = {
                s: (
                    add(*[i[k][s][0] for i in items]),
                    add(*[i[k][s][1] for i in items]),
                )
                for s in v
            }
        elif isinstance(v, dict):
            out[k] = {g: add(*[i[k][g] for i in items]) for g in v}
        else:
            out[k] = add(*[i[k] for i in items])
    return out


def rnd(pair, nd=4):
    return [None if x is None else round(x, nd) for x in pair]


def finish(c: dict, median, per_capita) -> dict:
    return {
        "pop": rnd(c["pop"], 0),
        "employed": rnd(c["employed"], 0),
        "unemp_rate": rnd(share(c["unemployed"], c["civ_lf"])),
        "lfpr": rnd(share(c["lf"], c["lf_total"])),
        "median_hh_income": rnd(median, 0),
        "per_capita": rnd(per_capita, 0),
        "ind": {k: rnd(share(v, c["ind_total"])) for k, v in c["ind"].items()},
        "occ": {k: rnd(share(v, c["occ_total"])) for k, v in c["occ"].items()},
        "cls": {k: rnd(share(v, c["cls_total"])) for k, v in c["cls"].items()},
        "ind_n": {k: rnd(v, 0) for k, v in c["ind"].items()},
        "src": {k: rnd(share(x, y)) for k, (x, y) in c["src"].items()},
        "housing_units": rnd(c["housing_units"], 0),
        "seasonal_units": rnd(c["seasonal_units"], 0),
        "seasonal_share": rnd(share(c["seasonal_units"], c["housing_units"])),
    }


def build_acs() -> dict:
    counts = {a["id"]: raw_counts(a["geo"]) for a in AREAS if a["geo"]}
    out = {}
    for a in AREAS:
        if a["geo"]:
            out[a["id"]] = finish(
                counts[a["id"]],
                cell("b19013", a["geo"], 1),
                cell("b19301", a["geo"], 1),
            )
        else:  # upper_su aggregate; medians and per-capita cannot be summed
            agg = sum_counts([counts[i] for i in CDP_IDS.values()])
            out[a["id"]] = finish(agg, (None, None), (None, None))
    return out


# --- ZBP ---------------------------------------------------------------------
def num(x):
    v = pd.to_numeric(x, errors="coerce")
    return None if pd.isna(v) else int(v)


def build_zbp() -> dict:
    det = pd.read_csv(
        RAW / "zbp" / "zbp23detail_uppersu.csv", dtype=str
    ).drop_duplicates()
    tot = pd.read_csv(RAW / "zbp" / "zbp23totals_uppersu.csv", dtype=str).set_index(
        "zip"
    )
    zips = {}
    for z, name in UPPER_SU_ZIPS.items():
        d = det[det["zip"] == z]
        sectors = []
        for _, r in d.iterrows():
            code = r["naics"]
            if code.endswith("----") and code != "------":
                s = code[:2]
                sectors.append(
                    {"naics": s, "label": ZBP_SECTORS.get(s, s), "est": num(r["est"])}
                )
        sectors.sort(key=lambda s: -(s["est"] or 0))
        t = tot.loc[z] if z in tot.index else None
        zips[z] = {
            "name": name,
            "est": num(t["est"]) if t is not None else None,
            "emp": num(t["emp"]) if t is not None else None,
            "payroll_k": num(t["ap"]) if t is not None else None,
            "sectors": sectors,
        }
    return {"year": 2023, "zips": zips}


# --- CFEC --------------------------------------------------------------------
def cfec_num(x):
    v = pd.to_numeric(str(x).replace(",", ""), errors="coerce")
    return None if pd.isna(v) else int(v)


def parse_cfec(path) -> dict:
    tables = pd.read_html(path)
    groups, combined = [], None
    for t in tables:
        if t.shape[1] != 8:
            continue
        if not t.astype(str).apply(lambda c: c.str.contains("Group Total")).any().any():
            continue
        cur = None
        for _, r in t.iterrows():
            g = r.iloc[0]
            if (
                isinstance(g, str)
                and g.strip()
                and not g.startswith(("Year:", "Fishery Group"))
            ):
                cur = g.replace("(con't)", "").strip()
            code = r.iloc[1]
            if isinstance(code, str) and code.startswith("Group Total"):
                row = {
                    "group": cur,
                    "holders": cfec_num(r.iloc[2]),
                    "permits": cfec_num(r.iloc[3]),
                    "fishermen": cfec_num(r.iloc[4]),
                    "earnings": cfec_num(r.iloc[7]),
                }
                if cur == "All Fisheries Combined":
                    combined = row
                else:
                    groups.append(
                        {
                            k: row[k]
                            for k in ("group", "holders", "fishermen", "earnings")
                        }
                    )
    if combined is None:
        return {
            "holders": None,
            "permits": None,
            "fishermen": None,
            "earnings": None,
            "groups": groups,
        }
    return {
        "holders": combined["holders"],
        "permits": combined["permits"],
        "fishermen": combined["fishermen"],
        "earnings": combined["earnings"],
        "groups": groups,
    }


def build_cfec() -> dict:
    return {
        "year": 2023,
        "communities": {
            n: parse_cfec(RAW / "cfec" / f"2023_{p}.htm") for n, p in CFEC_PAGES.items()
        },
    }


# --- QCEW Mat-Su seasonal -----------------------------------------------------
def build_seasonal() -> dict:
    series = {
        "total": (0, "10"),
        "leisure": (5, "1026"),
        "trade": (5, "1021"),
        "construction": (5, "1012"),
    }
    acc = {k: [[] for _ in range(12)] for k in series}
    for y in (2022, 2023, 2024):
        for q in range(1, 5):
            df = pd.read_csv(
                RAW / "qcew" / f"{y}_{q}_02170.csv", dtype={"industry_code": str}
            )
            for k, (own, ind) in series.items():
                r = df[
                    (df.own_code == own)
                    & (df.industry_code == ind)
                    & (df.agglvl_code.isin([70, 71, 73]))
                ]
                if r.empty or str(r.iloc[0]["disclosure_code"]) == "N":
                    continue
                for i in range(3):
                    v = r.iloc[0][f"month{i + 1}_emplvl"]
                    if pd.notna(v) and v > 0:
                        acc[k][(q - 1) * 3 + i].append(float(v))
    out = {"years": "2022-2024"}
    for k, months in acc.items():
        out[k] = [round(sum(m) / len(m)) if m else None for m in months]
    return out


def main() -> None:
    acs = build_acs()
    data = {
        "areas": [{k: a[k] for k in ("id", "name", "kind")} for a in AREAS],
        "labels": {
            "ind": IND_LABELS,
            "occ": OCC_LABELS,
            "cls": CLS_LABELS,
            "src": SRC_LABELS,
        },
        "acs": acs,
        "zbp": build_zbp(),
        "cfec": build_cfec(),
        "matsu_seasonal": build_seasonal(),
    }

    # sanity checks
    tk = acs["talkeetna"]["pop"][0]
    assert 800 <= tk <= 1500, f"Talkeetna pop {tk}"
    for aid, a in acs.items():
        for grp in ("ind", "occ", "cls"):
            vals = [v[0] for v in a[grp].values() if v[0] is not None]
            if vals:  # Chase CDP (~30 people) has no employed residents in the sample
                assert abs(sum(vals) - 1) < 0.01, f"{aid} {grp} shares sum {sum(vals)}"
    p = write_json("uppersu.json", data)
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
