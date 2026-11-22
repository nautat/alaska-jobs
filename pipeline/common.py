"""Shared constants and helpers for the Alaska jobs pipeline."""

from __future__ import annotations

import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "report" / "data"
GEO_OUT = ROOT / "report" / "geo"

UA = {"User-Agent": "alaska-jobs-report/0.1 (research script)"}

# 30 current boroughs / census areas (2020+ geography)
BOROUGHS = {
    "02013": "Aleutians East",
    "02016": "Aleutians West",
    "02020": "Anchorage",
    "02050": "Bethel",
    "02060": "Bristol Bay",
    "02063": "Chugach",
    "02066": "Copper River",
    "02068": "Denali",
    "02070": "Dillingham",
    "02090": "Fairbanks North Star",
    "02100": "Haines",
    "02105": "Hoonah-Angoon",
    "02110": "Juneau",
    "02122": "Kenai Peninsula",
    "02130": "Ketchikan Gateway",
    "02150": "Kodiak Island",
    "02158": "Kusilvak",
    "02164": "Lake and Peninsula",
    "02170": "Matanuska-Susitna",
    "02180": "Nome",
    "02185": "North Slope",
    "02188": "Northwest Arctic",
    "02195": "Petersburg",
    "02198": "Prince of Wales-Hyder",
    "02220": "Sitka",
    "02230": "Skagway",
    "02240": "Southeast Fairbanks",
    "02275": "Wrangell",
    "02282": "Yakutat",
    "02290": "Yukon-Koyukuk",
}

# Retired FIPS codes and the current code(s) they map to for trend series.
# Valdez-Cordova (02261) split into Chugach + Copper River in 2019;
# Wade Hampton (02270) renamed Kusilvak (02158) in 2015.
RETIRED = {"02261": ["02063", "02066"], "02270": ["02158"]}

UPPER_SU = {
    "0274830": "Talkeetna",
    "0278680": "Trapper Creek",
    "0285280": "Willow",
    "0274350": "Susitna North",
    "0212350": "Chase",
}
UPPER_SU_ZIPS = {"99676": "Talkeetna", "99683": "Trapper Creek", "99688": "Willow"}

# QCEW NAICS supersector codes (private, own_code 5) and short labels.
SUPERSECTORS = {
    "1011": "Natural resources & mining",
    "1012": "Construction",
    "1013": "Manufacturing",
    "1021": "Trade, transport & utilities",
    "1022": "Information",
    "1023": "Financial activities",
    "1024": "Professional & business services",
    "1025": "Education & health",
    "1026": "Leisure & hospitality",
    "1027": "Other services",
    "1029": "Unclassified",
}

# Detail industries worth calling out for Alaska (NAICS, private sector).
SPOTLIGHT = {
    "211": "Oil & gas extraction",
    "213": "Mining support (oilfield services)",
    "212": "Mining (excl. oil & gas)",
    "3117": "Seafood processing",
    "1141": "Commercial fishing (wage jobs)",
    "481": "Air transportation",
    "487": "Scenic & sightseeing transport",
    "721": "Accommodation",
    "722": "Food services & drinking places",
    "62": "Health care & social assistance",
    "23": "Construction",
    "44-45": "Retail trade",
}


def get(
    url: str, dest: Path, *, force: bool = False, headers: dict | None = None
) -> Path:
    """Download url to dest once; reuse cached copy afterwards."""
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, headers=headers or UA, timeout=120)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def write_json(name: str, obj) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    return p
