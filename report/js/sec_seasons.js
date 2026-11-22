/* sec_seasons.js: "Summer jobs, winter quiet". Monthly swings statewide, by industry, by borough. */
(function () {
  const F = AK.fmt;
  const MONTHS = d3.range(12);
  const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ---------- data helpers ----------
  /** Average each calendar month over the given years; nulls skipped. */
  function monthProfile(months, values, years) {
    const sums = Array(12).fill(0), ns = Array(12).fill(0);
    months.forEach((m, i) => {
      const [y, mo] = m.split("-").map(Number);
      if (!years.includes(y) || values[i] == null) return;
      sums[mo - 1] += values[i];
      ns[mo - 1] += 1;
    });
    return sums.map((s, i) => (ns[i] ? s / ns[i] : null));
  }
  const short = (n) => (n === "Matanuska-Susitna" ? "Mat-Su" : n === "Fairbanks North Star" ? "Fairbanks NS" : n);
  const mean = (a) => d3.mean(a.filter((v) => v != null));

  function stats(D) {
    const st = D.seasonal.state;
    const years = [2022, 2023, 2024];
    const tot = monthProfile(st.months, st.total, years);
    const totMean = mean(tot);
    const peakI = d3.maxIndex(tot), lowI = d3.minIndex(tot);
    const leis = monthProfile(st.months, st.supersectors["1026"], years);
    const manu = monthProfile(st.months, st.supersectors["1013"], years);
    const rows = Object.entries(D.seasonal.labels)
      .filter(([code]) => code !== "1029")
      .map(([code, label]) => {
        const prof = monthProfile(st.months, st.supersectors[code] || [], years);
        if (prof.some((v) => v == null)) return null;
        const m = mean(prof);
        const dev = prof.map((v) => v / m - 1);
        return { code, label: code === "1013" ? "Manufacturing (mostly seafood)" : label, prof, mean: m, dev, swing: d3.max(prof) / d3.min(prof) - 1 };
      })
      .filter(Boolean)
      .sort((a, b) => b.swing - a.swing);
    return {
      tot, totMean, peakI, lowI,
      swing: tot[peakI] / tot[lowI] - 1,
      added: tot[peakI] - tot[lowI],
      leisSwing: d3.max(leis) / d3.min(leis) - 1,
      leisAdded: d3.max(leis) - d3.min(leis),
      manuSwing: d3.max(manu) / d3.min(manu) - 1,
      rows,
    };
  }


  // ---------- local map drawing ----------
  // Rings in the shared TopoJSON may be wound for planar use; d3 needs clockwise exteriors.
  // Rewind only features whose spherical area exceeds a hemisphere (idempotent).
  function rewindFeature(f) {
    if (d3.geoArea(f) <= 2 * Math.PI) return f;
    const g = f.geometry;
    const rev = (poly) => poly.map((ring) => ring.slice().reverse());
    const geometry = g.type === "Polygon" ? { type: "Polygon", coordinates: rev(g.coordinates) }
      : { type: "MultiPolygon", coordinates: g.coordinates.map(rev) };
    return { type: "Feature", properties: f.properties, geometry };
  }
  let _fc = null;
  const boroughs = () => (_fc ||= { type: "FeatureCollection", features: AK.boroughFeatures().features.map(rewindFeature) });
  function drawMap(g, { w, h, fill, onHover }) {
    const C = AK.colors();
    const fc = boroughs();
    const projection = d3.geoConicEqualArea().parallels([55, 65]).rotate([154, 0]).center([0, 62]).fitExtent([[6, 6], [w - 6, h - 6]], fc);
    const path = d3.geoPath(projection);
    g.append("g").selectAll("path").data(fc.features).join("path").attr("d", path)
      .attr("fill", (d) => fill(d.properties.fips)).attr("stroke", C.surface).attr("stroke-width", 0.8).attr("stroke-linejoin", "round")
      .on("pointermove", (e, d) => onHover(e, d.properties.fips)).on("pointerleave", (e) => onHover(e, null));
    const pg = g.append("g").attr("pointer-events", "none");
    for (const p of AK.data.places.filter((p) => p.kind === "city")) {
      const [x, y] = projection([p.lon, p.lat]);
      pg.append("circle").attr("cx", x).attr("cy", y).attr("r", 2.5).attr("fill", C.ink).attr("stroke", C.surface).attr("stroke-width", 1.5);
    }
  }

  // ---------- render ----------
  AK.section("seasons", (el, D) => {
    const S = stats(D);
    const B = D.boroughs.boroughs;
    const bb = B["02060"], den = B["02068"], anc = B["02020"], ms = B["02170"];

    el.appendChild(AK.html(`
      <div class="eyebrow">Seasons</div>
      <h2>Summer jobs, winter quiet</h2>
      <div class="prose">
        <p class="lede">Alaska adds about <span class="num">${F.compact(S.added)}</span> wage jobs between its winter low and its summer peak. That's a swing of <span class="num">${F.pct(S.swing)}</span>, and it repeats every year.</p>
        <p>From 2022 to 2024 the low month was <span class="num">${FULL[S.lowI]}</span>, at about <span class="num">${F.compact(S.tot[S.lowI])}</span> jobs, and the peak was <span class="num">${FULL[S.peakI]}</span>, at about <span class="num">${F.compact(S.tot[S.peakI])}</span>. Most of the swing comes from a few industries. Leisure &amp; hospitality grows <span class="num">${F.pct(S.leisSwing)}</span> from trough to peak as hotels, lodges, tour operators and restaurants staff up for cruise passengers and highway travelers. Manufacturing, which in Alaska mostly means seafood processing, more than triples its workforce at the summer peak (<span class="num">${F.ratio(S.manuSwing + 1, 1)}</span> the winter low), because the plants run hard for a few weeks of salmon and pollock and then go quiet.</p>
        <p>The swing is far larger in some boroughs. Bristol Bay has <span class="num">${F.ratio(bb.seasonal.ratio, 1)}</span> as many wage jobs in its peak month as in its slowest, because the world's largest sockeye run fills its canneries in June and July. Denali Borough swings <span class="num">${F.ratio(den.seasonal.ratio, 1)}</span> with the national park's short season. Anchorage (<span class="num">${F.ratio(anc.seasonal.ratio)}</span>) and Mat-Su (<span class="num">${F.ratio(ms.seasonal.ratio)}</span>) barely move. Their economies run on health care, government, retail and services that work all year, and their summer hiring is partly offset by school staff on break.</p>
        <p>These counts cover wage-and-salary jobs only. The fishermen who catch the salmon are mostly self-employed and don't appear here. The commercial fishing figures in the next section come from permit data instead.</p>
      </div>`));

    lineChart(el, D, S);
    heatmap(el, S);
    boroughSwing(el, D);
    multiples(el, D);
  });

  // (1) statewide monthly total
  function lineChart(el, D, S) {
    const st = D.seasonal.state;
    const pts = st.months.map((m, i) => ({ date: d3.timeParse("%Y-%m")(m), m, v: st.total[i] })).filter((d) => d.v != null);
    const fig = AK.fig({
      id: "seasons-monthly",
      title: "Wage-and-salary jobs in Alaska, every month since 2014",
      sub: "Jobs covered by unemployment insurance, all industries and government",
      note: "Source: BLS Quarterly Census of Employment and Wages (monthly employment), 2014–2025.",
    });
    el.appendChild(fig.root);
    const C = AK.colors();
    const narrow = fig.body.clientWidth < 520;
    const f = AK.frame(fig.body, { height: narrow ? 240 : 300, margin: { t: 26, r: 14, b: 26, l: 44 }, label: "Monthly wage jobs in Alaska, 2014 to 2025" });
    const x = d3.scaleTime().domain(d3.extent(pts, (d) => d.date)).range([0, f.w]);
    const y = d3.scaleLinear().domain([d3.min(pts, (d) => d.v) * 0.97, d3.max(pts, (d) => d.v) * 1.01]).nice().range([f.h, 0]);
    f.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-f.w).tickFormat("")).call((g) => g.select(".domain").remove());
    f.g.append("g").attr("transform", `translate(0,${f.h})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(narrow ? 2 : 1)).tickFormat(d3.timeFormat(narrow ? "'%y" : "%Y")).tickSizeOuter(0));
    f.g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat((v) => F.compact(v)).tickSize(0)).call((g) => g.select(".domain").remove()).selectAll("text").attr("dx", -4);
    f.g.append("path").datum(pts).attr("fill", "none").attr("stroke", C.s[0]).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
      .attr("d", d3.line().x((d) => x(d.date)).y((d) => y(d.v)));

    // annotations
    const ann = [];
    const covid = pts.filter((d) => d.m.startsWith("2020")).reduce((a, b) => (b.v < a.v ? b : a));
    ann.push({ d: covid, text: `${F.month(covid.date.getMonth())} 2020: COVID low`, dy: 18 });
    const p24 = pts.filter((d) => d.m.startsWith("2024"));
    const peak = p24.reduce((a, b) => (b.v > a.v ? b : a));
    const low = p24.reduce((a, b) => (b.v < a.v ? b : a));
    ann.push({ d: peak, text: `Summer peak ${F.compact(peak.v)}`, dy: -10 });
    if (!narrow) ann.push({ d: low, text: `Winter low ${F.compact(low.v)}`, dy: 18 });
    for (const a of ann) {
      const ax = x(a.d.date), ay = y(a.d.v);
      f.g.append("circle").attr("cx", ax).attr("cy", ay).attr("r", 4).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2);
      const anchor = ax > f.w * 0.8 ? "end" : ax < f.w * 0.15 ? "start" : "middle";
      f.g.append("text").attr("x", ax).attr("y", ay + a.dy).attr("text-anchor", anchor).text(a.text)
        .style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3);
    }

    // crosshair
    const hover = f.g.append("g").attr("pointer-events", "none").style("display", "none");
    hover.append("line").attr("y1", 0).attr("y2", f.h).attr("stroke", C.axis);
    const dot = hover.append("circle").attr("r", 4.5).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2);
    const bis = d3.bisector((d) => d.date).center;
    f.g.append("rect").attr("width", f.w).attr("height", f.h).attr("fill", "transparent")
      .on("pointermove", (e) => {
        const [mx] = d3.pointer(e);
        const d = pts[bis(pts, x.invert(mx))];
        hover.style("display", null).attr("transform", `translate(${x(d.date)},0)`);
        dot.attr("cy", y(d.v));
        AK.tip.show(e, `<b>${d3.timeFormat("%B %Y")(d.date)}</b>${AK.tip.row("Wage jobs", F.int(d.v))}`);
      })
      .on("pointerleave", () => { hover.style("display", "none"); AK.tip.hide(); });

    AK.table(fig.root, [{ key: "m", label: "Month" }, { key: "v", label: "Jobs", fmt: F.int }], pts);
  }

  // (2) industry × month heatmap
  function heatmap(el, S) {
    const fig = AK.fig({
      id: "seasons-heatmap",
      title: "Which industries swell in summer",
      sub: "Each month's jobs compared with that industry's own yearly average, 2022–2024. Sorted by swing size.",
      note: "Source: BLS QCEW, private industries statewide. Blue is above average, red below. Industries with suppressed months are left out.",
    });
    el.appendChild(fig.root);
    const C = AK.colors();
    const width = fig.body.clientWidth;
    const narrow = width < 560;
    const labelW = narrow ? 118 : 210;
    const cellH = 26;
    const f = AK.frame(fig.body, { height: S.rows.length * cellH + 26, margin: { t: 20, r: 6, b: 6, l: labelW }, label: "Heatmap of monthly job swings by industry" });
    const maxAbs = d3.max(S.rows, (r) => d3.max(r.dev, Math.abs));
    const color = AK.div([-maxAbs, 0, maxAbs]);
    const x = d3.scaleBand().domain(MONTHS).range([0, f.w]).paddingInner(0.06);
    const yb = d3.scaleBand().domain(S.rows.map((r) => r.code)).range([0, S.rows.length * cellH]).paddingInner(0.1);
    f.g.selectAll(".mh").data(MONTHS).join("text").attr("class", "axis-label").attr("x", (m) => x(m) + x.bandwidth() / 2).attr("y", -7).attr("text-anchor", "middle")
      .text((m) => (narrow ? F.month(m)[0] : F.month(m)));
    const shortLabel = (l) => (narrow ? l.replace("Manufacturing (mostly seafood)", "Manufacturing*").replace("Professional & business services", "Prof. & business").replace("Trade, transport & utilities", "Trade & transport").replace("Leisure & hospitality", "Leisure & hosp.").replace("Natural resources & mining", "Resources & mining").replace("Financial activities", "Financial") : l);
    f.g.selectAll(".rl").data(S.rows).join("text").attr("x", -8).attr("y", (r) => yb(r.code) + yb.bandwidth() / 2 + 4).attr("text-anchor", "end").text((r) => shortLabel(r.label));
    const cells = S.rows.flatMap((r) => r.dev.map((dv, m) => ({ r, m, dv, v: r.prof[m] })));
    f.g.selectAll("rect.c").data(cells).join("rect").attr("class", "c")
      .attr("x", (d) => x(d.m)).attr("y", (d) => yb(d.r.code)).attr("width", x.bandwidth()).attr("height", yb.bandwidth()).attr("rx", 3)
      .attr("fill", (d) => color(d.dv))
      .on("pointermove", (e, d) => AK.tip.show(e, `<b>${AK.esc(d.r.label)}</b> · ${F.month(d.m)}${AK.tip.row("vs. yearly average", F.signedPct(d.dv, 1))}${AK.tip.row("Avg. jobs", F.int(d.v))}`))
      .on("pointerleave", () => AK.tip.hide());
    AK.rampKey(fig.body, color, { lo: F.signedPct(-maxAbs), hi: F.signedPct(maxAbs) });
    AK.table(fig.root, [{ key: "label", label: "Industry" }, ...MONTHS.map((m) => ({ key: "m" + m, label: F.month(m), fmt: (v) => F.signedPct(v, 1) })), { key: "swing", label: "Swing", fmt: (v) => F.pct(v) }],
      S.rows.map((r) => Object.assign({ label: r.label, swing: r.swing }, ...r.dev.map((v, m) => ({ ["m" + m]: v })))));
  }

  // (3) borough swing map + ranked bars
  function boroughSwing(el, D) {
    const B = D.boroughs.boroughs;
    const all = Object.entries(B).map(([fips, b]) => ({ fips, name: b.name, ratio: b.seasonal.ratio, months: b.seasonal.months })).filter((d) => d.ratio != null);
    const grid = document.createElement("div");
    grid.className = "fig-grid";
    el.appendChild(grid);

    // log-ish emphasis: ratios cluster near 1, so use sqrt-transformed domain
    const sc = AK.seq([0, Math.sqrt(d3.max(all, (d) => d.ratio) - 1)]);
    const fill = (r) => sc(Math.sqrt(Math.max(0, r - 1)));

    const mapFig = AK.fig({
      id: "seasons-map",
      title: "Seasonal swing by borough",
      sub: "Jobs in the busiest month ÷ jobs in the slowest month, 2022–2024 average",
      note: "Source: BLS QCEW. Color scale is square-root stretched so small swings stay visible.",
    });
    grid.appendChild(mapFig.root);
    const w = mapFig.body.clientWidth;
    const mf = AK.frame(mapFig.body, { height: Math.round(Math.min(360, w * 0.72)), margin: { t: 0, r: 0, b: 0, l: 0 }, label: "Map of seasonal job swing by borough" });
    drawMap(mf.g, {
      w: mf.w, h: mf.h,
      fill: (fips) => (B[fips] && B[fips].seasonal.ratio != null ? fill(B[fips].seasonal.ratio) : AK.colors().grid),
      onHover: (e, fips) => {
        if (!fips) return AK.tip.hide();
        const b = B[fips];
        const s = b.seasonal;
        const pk = d3.maxIndex(s.months), lo = d3.minIndex(s.months);
        AK.tip.show(e, `<b>${AK.esc(b.name)}</b>${AK.tip.row("Peak ÷ low", F.ratio(s.ratio))}${AK.tip.row(`Peak (${F.month(pk)})`, F.int(s.months[pk]))}${AK.tip.row(`Low (${F.month(lo)})`, F.int(s.months[lo]))}`);
      },
    });
    const key = document.createElement("div");
    mapFig.body.appendChild(key);
    const rMax = d3.max(all, (d) => d.ratio);
    const keyScale = d3.scaleSequential((t) => fill(1 + t * (rMax - 1))).domain([0, 1]);
    AK.rampKey(key, keyScale, { lo: "1.0× (flat)", hi: F.ratio(d3.max(all, (d) => d.ratio), 1) });

    // ranked bars
    const top = all.slice().sort((a, b) => b.ratio - a.ratio).slice(0, 12);
    for (const ref of ["02020", "02170"]) if (!top.find((d) => d.fips === ref)) top.push(all.find((d) => d.fips === ref));
    const barFig = AK.fig({
      id: "seasons-rank",
      title: "Biggest seasonal swings",
      sub: "Top 12 boroughs, with Anchorage and Mat-Su for reference",
      note: "Source: BLS QCEW, 2022–2024 monthly averages.",
    });
    grid.appendChild(barFig.root);
    const C = AK.colors();
    const rowH = 22;
    const bf = AK.frame(barFig.body, { height: top.length * rowH + 16, margin: { t: 4, r: 44, b: 4, l: 132 }, label: "Ranked bars of seasonal swing" });
    const x = d3.scaleLinear().domain([1, d3.max(top, (d) => d.ratio)]).range([0, bf.w]);
    const y = d3.scaleBand().domain(top.map((d) => d.fips)).range([0, top.length * rowH]).paddingInner(0.3);
    const refStart = 12;
    bf.g.selectAll("text.n").data(top).join("text").attr("x", -8).attr("y", (d) => y(d.fips) + y.bandwidth() / 2 + 4).attr("text-anchor", "end")
      .attr("class", (d, i) => (i >= refStart ? null : null)).text((d) => short(d.name)).style("font-style", (d, i) => (i >= refStart ? "italic" : null));
    if (top.length > refStart) {
      const yy = y(top[refStart].fips) - (y.step() - y.bandwidth()) / 2 - 1;
      bf.g.append("line").attr("x1", -128).attr("x2", bf.w).attr("y1", yy).attr("y2", yy).attr("stroke", C.grid);
    }
    bf.g.selectAll("path.b").data(top).join("path").attr("class", "b")
      .attr("d", (d) => AK.hbarPath(0, y(d.fips) + (y.bandwidth() - Math.min(14, y.bandwidth())) / 2, Math.max(1, x(d.ratio)), Math.min(14, y.bandwidth())))
      .attr("fill", (d) => fill(d.ratio));
    bf.g.selectAll("text.v").data(top).join("text").attr("class", "lbl-val").attr("x", (d) => x(d.ratio) + 5).attr("y", (d) => y(d.fips) + y.bandwidth() / 2 + 4).text((d) => F.ratio(d.ratio, 1));
    bf.g.selectAll("rect.hit").data(top).join("rect").attr("class", "hit").attr("x", -130).attr("y", (d) => y(d.fips) - 3).attr("width", bf.w + 170).attr("height", y.step()).attr("fill", "transparent")
      .on("pointermove", (e, d) => AK.tip.show(e, `<b>${AK.esc(d.name)}</b>${AK.tip.row("Peak ÷ low", F.ratio(d.ratio))}${AK.tip.row("Peak month jobs", F.int(d3.max(d.months)))}${AK.tip.row("Low month jobs", F.int(d3.min(d.months)))}`))
      .on("pointerleave", () => AK.tip.hide());

    AK.table(grid.lastChild, [{ key: "name", label: "Borough" }, { key: "ratio", label: "Peak ÷ low", fmt: (v) => F.ratio(v) }, { key: "peak", label: "Peak jobs", fmt: F.int }, { key: "low", label: "Low jobs", fmt: F.int }],
      all.slice().sort((a, b) => b.ratio - a.ratio).map((d) => ({ name: d.name, ratio: d.ratio, peak: d3.max(d.months), low: d3.min(d.months) })));
  }

  // (4) small multiples
  function multiples(el, D) {
    const B = D.boroughs.boroughs;
    const all = Object.entries(B).map(([fips, b]) => ({ fips, ...b })).filter((b) => b.seasonal.ratio != null);
    const pick = all.slice().sort((a, b) => b.seasonal.ratio - a.seasonal.ratio).slice(0, 6);
    for (const ref of ["02020", "02170"]) pick.push(all.find((b) => b.fips === ref));
    const series = pick.map((b) => {
      const s = b.seasonal;
      const tm = d3.mean(s.months);
      const lm = s.leisure ? d3.mean(s.leisure) : null;
      return {
        fips: b.fips, name: b.name,
        total: s.months.map((v) => (v / tm) * 100),
        leisure: s.leisure && lm ? s.leisure.map((v) => (v / lm) * 100) : null,
        rawT: s.months, rawL: s.leisure,
      };
    });
    const yMax = d3.max(series, (s) => d3.max([...s.total, ...(s.leisure || [])]));
    const fig = AK.fig({
      id: "seasons-multiples",
      title: "The shape of the year in eight boroughs",
      sub: "Monthly jobs indexed to each borough's yearly average (100), 2022–2024. Same scale in every panel.",
      note: "Source: BLS QCEW. The six biggest-swing boroughs, then Anchorage and Mat-Su. Leisure is missing where suppressed.",
    });
    el.appendChild(fig.root);
    const C = AK.colors();
    AK.legend(fig.body, [{ label: "All wage jobs", color: C.s[0], kind: "line" }, { label: "Leisure & hospitality", color: C.s[1], kind: "line" }]);
    const W = fig.body.clientWidth;
    const gap = 12;
    const cols = Math.max(1, Math.min(4, Math.floor((W + gap) / (264 + gap))));
    const ph = cols === 1 ? 116 : 132;
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    wrap.style.gap = `${gap}px`;
    wrap.style.marginTop = ".5rem";
    fig.body.appendChild(wrap);
    for (const s of series) {
      const cell = document.createElement("div");
      cell.style.minWidth = "0";
      wrap.appendChild(cell);
      const f = AK.frame(cell, { height: ph, margin: { t: 18, r: 6, b: 18, l: 28 }, label: `${s.name} monthly profile` });
        const x = d3.scalePoint().domain(MONTHS).range([0, f.w]);
      const y = d3.scaleLinear().domain([0, yMax]).nice().range([f.h, 0]);
      f.g.append("text").attr("class", "lbl-strong").attr("x", 0).attr("y", -6).text(short(s.name));
      f.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(3).tickSize(-f.w).tickFormat("")).call((g) => g.select(".domain").remove());
      f.g.append("g").call(d3.axisLeft(y).ticks(3).tickSize(0)).call((g) => g.select(".domain").remove()).selectAll("text").attr("dx", -3);
      f.g.append("line").attr("x1", 0).attr("x2", f.w).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", C.axis);
      f.g.append("g").attr("transform", `translate(0,${f.h})`).call(d3.axisBottom(x).tickValues([0, 6, 11]).tickFormat((m) => F.month(m)).tickSize(0)).call((g) => g.select(".domain").remove()).selectAll("text").attr("dy", 10);
      const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
      if (s.leisure) f.g.append("path").attr("d", line(s.leisure)).attr("fill", "none").attr("stroke", C.s[1]).attr("stroke-width", 2);
      f.g.append("path").attr("d", line(s.total)).attr("fill", "none").attr("stroke", C.s[0]).attr("stroke-width", 2);
      const hover = f.g.append("g").style("display", "none").attr("pointer-events", "none");
      hover.append("line").attr("y1", 0).attr("y2", f.h).attr("stroke", C.axis);
      const d1 = hover.append("circle").attr("r", 4).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2);
      const d2 = hover.append("circle").attr("r", 4).attr("fill", C.s[1]).attr("stroke", C.surface).attr("stroke-width", 2);
      f.g.append("rect").attr("width", f.w).attr("height", f.h).attr("fill", "transparent")
        .on("pointermove", (e) => {
          const [mx] = d3.pointer(e);
          const i = Math.max(0, Math.min(11, Math.round(mx / x.step())));
          hover.style("display", null).attr("transform", `translate(${x(i)},0)`);
          d1.attr("cy", y(s.total[i]));
          d2.style("display", s.leisure ? null : "none").attr("cy", s.leisure ? y(s.leisure[i]) : 0);
          AK.tip.show(e, `<b>${AK.esc(s.name)} · ${F.month(i)}</b>${AK.tip.row("All jobs", `${F.int(s.rawT[i])} (${Math.round(s.total[i])})`, C.s[0])}${s.leisure ? AK.tip.row("Leisure", `${F.int(s.rawL[i])} (${Math.round(s.leisure[i])})`, C.s[1]) : ""}`);
        })
        .on("pointerleave", () => { hover.style("display", "none"); AK.tip.hide(); });
    }
    const rows = [];
    for (const s of series) MONTHS.forEach((m) => rows.push({ name: s.name, m: F.month(m), t: s.rawT[m], ti: s.total[m], l: s.rawL ? s.rawL[m] : null, li: s.leisure ? s.leisure[m] : null }));
    AK.table(fig.root, [{ key: "name", label: "Borough" }, { key: "m", label: "Month" }, { key: "t", label: "All jobs", fmt: F.int }, { key: "ti", label: "Index", fmt: (v) => (v == null ? "–" : Math.round(v)) }, { key: "l", label: "Leisure jobs", fmt: F.int }, { key: "li", label: "Leisure index", fmt: (v) => (v == null ? "–" : Math.round(v)) }], rows);
  }
})();
