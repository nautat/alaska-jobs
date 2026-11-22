"""Build TopoJSON boundaries and the places list for the report.

Outputs (see SCHEMA.md):
  report/geo/alaska.topo.json   - 30 boroughs / census areas
  report/geo/upper_su.topo.json - Upper Susitna locator layers
  report/data/places.json       - labelled points
"""

from __future__ import annotations

import json

import geopandas as gpd
import topojson as tp
from common import BOROUGHS, GEO_OUT, RAW, UPPER_SU, write_json
from shapely.geometry import box

GEO = RAW / "geo"
BBOX = (-151.8, 61.45, -148.8, 63.25)  # lon_min, lat_min, lon_max, lat_max
NEIGHBOR_CDPS = {"Houston", "Big Lake", "Meadow Lakes"}
RIVER_PAT = r"\b(?:Susitna|Chulitna|Talkeetna|Yentna|Deshka)\b.*Riv"

CITIES = [
    ("Anchorage", -149.9003, 61.2181),
    ("Fairbanks", -147.7164, 64.8378),
    ("Juneau", -134.4197, 58.3019),
    ("Wasilla", -149.4394, 61.5814),
    ("Bethel", -161.7558, 60.7922),
    ("Kodiak", -152.4072, 57.7900),
    ("Nome", -165.4064, 64.5011),
    ("Utqiagvik", -156.7886, 71.2906),
    ("Ketchikan", -131.6461, 55.3422),
    ("Dillingham", -158.4575, 59.0397),
    ("Kotzebue", -162.5967, 66.8983),
    ("Valdez", -146.3483, 61.1308),
    ("Sitka", -135.3300, 57.0531),
    ("Unalaska", -166.5422, 53.8739),
    ("Prudhoe Bay", -148.3364, 70.2553),
]
DENALI = ("Denali", -151.0070, 63.0692)


def read(name: str) -> gpd.GeoDataFrame:
    return gpd.read_file(f"zip://{GEO / name}").to_crs(4326)


def topo(layers: dict[str, gpd.GeoDataFrame], simplify: float) -> dict:
    t = tp.Topology(
        list(layers.values()),
        object_name=list(layers.keys()),
        prequantize=100_000,
        toposimplify=simplify,
        presimplify=False,
    )
    return json.loads(t.to_json())


def save(name: str, obj: dict) -> int:
    GEO_OUT.mkdir(parents=True, exist_ok=True)
    p = GEO_OUT / name
    p.write_text(json.dumps(obj, separators=(",", ":")))
    return p.stat().st_size


def build_alaska() -> int:
    c = read("cb_2023_us_county_500k.zip")
    c = c[c.STATEFP == "02"].copy()
    c["fips"] = c.GEOID
    c = c[c.fips.isin(BOROUGHS)]
    assert set(c.fips) == set(BOROUGHS), set(BOROUGHS) - set(c.fips)
    c["name"] = c.fips.map(BOROUGHS)
    c = c[["fips", "name", "geometry"]].sort_values("fips")
    # Census already splits Aleutians West at 180 deg; check longitudes stay in range.
    b = c.total_bounds
    assert -180 <= b[0] and b[2] <= 180, b
    return save("alaska.topo.json", topo({"boroughs": c}, simplify=0.004))


def build_upper_su() -> tuple[int, gpd.GeoDataFrame]:
    clip = box(*BBOX)
    places = read("cb_2023_02_place_500k.zip")
    names = set(UPPER_SU.values()) | NEIGHBOR_CDPS
    cdps = places[places.NAME.isin(names)].copy()
    cdps["geoid"] = cdps.GEOID
    cdps["name"] = cdps.NAME
    cdps["upper_su"] = cdps.GEOID.isin(UPPER_SU)
    cdps = cdps[["geoid", "name", "upper_su", "geometry"]]

    counties = read("cb_2023_us_county_500k.zip")
    matsu = counties[counties.GEOID == "02170"][["geometry"]].copy()
    matsu["name"] = "Matanuska-Susitna"

    roads = gpd.clip(read("tl_2023_02_prisecroads.zip"), clip)
    roads = roads.rename(columns={"FULLNAME": "name"})[["name", "geometry"]]
    roads["name"] = roads["name"].fillna("")

    rails = gpd.read_file(f"zip://{GEO / 'tl_2023_us_rails.zip'}", bbox=BBOX).to_crs(
        4326
    )
    rails = gpd.clip(rails, clip)[["geometry"]]

    lw = read("tl_2023_02170_linearwater.zip")
    rivers = lw[lw.FULLNAME.fillna("").str.contains(RIVER_PAT, regex=True)]
    rivers = gpd.clip(rivers, clip).rename(columns={"FULLNAME": "name"})[
        ["name", "geometry"]
    ]
    rivers = rivers.dissolve(by="name", as_index=False)

    aw = read("tl_2023_02170_areawater.zip")
    water = gpd.clip(aw[aw.AWATER > 1_000_000], clip)[["geometry"]]
    water["name"] = aw.loc[water.index, "FULLNAME"].fillna("")

    layers = {
        "cdps": cdps,
        "matsu": matsu,
        "roads": roads,
        "rail": rails,
        "rivers": rivers,
        "water": water,
    }
    layers = {k: g.reset_index(drop=True) for k, g in layers.items()}
    for k, g in layers.items():
        print(f"  upper_su.{k}: {len(g)} features")
    return save("upper_su.topo.json", topo(layers, simplify=0.0004)), cdps


def build_places(cdps: gpd.GeoDataFrame) -> list[dict]:
    out = [
        {"name": n, "lon": lon, "lat": lat, "kind": "city"} for n, lon, lat in CITIES
    ]
    for geoid, name in UPPER_SU.items():
        pt = cdps.loc[cdps.geoid == geoid, "geometry"].iloc[0].representative_point()
        out.append(
            {
                "name": name,
                "lon": round(pt.x, 4),
                "lat": round(pt.y, 4),
                "kind": "uppersu",
            }
        )
    n, lon, lat = DENALI
    out.append({"name": n, "lon": lon, "lat": lat, "kind": "landmark"})
    write_json("places.json", out)
    return out


def main() -> None:
    a = build_alaska()
    print(f"alaska.topo.json: {a / 1024:.0f} KB")
    u, cdps = build_upper_su()
    print(f"upper_su.topo.json: {u / 1024:.0f} KB")
    print(f"places.json: {len(build_places(cdps))} places")
    assert a < 400_000 and u < 400_000


if __name__ == "__main__":
    main()
