# Data contract: pipeline → report

Every file is in `report/data/` or `report/geo/`, written compactly (`common.write_json`).
- **Missing values:** suppressed, missing or not-applicable values are `null`, never 0.
- **Money:** in dollars unless the key ends in `_k` (thousands of dollars).
- **Shares:** fractions from 0 to 1.
- **ACS values:** `[estimate, moe]` pairs. The moe is 90%; use `null` if unavailable.
- **Share MOE:** for derived shares use the ACS proportion formula, `sqrt(mx² − p²·my²)/y`, and switch to `+` when the term under the root is negative.

## Keys
- **Supersector codes** are QCEW `1011`…`1029`, with labels from `common.SUPERSECTORS`.
- **Spotlight codes** are from `common.SPOTLIGHT`.
- **ACS resident industry groups** (`ind`), from C24030 with male + female summed:
  `ag_fish` (004), `mining` (005), `construction` (006), `manufacturing` (007), `trade` (008+009), `transport` (010), `info_fin` (013+014), `prof` (017), `education` (022), `health` (023), `leisure` (024), `other` (027), `public_admin` (028). The female line is the male line + 27.
- **ACS occupation groups** (`occ`), from C24010 with the female line = male line + 36:
  `management` (004), `stem` (007), `edu_legal_arts` (011), `health_pract` (016), `health_support` (020), `protective` (021), `food` (024), `cleaning` (025), `personal_care` (026), `sales` (028), `office` (029), `farm_fish` (031), `construction_extraction` (032), `repair` (033), `production` (035), `transport_moving` (036+037).
- **ACS class of worker** (`cls`), from B24080 with the female line = male line + 10:
  `private` (004), `self_inc` (005), `nonprofit` (006), `local_gov` (007), `state_gov` (008), `federal_gov` (009), `self_uninc` (010), `unpaid` (011).
- **Household income sources** (`src`): the share of households "with" each source, using line 002 / 001.
  `wages` (B19052), `self_emp` (B19053), `interest_div_rent` (B19054), `social_security` (B19055), `ssi` (B19056), `public_assistance` (B19057), `retirement` (B19059).

## geo/alaska.topo.json  (lon/lat, quantized, simplified to under ~400 KB)
- `objects.boroughs`: the 30 current boroughs, with props `{fips, name}`. Names are short and come from `common.BOROUGHS`.

## geo/upper_su.topo.json  (lon/lat; clipped to bbox lon −151.8…−148.8, lat 61.45…63.25)
- `objects.cdps`: the 5 Upper Su CDPs plus Houston, Big Lake and Meadow Lakes if present. Props `{geoid, name, upper_su: bool}`.
- `objects.matsu`: the Mat-Su borough outline.
- `objects.roads`: primary/secondary roads, props `{name}`.
- `objects.rail`: rail lines.
- `objects.rivers`: named linear water for Susitna, Chulitna, Talkeetna, Yentna and Deshka, props `{name}`.
- `objects.water`: area-water polygons over ~1 km², which ensures the major rivers and lakes show.

## data/places.json
`[{name, lon, lat, kind}]`, where `kind` is one of:
- `city`: Anchorage, Fairbanks, Juneau, Wasilla, Bethel, Kodiak, Nome, Utqiagvik, Ketchikan, Dillingham, Kotzebue, Valdez, Sitka, Unalaska, Prudhoe Bay.
- `uppersu`: Talkeetna, Trapper Creek, Willow, Susitna North, Chase. These are CDP centroids taken from the place file.
- `landmark`: Denali summit (63.0692, −151.0070).

## data/overview.json
```
{ year: 2024,
  qcew_total: {jobs, avg_pay, by_own: {federal|state|local|private: {jobs, avg_pay}}},
  supersectors: [{code, label, jobs, avg_pay, lq}],        // private, statewide 2024
  spotlight:    [{code, label, jobs, avg_pay, lq}],
  all_jobs_bea: {year: 2022, total, wage_salary, proprietors,
                 sectors: [{line, label, jobs}],            // CAEMP25N private sectors (100..1900)
                 gov: {federal_civilian, military, state, local}},
  headline: {population, employed, self_employed_share, gov_share_jobs,
             per_capita_income, per_capita_income_year, pfd: {year, amount}} }
```

