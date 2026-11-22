/* sec_talkeetna.js: deep dive on Talkeetna and the Upper Susitna Valley. */
(function () {
  const F = AK.fmt;
  // Comparison entities keep one color across every chart in this section.
  // Talkeetna = slot 2 (orange, matches the page highlight), Upper Su = slot 1, Mat-Su = slot 3,
  // Alaska = neutral reference tick (keeps the dot plots within the 3-slot all-pairs cap).
  const AREAS = (C) => [
    { id: "talkeetna", name: "Talkeetna", color: C.s[1] },
    { id: "upper_su", name: "Upper Su (5 CDPs)", color: C.s[0] },
    { id: "matsu", name: "Mat-Su Borough", color: C.s[2] },
    { id: "alaska", name: "Alaska", color: C.ink2, ref: true },
  ];
  const CDP_ROWS = [
    ["trapper_creek", "Trapper Creek"],
    ["willow", "Willow"],
    ["susitna_north", "Susitna North"],
  ];
  const num = (s) => `<span class="num">${s}</span>`;
  // d3 wants clockwise exterior rings; the pipeline's TopoJSON (and AK.UPPER_BBOX) are counter-clockwise,
  // which d3 reads as "the whole globe minus this shape". Reverse rings when a polygon covers > a hemisphere.
  const rewind = (f) => {
    const g = f.geometry;
    if (!g || !/Polygon/.test(g.type) || d3.geoArea(f) <= 2 * Math.PI) return f;
    const rev = (poly) => poly.map((ring) => ring.slice().reverse());
    const geometry = g.type === "Polygon" ? { type: "Polygon", coordinates: rev(g.coordinates) } : { type: "MultiPolygon", coordinates: g.coordinates.map(rev) };
    return { ...f, geometry };
  };
  const rewindFC = (fc) => ({ ...fc, features: fc.features.map(rewind) });
  const BBOX = rewind(AK.UPPER_BBOX);
  let layers = null;
  const upper = () => {
    if (layers) return layers;
    const L = AK.upperLayers();
    layers = { ...L, cdps: rewindFC(L.cdps), matsu: rewindFC(L.matsu), water: rewindFC(L.water) };
    return layers;
  };
  const pm = (v, d = 0) => F.pctMoe(v, d);
  const sumShare = (a, b) =>
    a && b && a[0] != null && b[0] != null ? [a[0] + b[0], Math.sqrt((a[1] || 0) ** 2 + (b[1] || 0) ** 2)] : [null, null];
  const intMoe = (v) => (v && v[0] != null ? F.int(v[0]) + (v[1] ? " ±" + F.int(v[1]) : "") : "–");
  const moneyMoe = (v) => (v && v[0] != null ? F.money(v[0]) + (v[1] ? " ±" + F.money(v[1]) : "") : "–");

  let mode = "ind"; // dot-plot toggle state survives re-renders

  AK.section("talkeetna", (el, D) => {
    const U = D.uppersu;
    const A = (id) => U.acs[id];
    const C = AK.colors();
    const T = A("talkeetna"), S = A("upper_su"), M = A("matsu"), K = A("alaska");
    const selfT = sumShare(T.cls.self_inc, T.cls.self_uninc);
    const selfS = sumShare(S.cls.self_inc, S.cls.self_uninc);
    const selfK = sumShare(K.cls.self_inc, K.cls.self_uninc);
    const zT = U.zbp.zips["99676"];
    const leisureT = zT.sectors.filter((s) => ["72", "71", "48"].includes(s.naics)).reduce((a, s) => a + s.est, 0);
    const ms = U.matsu_seasonal;
    const idx = (arr) => { const m = d3.mean(arr); return arr.map((v) => v / m); };
    const leiRatio = d3.max(ms.leisure) / d3.min(ms.leisure);
    const totRatio = d3.max(ms.total) / d3.min(ms.total);
    const cf = U.cfec.communities;
    const topInd = (a) => Object.entries(a.ind).filter(([, v]) => v[0] != null).sort((x, y) => y[1][0] - x[1][0]).slice(0, 3);
    const tTop = topInd(T);

    el.appendChild(AK.html(`
      <div class="eyebrow">Deep dive · Matanuska-Susitna Borough</div>
      <h2>Talkeetna and the Upper Susitna Valley</h2>
      <div class="prose">
        <p class="lede">About ${num(F.int(Math.round(S.pop[0] / 100) * 100))} people live in the five communities strung along the Parks Highway north of Wasilla: Willow, Susitna North, Talkeetna, Trapper Creek and Chase. Talkeetna sits where the Susitna, Chulitna and Talkeetna rivers meet. It is a stop on the Alaska Railroad and the base for Denali climbing expeditions and flightseeing trips.</p>
        <p>The work here looks very little like the rest of Alaska. Statewide, health care and government lead. In Talkeetna the top three industries for residents are ${tTop.map(([k, v]) => `${U.labels.ind[k].toLowerCase()} (${num(F.pct(v[0]))})`).join(", ")}. ${num(F.pct(selfT[0]))} of working residents are self-employed, about four times the statewide rate of ${num(F.pct(selfK[0]))}. Almost half of Talkeetna's homes (${num(F.pct(T.seasonal_share[0]))}) are cabins and second homes used only part of the year.</p>
      </div>`));

    // ---------- map + tiles ----------
    const grid1 = document.createElement("div");
    grid1.className = "fig-grid";
    el.appendChild(grid1);

    const mapFig = AK.fig({ id: "upper-su-map", title: "The Upper Susitna Valley", sub: "Census places along the Parks Highway, with the Alaska Railroad and the major rivers", note: "Shaded areas are the five Upper Su census places. Source: Census cartographic boundary and TIGER files, 2023." });
    grid1.appendChild(mapFig.root);
    drawMap(mapFig.body, D, C);

    const tileFig = AK.fig({ id: "talkeetna-tiles", title: "Talkeetna at a glance", sub: "Census ACS 2020–2024. ± is the 90% margin of error", note: "Self-employed includes incorporated and unincorporated business owners. Upper Su is the sum of the five places; its median income can't be computed from published data." });
    grid1.appendChild(tileFig.root);
    const tiles = [
      { k: "Residents", v: intMoe(T.pop), d: `Upper Su: ${intMoe(S.pop)}` },
      { k: "Employed residents", v: intMoe(T.employed), d: `Upper Su: ${intMoe(S.employed)}` },
      { k: "Self-employed workers", v: pm(selfT), d: `Upper Su: ${pm(selfS)} · Alaska: ${F.pct(selfK[0])}` },
      { k: "Seasonal & recreational homes", v: pm(T.seasonal_share), d: `Upper Su: ${pm(S.seasonal_share)} · Alaska: ${F.pct(K.seasonal_share[0])}` },
      { k: "Households with self-employment income", v: pm(T.src.self_emp), d: `Upper Su: ${pm(S.src.self_emp)} · Alaska: ${F.pct(K.src.self_emp[0])}` },
      { k: "Median household income", v: moneyMoe(T.median_hh_income), d: `Mat-Su: ${F.money(M.median_hh_income[0])} · Alaska: ${F.money(K.median_hh_income[0])}` },
    ];
    const tw = document.createElement("div");
    tw.className = "tiles";
    for (const t of tiles) {
      const d = document.createElement("div");
      d.className = "tile";
      d.innerHTML = `<span class="k"></span><span class="v"></span><span class="d"></span>`;
      d.children[0].textContent = t.k; d.children[1].textContent = t.v; d.children[2].textContent = t.d;
      tw.appendChild(d);
    }
    tileFig.body.appendChild(tw);

    // ---------- what residents do ----------
    el.appendChild(AK.html(`<h3>What residents do for work</h3>
      <div class="prose"><p>Construction is the largest single line of work across the Upper Su, at ${num(F.pct(S.ind.construction[0]))} of employed residents compared with ${num(F.pct(K.ind.construction[0]))} statewide. Tourism shows up twice: in arts, recreation, lodging and food, and in transportation, which here includes air taxis and flightseeing. Many owners of small lodges and guiding outfits report their job as management, which is why ${num(F.pct(T.occ.management[0]))} of Talkeetna's workers are in management occupations.</p>
      <p>These are survey estimates for small places, so the whiskers are wide. A gap between Talkeetna and Alaska is meaningful only where the whiskers don't overlap the gray Alaska mark.</p></div>`));
    const dotFig = AK.fig({ id: "residents-work", title: mode === "ind" ? "Share of employed residents by industry" : "Share of employed residents by occupation", sub: "Dots are estimates; whiskers show the 90% margin of error", note: "Source: Census ACS 2020–2024, tables C24030 and C24010 (civilian employed residents 16 and older)." });
    el.appendChild(dotFig.root);
    const drawDots = () => {
      dotFig.root.querySelector(".fig-title").textContent = mode === "ind" ? "Share of employed residents by industry" : "Share of employed residents by occupation";
      dotFig.head.replaceChildren(AK.seg([{ value: "ind", label: "Industry" }, { value: "occ", label: "Occupation" }], mode, (v) => { mode = v; drawDots(); }, "Group residents by"));
      dotFig.body.replaceChildren();
      const keys = Object.keys(U.labels[mode]);
      const rows = keys.map((k) => ({ key: k, label: U.labels[mode][k] }))
        .sort((a, b) => (S[mode][b.key][0] ?? 0) - (S[mode][a.key][0] ?? 0));
      dotPlot(dotFig.body, rows, (id, k) => A(id)[mode][k], C, mode === "ind" ? "industry" : "occupation");
    };
    drawDots();

    // ---------- class of worker ----------
    el.appendChild(AK.html(`<h3>Who they work for</h3>
      <div class="prose"><p>One in three Upper Su workers runs their own business, incorporated or not (${num(F.pct(selfS[0]))}). In Talkeetna it is ${num(F.pct(selfT[0]))}. Across Alaska, government employs more people than self-employment does. Up the valley it is the other way around.</p></div>`));
    const clsFig = AK.fig({ id: "class-of-worker", title: "Who employed residents work for", sub: "Share of employed residents by class of worker", note: "Chase is left out: the survey found about 29 residents and no one employed there. Source: Census ACS 2020–2024, table B24080." });
    el.appendChild(clsFig.root);
    classBars(clsFig.body, U, C);

    // ---------- income sources + seasonal homes ----------
    el.appendChild(AK.html(`<h3>Income from more than one job</h3>
      <div class="prose"><p>Households here piece together income from several places. ${num(F.pct(S.src.self_emp[0]))} of Upper Su households have self-employment income, against ${num(F.pct(K.src.self_emp[0]))} statewide. Retirees are a big part of the picture outside Talkeetna: in Trapper Creek ${num(F.pct(A("trapper_creek").src.social_security[0]))} of households collect Social Security and ${num(F.pct(A("trapper_creek").src.retirement[0]))} have a pension or other retirement income. Interest, dividends and rental income reach ${num(F.pct(S.src.interest_div_rent[0]))} of Upper Su households, which fits a place with many cabins to rent.</p></div>`));
    const grid2 = document.createElement("div");
    grid2.className = "fig-grid";
    el.appendChild(grid2);
    const srcFig = AK.fig({ id: "income-sources", title: "Households with each kind of income", sub: "Share of households; whiskers show the 90% margin of error", note: "A household can have several sources. Source: Census ACS 2020–2024, tables B19052–B19059." });
    grid2.appendChild(srcFig.root);
    const srcKeys = ["wages", "self_emp", "interest_div_rent", "social_security", "retirement", "public_assistance", "ssi"];
    dotPlot(srcFig.body, srcKeys.map((k) => ({ key: k, label: U.labels.src[k] })), (id, k) => A(id).src[k], C, "income source");

    const homeFig = AK.fig({ id: "seasonal-homes", title: "Seasonal and recreational homes", sub: "Share of all housing units held for seasonal or occasional use", note: "Chase has few year-round residents, but its housing count of about 300 units is reliable enough to show. Source: Census ACS 2020–2024, tables B25001 and B25004." });
    grid2.appendChild(homeFig.root);
    seasonalHomes(homeFig.body, U, C);

    // ---------- businesses + seasonality ----------
    el.appendChild(AK.html(`<h3>Businesses and the summer rush</h3>
      <div class="prose"><p>The Talkeetna ZIP code had ${num(zT.est)} business establishments with paid staff in 2023, employing ${num(F.int(zT.emp))} people in March and paying ${num(F.moneyK(zT.payroll_k))} in wages over the year. ${num(leisureT)} of those businesses are lodging, restaurants, recreation outfitters or transportation companies such as air taxis. That is ${num(F.pct(leisureT / zT.est))} of the total.</p>
      <p>Monthly job counts aren't published for places this small, so the chart uses the whole Mat-Su Borough. Leisure and hospitality jobs there rise ${num(F.pct(leiRatio - 1))} from the winter low to the August peak. Total jobs move only ${num(F.pct(totRatio - 1))}. With so many of its businesses in tourism, Talkeetna's own summer swing is likely much larger than the borough's.</p></div>`));
    const grid3 = document.createElement("div");
    grid3.className = "fig-grid";
    el.appendChild(grid3);
    const zbpFig = AK.fig({ id: "zbp-99676", title: "Business establishments in ZIP 99676, Talkeetna", sub: "Establishments with paid employees, by industry, 2023", note: "Industries with fewer than 4 establishments are not broken out. Source: Census ZIP Business Patterns 2023." });
    grid3.appendChild(zbpFig.root);
    zbpBars(zbpFig.body, U, C);
    const seaFig = AK.fig({ id: "matsu-seasonal", title: "How the season moves Mat-Su jobs", sub: "Monthly jobs as a share of the yearly average, 2022–2024 average", note: "Wage and salary jobs counted where people work. Source: BLS QCEW, Matanuska-Susitna Borough." });
    grid3.appendChild(seaFig.root);
    seasonLines(seaFig.body, ms, idx, C);

    // ---------- synthesis ----------
    const call = document.createElement("div");
    call.className = "callout";
    call.innerHTML = `<p><strong>How people make a living here.</strong> The summer visitor season pays for much of the valley: lodges, restaurants, gift shops, river and fishing guides, the railroad, and the air taxis that fly climbers to the Kahiltna Glacier and sightseers around Denali. Building trades are the other pillar, much of it work on cabins and homes for part-time residents. Many people do several of these, often running their own small business. Others live here and commute down the Parks Highway to jobs in Wasilla or Anchorage, or work rotations on the North Slope. Retirees and second-home owners bring in Social Security, pensions and money spent locally. Commercial fishing is minor: in 2023, ${num(cf.Talkeetna.holders)} Talkeetna residents held permits and grossed about ${num(F.moneyC(cf.Talkeetna.earnings))}. Willow had ${num(cf.Willow.holders)} permit holders grossing ${num(F.moneyC(cf.Willow.earnings))}, and Trapper Creek ${num(cf["Trapper Creek"].holders)}.</p>
      <p style="margin:0">Survey numbers for Talkeetna, Trapper Creek and Chase have wide margins. The Upper Su total and the Talkeetna ZIP code are steadier guides.</p>`;
    el.appendChild(call);
  });

  // ================= map =================
  function drawMap(body, D, C) {
    const L = upper();
    const width = Math.max(260, body.clientWidth || 500);
    const height = Math.round(Math.min(width * 1.18, 660));
    const svg = d3.select(body).append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img").attr("aria-label", "Map of the Upper Susitna Valley showing Talkeetna, Trapper Creek, Willow, Susitna North and Chase along the Parks Highway and Alaska Railroad");
    const proj = d3.geoConicConformal().parallels([61.5, 63]).rotate([150.3, 0]).fitExtent([[2, 2], [width - 2, height - 2]], BBOX);
    const path = d3.geoPath(proj);
    const clipId = "us-clip-" + Math.random().toString(36).slice(2, 7);
    svg.append("clipPath").attr("id", clipId).append("rect").attr("width", width).attr("height", height).attr("rx", 6);
    const g = svg.append("g").attr("clip-path", `url(#${clipId})`);
    const water = d3.color(C.q[2]); water.opacity = AK.isDark() ? 0.45 : 0.5;
    const waterLine = d3.color(C.q[3]); waterLine.opacity = 0.75;

    g.append("rect").attr("width", width).attr("height", height).attr("fill", C.bg);
    g.append("g").selectAll("path").data(L.matsu.features).join("path").attr("d", path).attr("fill", C.surface).attr("stroke", "none");
    g.append("g").selectAll("path").data(L.water.features).join("path").attr("d", path).attr("fill", water.formatRgb()).attr("stroke", "none");
    g.append("g").selectAll("path").data(L.rivers.features).join("path").attr("d", path).attr("fill", "none")
      .attr("stroke", waterLine.formatRgb()).attr("stroke-linecap", "round")
      .attr("stroke-width", (d) => (/^(Susitna|Chulitna|Talkeetna|Yentna) Riv$/.test(d.properties.name) ? 1.8 : 1));
    g.append("g").selectAll("path").data(L.matsu.features).join("path").attr("d", path).attr("fill", "none")
      .attr("stroke", C.muted).attr("stroke-width", 1).attr("stroke-dasharray", "5 3");

    const hl = d3.color(C.hl);
    const fillU = hl.copy({ opacity: 0.16 }).formatRgb();
    const cdp = g.append("g").selectAll("path").data(L.cdps.features).join("path").attr("d", path)
      .attr("fill", (d) => (d.properties.upper_su ? fillU : "none"))
      .attr("stroke", (d) => (d.properties.upper_su ? C.hl : C.axis))
      .attr("stroke-width", (d) => (d.properties.name === "Talkeetna" ? 1.6 : 1));

    // rail: solid core + cross ties
    g.append("g").selectAll("path").data(L.rail.features).join("path").attr("d", path).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 1);
    g.append("g").selectAll("path").data(L.rail.features).join("path").attr("d", path).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 4).attr("stroke-dasharray", "1 6").attr("opacity", 0.8);
    // roads
    g.append("g").selectAll("path").data(L.roads.features).join("path").attr("d", path).attr("fill", "none")
      .attr("stroke", C.surface).attr("stroke-width", 4.5).attr("stroke-linecap", "round");
    g.append("g").selectAll("path").data(L.roads.features).join("path").attr("d", path).attr("fill", "none")
      .attr("stroke", C.ink2).attr("stroke-width", 2).attr("stroke-linecap", "round");

    const halo = (s) => s.style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3).attr("stroke-linejoin", "round");
    // river labels at the projected centroid of each main river
    const rl = g.append("g").attr("pointer-events", "none");
    for (const name of ["Susitna Riv", "Chulitna Riv", "Talkeetna Riv", "Yentna Riv"]) {
      const f = L.rivers.features.find((d) => d.properties.name === name);
      if (!f) continue;
      const c = path.centroid(f);
      if (!isFinite(c[0]) || c[0] < 0 || c[0] > width || c[1] < 0 || c[1] > height) continue;
      halo(rl.append("text").attr("x", c[0] + 4).attr("y", c[1]).text(name.replace("Riv", "River"))
        .style("font-style", "italic").style("fill", C.muted).style("font-size", "10px"));
    }
    // neighbor CDP labels
    for (const f of L.cdps.features.filter((d) => !d.properties.upper_su)) {
      const c = path.centroid(f);
      if (c[1] > height - 6 || c[1] < 6) continue;
      halo(rl.append("text").attr("x", c[0]).attr("y", c[1]).attr("text-anchor", "middle").text(f.properties.name).style("fill", C.muted).style("font-size", "10px"));
    }
    // Upper Su place points + labels
    const narrow = width < 420;
    const anchors = { Talkeetna: [7, 4, "start"], "Trapper Creek": [-7, 4, "end"], Willow: [7, 4, "start"], "Susitna North": [7, 4, "start"], Chase: [7, 4, "start"], Wasilla: [7, 4, "start"] };
    const pts = D.places.filter((p) => p.kind === "uppersu" || p.name === "Wasilla");
    for (const p of pts) {
      const [x, y] = proj([p.lon, p.lat]);
      if (x < 0 || x > width || y < 0 || y > height) continue;
      const isT = p.name === "Talkeetna";
      rl.append("circle").attr("cx", x).attr("cy", y).attr("r", isT ? 4.5 : 3).attr("fill", isT ? C.hl : C.ink).attr("stroke", C.surface).attr("stroke-width", 2);
      const a = anchors[p.name] || [7, 4, "start"];
      halo(rl.append("text").attr("x", x + a[0]).attr("y", y + a[1]).attr("text-anchor", a[2]).text(p.name)
        .attr("class", isT ? "lbl-strong" : null).style("font-size", isT ? "13px" : narrow ? "10px" : "11px"));
    }
    // Denali
    const den = D.places.find((p) => p.kind === "landmark");
    if (den) {
      const [x, y] = proj([den.lon, den.lat]);
      rl.append("path").attr("d", d3.symbol(d3.symbolTriangle, 70)()).attr("transform", `translate(${x},${y})`).attr("fill", C.ink).attr("stroke", C.surface).attr("stroke-width", 1.5);
      halo(rl.append("text").attr("x", x).attr("y", y - 9).attr("text-anchor", "middle").text("Denali, 20,310 ft").attr("class", "lbl-strong"));
    }
    // CDP hover
    cdp.style("cursor", (d) => (d.properties.upper_su ? "default" : null))
      .on("pointermove", (e, d) => {
        const key = { Talkeetna: "talkeetna", "Trapper Creek": "trapper_creek", Willow: "willow", "Susitna North": "susitna_north", Chase: "chase" }[d.properties.name];
        if (!key) { AK.tip.show(e, `<b>${AK.esc(d.properties.name)}</b><div class="tk">Neighboring census place</div>`); return; }
        const a = D.uppersu.acs[key];
        const self = sumShare(a.cls.self_inc, a.cls.self_uninc);
        AK.tip.show(e, `<b>${AK.esc(d.properties.name)}</b>` + AK.tip.row("Residents", intMoe(a.pop)) + AK.tip.row("Employed", intMoe(a.employed)) +
          AK.tip.row("Self-employed", self[0] == null ? "–" : pm(self)) + AK.tip.row("Seasonal homes", pm(a.seasonal_share)));
      })
      .on("pointerleave", () => AK.tip.hide());

    // inset locator
    const iw = narrow ? 88 : 124, ih = Math.round(iw * 0.72);
    const ig = svg.append("g").attr("transform", `translate(${width - iw - 8},8)`);
    ig.append("rect").attr("width", iw).attr("height", ih).attr("rx", 5).attr("fill", C.surface).attr("stroke", C.axis);
    const inner = ig.append("g");
    const r = AK.drawAlaska(inner, { w: iw, h: ih, fill: () => C.grid });
    inner.selectAll("path").attr("stroke-width", 0.3);
    ig.append("path").attr("d", r.path(BBOX)).attr("fill", "none").attr("stroke", C.hl).attr("stroke-width", 1.6);

    AK.legend(body, [
      { label: "Upper Su census place", color: fillU.replace(/[\d.]+\)$/, "0.45)"), kind: "swatch" },
      { label: "Parks Highway & main roads", color: C.ink2, kind: "line" },
      { label: "Alaska Railroad", color: C.ink, kind: "line" },
      { label: "Rivers & lakes", color: waterLine.formatRgb(), kind: "line" },
      { label: "Mat-Su Borough boundary", color: C.muted, kind: "line" },
    ]);
    const rows = [["talkeetna", "Talkeetna"], ...CDP_ROWS, ["chase", "Chase"], ["upper_su", "Upper Su total"]].map(([id, name]) => {
      const a = D.uppersu.acs[id];
      return { name, pop: a.pop, emp: a.employed, units: a.housing_units, seas: a.seasonal_share };
    });
    AK.table(body, [
      { key: "name", label: "Place" }, { key: "pop", label: "Residents", fmt: intMoe }, { key: "emp", label: "Employed", fmt: intMoe },
      { key: "units", label: "Housing units", fmt: intMoe }, { key: "seas", label: "Seasonal homes", fmt: (v) => pm(v) },
    ], rows);
  }

  // ================= dot plot with MOE whiskers =================
  function dotPlot(body, rows, get, C, what) {
    const areas = AREAS(C);
    const width = Math.max(260, body.clientWidth || 600);
    const narrow = width < 560;
    const labelW = narrow ? 0 : Math.min(230, Math.round(width * 0.34));
    const rowH = narrow ? 46 : 30;
    const m = { t: 20, r: 18, b: 6, l: narrow ? 4 : labelW + 10 };
    const fr = AK.frame(body, { height: m.t + m.b + rows.length * rowH, margin: m, label: `Dot plot comparing Talkeetna, Upper Su, Mat-Su and Alaska by ${what}` });
    const vals = [];
    rows.forEach((r) => areas.forEach((a) => { const v = get(a.id, r.key); if (v && v[0] != null) vals.push(v[0] + (a.ref ? 0 : v[1] || 0)); }));
    const maxV = Math.min(1, Math.ceil((d3.max(vals) || 0.1) * 10) / 10);
    const x = d3.scaleLinear().domain([0, maxV]).range([0, fr.w]);
    const ticks = x.ticks(narrow ? 4 : 6);
    const ax = fr.g.append("g");
    ax.selectAll("line").data(ticks).join("line").attr("x1", x).attr("x2", x).attr("y1", -4).attr("y2", rows.length * rowH).attr("stroke", C.grid);
    ax.selectAll("text").data(ticks).join("text").attr("class", "axis-label").attr("x", x).attr("y", -8).attr("text-anchor", "middle").text((d) => F.pct(d));
    const lane = (k) => (k - 1) * 5 - 2;
    rows.forEach((r, i) => {
      const y0 = i * rowH;
      const g = fr.g.append("g").attr("transform", `translate(0,${y0})`);
      const cy = narrow ? 30 : rowH / 2;
      if (narrow) g.append("text").attr("x", 0).attr("y", 12).text(r.label).attr("fill", C.ink2);
      else g.append("text").attr("x", -10).attr("y", cy + 4).attr("text-anchor", "end").text(r.label).attr("fill", C.ink2);
      g.append("line").attr("x1", 0).attr("x2", fr.w).attr("y1", cy).attr("y2", cy).attr("stroke", C.grid).attr("stroke-opacity", 0.6);
      areas.forEach((a, k) => {
        const v = get(a.id, r.key);
        if (!v || v[0] == null) return;
        const yy = cy + (a.ref ? 0 : lane(k));
        if (a.ref) {
          g.append("line").attr("x1", x(v[0])).attr("x2", x(v[0])).attr("y1", cy - 9).attr("y2", cy + 9).attr("stroke", a.color).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
          return;
        }
        const lo = Math.max(0, v[0] - (v[1] || 0)), hi = Math.min(maxV, v[0] + (v[1] || 0));
        g.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", yy).attr("y2", yy).attr("stroke", a.color).attr("stroke-width", 2).attr("stroke-opacity", 0.45).attr("stroke-linecap", "round");
        g.append("circle").attr("cx", x(v[0])).attr("cy", yy).attr("r", 4.5).attr("fill", a.color).attr("stroke", C.surface).attr("stroke-width", 2);
      });
      g.append("rect").attr("x", -m.l).attr("y", 0).attr("width", fr.w + m.l + m.r).attr("height", rowH).attr("fill", "transparent")
        .on("pointermove", (e) => {
          AK.tip.show(e, `<b>${AK.esc(r.label)}</b>` + areas.map((a) => AK.tip.row(a.name, pm(get(a.id, r.key)), a.color)).join(""));
        })
        .on("pointerleave", () => AK.tip.hide());
    });
    AK.legend(body, areas.map((a) => ({ label: a.ref ? "Alaska (reference mark)" : a.name, color: a.color, kind: a.ref ? "line" : "dot" })));
    AK.table(body, [{ key: "label", label: what[0].toUpperCase() + what.slice(1) }, ...areas.map((a) => ({ key: a.id, label: a.name, fmt: (v) => pm(v) }))],
      rows.map((r) => Object.assign({ label: r.label }, Object.fromEntries(areas.map((a) => [a.id, get(a.id, r.key)])))));
  }

  // ================= class of worker: tall segmented bars =================
  function classBars(body, U, C) {
    const dark = AK.isDark();
    const cats = [
      { key: "self", label: "Self-employed", parts: ["self_inc", "self_uninc"], color: C.q[5], ink: dark ? "#0b0b0b" : "#ffffff" },
      { key: "private", label: "Private-company employee", parts: ["private"], color: C.q[2], ink: dark ? "#ffffff" : "#0b0b0b" },
      { key: "gov", label: "Government (federal, state, local)", parts: ["federal_gov", "state_gov", "local_gov"], color: C.muted, ink: "#ffffff" },
      { key: "np", label: "Nonprofit & unpaid family", parts: ["nonprofit", "unpaid"], color: C.axis, ink: dark ? "#ffffff" : "#0b0b0b" },
    ];
    const ids = [["talkeetna", "Talkeetna"], ...CDP_ROWS, ["upper_su", "Upper Su total"], ["matsu", "Mat-Su Borough"], ["alaska", "Alaska"]];
    const rows = ids.map(([id, name]) => {
      const c = U.acs[id].cls;
      const segs = cats.map((ct) => {
        const vs = ct.parts.map((p) => c[p]).filter((v) => v && v[0] != null);
        const share = d3.sum(vs, (v) => v[0]);
        const moe = Math.sqrt(d3.sum(vs, (v) => (v[1] || 0) ** 2));
        return { ...ct, share, moe };
      });
      return { id, name, segs };
    });
    const width = Math.max(260, body.clientWidth || 600);
    const narrow = width < 560;
    const labelW = narrow ? 0 : 128;
    const barH = 28, rowH = narrow ? 52 : 40;
    const m = { t: 4, r: narrow ? 4 : 52, b: 4, l: narrow ? 4 : labelW + 10 };
    const fr = AK.frame(body, { height: m.t + m.b + rows.length * rowH, margin: m, label: "Stacked bars of class of worker for Upper Su places, Mat-Su and Alaska" });
    const x = d3.scaleLinear().domain([0, 1]).range([0, fr.w]);
    rows.forEach((r, i) => {
      const yTop = i * rowH + (narrow ? 18 : (rowH - barH) / 2);
      const g = fr.g.append("g");
      const isT = r.id === "talkeetna";
      const lbl = narrow
        ? g.append("text").attr("x", 0).attr("y", i * rowH + 12)
        : g.append("text").attr("x", -10).attr("y", yTop + barH / 2 + 4).attr("text-anchor", "end");
      lbl.text(narrow ? `${r.name} · ${F.pct(r.segs[0].share)} self-employed` : r.name).attr("class", isT ? "lbl-strong" : null);
      const tot = d3.sum(r.segs, (s) => s.share) || 1;
      let acc = 0;
      r.segs.forEach((s) => {
        const w = x(s.share / tot);
        if (w <= 0.5) return;
        const x0 = x(acc / tot) + (acc > 0 ? 1 : 0);
        const ww = Math.max(0, w - (acc > 0 ? 1 : 0) - (acc + s.share < tot - 1e-6 ? 1 : 0));
        acc += s.share;
        g.append("rect").attr("x", x0).attr("y", yTop).attr("width", ww).attr("height", barH).attr("rx", 4).attr("fill", s.color)
          .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(r.name)}</b>` + AK.tip.row(s.label, F.pctMoe([s.share, s.moe]), s.color)))
          .on("pointerleave", () => AK.tip.hide());
        const label = F.pct(s.share);
        if (ww > label.length * 7 + 10) g.append("text").attr("x", x0 + 6).attr("y", yTop + barH / 2 + 4).text(label).style("fill", s.ink).attr("pointer-events", "none").style("font-weight", 500);
      });
      if (!narrow) g.append("text").attr("x", fr.w + 8).attr("y", yTop + barH / 2 + 4).attr("class", "lbl-val").text(F.pct(r.segs[0].share));
    });
    if (!narrow) fr.svg.append("text").attr("x", fr.width - 2).attr("y", 10).attr("text-anchor", "end").attr("class", "axis-label").text("self-emp.");
    AK.legend(body, cats.map((c) => ({ label: c.label, color: c.color })));
    AK.table(body, [{ key: "name", label: "Area" }, ...cats.map((c, k) => ({ key: "c" + k, label: c.label, fmt: (v) => F.pctMoe(v) }))],
      rows.map((r) => Object.assign({ name: r.name }, Object.fromEntries(r.segs.map((s, k) => ["c" + k, [s.share, s.moe]])))));
  }

  // ================= seasonal homes =================
  function seasonalHomes(body, U, C) {
    const color = { talkeetna: C.s[1], upper_su: C.s[0], matsu: C.s[2], alaska: C.muted };
    const ids = [["chase", "Chase"], ["trapper_creek", "Trapper Creek"], ["willow", "Willow"], ["susitna_north", "Susitna North"], ["talkeetna", "Talkeetna"], ["upper_su", "Upper Su total"], ["matsu", "Mat-Su Borough"], ["alaska", "Alaska"]];
    const rows = ids.map(([id, name]) => ({ id, name, v: U.acs[id].seasonal_share, units: U.acs[id].seasonal_units })).filter((r) => r.v && r.v[0] != null);
    const width = Math.max(260, body.clientWidth || 500);
    const labelW = width < 420 ? 92 : 112;
    const rowH = 30, barH = 18;
    const fr = AK.frame(body, { height: rows.length * rowH + 26, margin: { t: 4, r: 70, b: 22, l: labelW }, label: "Bar chart of seasonal home share by place" });
    const x = d3.scaleLinear().domain([0, 1]).range([0, fr.w]);
    fr.g.append("g").attr("class", "grid").attr("transform", `translate(0,${rows.length * rowH})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat((d) => F.pct(d)).tickSize(-rows.length * rowH)).call((g) => g.select(".domain").remove());
    rows.forEach((r, i) => {
      const y = i * rowH + (rowH - barH) / 2;
      const c = color[r.id] || C.q[2];
      fr.g.append("text").attr("x", -8).attr("y", y + barH / 2 + 4).attr("text-anchor", "end").text(r.name).attr("class", r.id === "talkeetna" ? "lbl-strong" : null);
      fr.g.append("path").attr("d", AK.hbarPath(0, y, x(r.v[0]), barH)).attr("fill", c);
      if (r.v[1]) {
        const lo = x(Math.max(0, r.v[0] - r.v[1])), hi = x(Math.min(1, r.v[0] + r.v[1]));
        fr.g.append("line").attr("x1", lo).attr("x2", hi).attr("y1", y + barH / 2).attr("y2", y + barH / 2).attr("stroke", C.ink).attr("stroke-width", 1.5);
        fr.g.append("line").attr("x1", hi).attr("x2", hi).attr("y1", y + 4).attr("y2", y + barH - 4).attr("stroke", C.ink).attr("stroke-width", 1.5);
      }
      fr.g.append("text").attr("x", x(Math.min(1, r.v[0] + (r.v[1] || 0))) + 6).attr("y", y + barH / 2 + 4).attr("class", "lbl-val").text(F.pct(r.v[0]));
      fr.g.append("rect").attr("x", -labelW).attr("y", i * rowH).attr("width", fr.w + labelW + 70).attr("height", rowH).attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(r.name)}</b>` + AK.tip.row("Seasonal share", pm(r.v)) + AK.tip.row("Seasonal units", intMoe(r.units))))
        .on("pointerleave", () => AK.tip.hide());
    });
    AK.table(body, [{ key: "name", label: "Place" }, { key: "v", label: "Seasonal share", fmt: (v) => pm(v) }, { key: "units", label: "Seasonal units", fmt: intMoe }], rows);
  }

  // ================= ZBP establishments =================
  function zbpBars(body, U, C) {
    const z = U.zbp.zips["99676"];
    const rows = [...z.sectors].sort((a, b) => b.est - a.est);
    const width = Math.max(260, body.clientWidth || 500);
    const narrow = width < 460;
    const labelW = narrow ? 0 : Math.min(210, Math.round(width * 0.42));
    const rowH = narrow ? 38 : 28, barH = 16;
    const fr = AK.frame(body, { height: rows.length * rowH + 6, margin: { t: 2, r: 34, b: 4, l: narrow ? 2 : labelW + 8 }, label: "Bar chart of Talkeetna business establishments by industry" });
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.est)]).range([0, fr.w]);
    rows.forEach((r, i) => {
      const y = i * rowH + (narrow ? 16 : (rowH - barH) / 2);
      if (narrow) fr.g.append("text").attr("x", 0).attr("y", i * rowH + 11).text(r.label);
      else fr.g.append("text").attr("x", -8).attr("y", y + barH / 2 + 4).attr("text-anchor", "end").text(r.label);
      fr.g.append("path").attr("d", AK.hbarPath(0, y, x(r.est), barH)).attr("fill", C.s[1]);
      fr.g.append("text").attr("x", x(r.est) + 6).attr("y", y + barH / 2 + 4).attr("class", "lbl-val").text(r.est);
      fr.g.append("rect").attr("x", narrow ? 0 : -labelW).attr("y", i * rowH).attr("width", fr.w + labelW + 34).attr("height", rowH).attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(r.label)}</b>` + AK.tip.row("Establishments", r.est) + AK.tip.row("Share of ZIP total", F.pct(r.est / z.est))))
        .on("pointerleave", () => AK.tip.hide());
    });
    AK.table(body, [{ key: "label", label: "Industry" }, { key: "est", label: "Establishments" }], rows, "Show the industry counts");
    const zs = ["99676", "99683", "99688"].map((k) => ({ zip: `${k} ${U.zbp.zips[k].name}`, ...U.zbp.zips[k] }));
    const det = AK.table(body, [
      { key: "zip", label: "ZIP code" }, { key: "est", label: "Establishments" }, { key: "emp", label: "Employees (March)", fmt: F.int },
      { key: "payroll_k", label: "Annual payroll", fmt: F.moneyK },
    ], zs, "Compare the three Upper Su ZIP codes");
    det.open = true;
  }

  // ================= Mat-Su seasonality lines =================
  function seasonLines(body, ms, idx, C) {
    const series = [
      { key: "leisure", name: "Leisure & hospitality", color: C.s[0], v: idx(ms.leisure), raw: ms.leisure },
      { key: "construction", name: "Construction", color: C.s[2], v: idx(ms.construction), raw: ms.construction },
      { key: "total", name: "All jobs", color: C.muted, v: idx(ms.total), raw: ms.total },
    ];
    const width = Math.max(260, body.clientWidth || 500);
    const narrow = width < 460;
    const fr = AK.frame(body, { height: narrow ? 230 : 260, margin: { t: 12, r: narrow ? 14 : 92, b: 26, l: 40 }, label: "Line chart of Mat-Su monthly jobs indexed to the yearly average" });
    const x = d3.scalePoint().domain(d3.range(12)).range([0, fr.w]);
    const all = series.flatMap((s) => s.v);
    const y = d3.scaleLinear().domain([Math.floor(d3.min(all) * 20) / 20, Math.ceil(d3.max(all) * 20) / 20]).range([fr.h, 0]);
    fr.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-fr.w).tickFormat((d) => F.pct(d))).call((g) => g.select(".domain").remove());
    fr.g.append("g").attr("transform", `translate(0,${fr.h})`).call(d3.axisBottom(x).tickFormat((i) => (narrow ? F.month(i)[0] : F.month(i))).tickSizeOuter(0));
    fr.g.append("line").attr("x1", 0).attr("x2", fr.w).attr("y1", y(1)).attr("y2", y(1)).attr("stroke", C.axis);
    const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
    series.forEach((s) => {
      fr.g.append("path").attr("d", line(s.v)).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
      const pk = d3.maxIndex(s.v);
      fr.g.append("circle").attr("cx", x(pk)).attr("cy", y(s.v[pk])).attr("r", 4).attr("fill", s.color).attr("stroke", C.surface).attr("stroke-width", 2);
    });
    if (!narrow) {
      const ends = series.map((s) => ({ s, y: y(s.v[11]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
      ends.forEach((e) => fr.g.append("text").attr("x", fr.w + 8).attr("y", e.y + 4).text(e.s.name).style("font-size", "10.5px"));
    }
    const cross = fr.g.append("line").attr("y1", 0).attr("y2", fr.h).attr("stroke", C.axis).attr("visibility", "hidden");
    fr.g.append("rect").attr("width", fr.w).attr("height", fr.h).attr("fill", "transparent")
      .on("pointermove", (e) => {
        const [mx] = d3.pointer(e);
        const i = Math.max(0, Math.min(11, Math.round(mx / (fr.w / 11))));
        cross.attr("x1", x(i)).attr("x2", x(i)).attr("visibility", "visible");
        AK.tip.show(e, `<b>${F.month(i)}, 2022–24 average</b>` + series.map((s) => AK.tip.row(s.name, `${F.int(s.raw[i])} jobs · ${F.pct(s.v[i])}`, s.color)).join(""));
      })
      .on("pointerleave", () => { cross.attr("visibility", "hidden"); AK.tip.hide(); });
    AK.legend(body, series.map((s) => ({ label: s.name, color: s.color, kind: "line" })));
    AK.table(body, [{ key: "m", label: "Month" }, ...series.map((s) => ({ key: s.key, label: s.name + " (jobs)", fmt: F.int })), ...series.map((s) => ({ key: s.key + "_i", label: s.name + " (% of avg)", fmt: (v) => F.pct(v) }))],
      d3.range(12).map((i) => Object.assign({ m: F.month(i) }, ...series.map((s) => ({ [s.key]: s.raw[i], [s.key + "_i"]: s.v[i] })))));
  }
})();