## data/boroughs.json
```
{ year: 2024, boroughs: { "<fips>": {
    name, pop, employed, unemp_rate,                       // ACS 2020-24
    jobs, avg_pay, gov_share, fed_jobs, state_jobs, local_jobs, private_jobs,   // QCEW 2024
    supersectors: {"<code>": {jobs|null, lq|null}},
    spotlight:    {"<code>": {jobs|null, lq|null}},
    top_supersector: label|null,
    resident_industry: {"<ind>": share},  top_resident_industry: "<ind>",
    self_employed_share,                                   // (self_inc+self_uninc)/total
    income: {year: 2024, pi_k, pop, per_capita, wages_k, supplements_k, proprietors_k,
             dir_k, transfers_k, contributions_k, residence_adj_k},
    transfers_detail: {year: 2022, total_k, social_security_k, medicare_k, medicaid_k,
                       income_maint_k, veterans_k, other_gov_k},   // other_gov ≈ PFD
    transfer_share, pfd_share,                             // transfers/pi (2024), other_gov/pi (2022)
    cfec: {year: 2023, holders, permits, fishermen, earnings} | null,
    seasonal: {months: [12 avg total jobs, 2022-24], ratio /*max/min*/, leisure: [12]|null},
    growth: {y0: 2010, y1: 2022, jobs0, jobs1, pct, group: "valdez-cordova"|null}  // BEA total employment
} } }
```

## data/seasonal.json
```
{ labels: {"<code>": label},
  state: {months: ["2014-01", ...], total: [...], gov: [...], supersectors: {"<code>": [...]}},
  matsu: {months: ["2022-01", ...], total: [...], supersectors: {"<code>": [...]}} }
```

## data/trends.json
```
{ bea_emp: {years: [2001..2022], total, wage_salary, proprietors,
            sectors: {"<label>": [...]}, gov: {federal_civilian, military, state_local}},
  qcew_spot: {years: [2014..2025], series: {"<code>": {label, jobs: [...], pay: [...]}}},
  income: {years: [2001..2024], per_capita, components_k: {wages, supplements, proprietors,
           dir, transfers, contributions, residence_adj}},
  transfers: {years: [2001..2022], social_security_k, medicare_k, medicaid_k, income_maint_k,
              veterans_k, other_gov_k},
  pfd: [{year, amount, disbursed, recipients}],             // 1982..latest
  cfec_resident: {years: [2000..2023], holders, fishermen, earnings},
  cfec_groups: {year: 2023, rows: [{group, holders, fishermen, earnings}]},      // AK residents
  cfec_residency: {year: 2023, rows: [{who, holders, fishermen, earnings}]},
  borough_emp: {years: [2010..2022], series: {"<fips or 'valdez-cordova'>": [...]}} }
```

## data/uppersu.json
```
{ areas: [{id, name, kind}],   // ids: talkeetna, trapper_creek, willow, susitna_north, chase,
                               //      upper_su (sum of 5 CDPs, MOE by root-sum-square),
                               //      z99676, z99683, z99688, matsu, alaska
  labels: {ind: {...}, occ: {...}, cls: {...}, src: {...}},
  acs: {"<id>": {pop, employed, unemp_rate, lfpr, median_hh_income, per_capita,   // [e,m]
                 ind: {"<ind>": [share, moe]}, occ: {...}, cls: {...},
                 ind_n: {"<ind>": [e, m]},                  // counts as well
                 src: {"<src>": [share, moe]},
                 housing_units, seasonal_units, seasonal_share}},  // [e,m]
  zbp: {year: 2023, zips: {"99676": {name, est, emp, payroll_k,
        sectors: [{naics, label, est}]}}},
  cfec: {year: 2023, communities: {"<name>": {holders, permits, fishermen, earnings,
         groups: [{group, holders, fishermen, earnings}]}}},
  matsu_seasonal: {years: "2022-2024", total: [12], leisure: [12], trade: [12], construction: [12]} }
```
