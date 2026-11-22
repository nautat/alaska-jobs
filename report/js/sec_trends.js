/* sec_trends.js: "Twenty years of change" (BEA 2001\u20132022, QCEW 2014\u20132025, BEA income). */
(function () {
  let sameScale = false; // small-multiples y toggle (kept across re-renders)

  const SHORT = {
    "211": "Oil & gas extraction",
    "213": "Oilfield services",
    "3117": "Seafood processing",
    "62": "Health care",
  };

  // first/last non-null helpers
  const firstIdx = (a) => a.findIndex((v) => v != null);
  const lastIdx = (a) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i;
    return -1;
  };
  const kfmt = (n) => {
    const s = Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(1) + "k" : String(Math.abs(Math.round(n)));
    return (n > 0 ? "+" : n < 0 ? "\u2212" : "") + s;
  };

  /** Spread label y positions so they are at least `gap` apart, keeping order. */
  function spread(items, gap, lo, hi) {
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0) for (const it of items) it.y -= over;
    for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap;
    for (const it of items) it.y = Math.max(lo, it.y);
    return items;
  }

  /**
   * Generic multi-line chart with crosshair tooltip and end labels.
   * series: [{key,label,color,values:[...]}] aligned to years
   */
  function lineChart(container, { years, series, height = 300, yFmt, tipFmt, baseline = null, yMin = null, endLabels = true, label }) {
    const C = AK.colors();
    const width = Math.max(260, container.clientWidth || 600);
    const showEnd = endLabels && width >= 480;
    const labelW = showEnd ? Math.min(150, Math.max(...series.map((s) => s.label.length)) * 6.6 + 40) : 12;
    const F = AK.frame(container, { height, margin: { t: 12, r: labelW, b: 26, l: 48 }, label });
    const { g, w, h } = F;
    const x = d3.scaleLinear().domain(d3.extent(years)).range([0, w]);
    const all = series.flatMap((s) => s.values.filter((v) => v != null));
    let lo = yMin != null ? yMin : d3.min(all), hi = d3.max(all);
    if (baseline != null) { lo = Math.min(lo, baseline); hi = Math.max(hi, baseline); }
    const pad = (hi - lo) * 0.06;
    const y = d3.scaleLinear().domain([yMin != null ? yMin : lo - pad, hi + pad]).nice().range([h, 0]);

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat("")).call((s) => s.select(".domain").remove());
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(y).ticks(5).tickFormat(yFmt).tickSize(0).tickPadding(8)).call((s) => s.select(".domain").remove());
    const xt = width < 480 ? 4 : 8;
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(xt).tickFormat(d3.format("d")).tickSizeOuter(0));
    if (baseline != null) g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(baseline)).attr("y2", y(baseline)).attr("stroke", C.axis).attr("stroke-width", 1);

    const line = d3.line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1])).curve(d3.curveMonotoneX);
    for (const s of series) {
      const pts = years.map((yr, i) => [yr, s.values[i]]);
      if (s.area) {
        const area = d3.area().defined((d) => d[1] != null).x((d) => x(d[0])).y0(h).y1((d) => y(d[1])).curve(d3.curveMonotoneX);
        g.append("path").attr("d", area(pts)).attr("fill", s.color).attr("fill-opacity", 0.1);
      }
      g.append("path").attr("d", line(pts)).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
      const li = lastIdx(s.values);
      g.append("circle").attr("cx", x(years[li])).attr("cy", y(s.values[li])).attr("r", 4).attr("fill", s.color).attr("stroke", C.surface).attr("stroke-width", 2);
    }
    if (showEnd) {
      const items = spread(series.map((s) => { const li = lastIdx(s.values); return { s, x0: x(years[li]), y0: y(s.values[li]), y: y(s.values[li]) }; }), 14, 4, h - 4);
      for (const it of items) {
        const lx = w + 14;
        if (Math.abs(it.y - it.y0) > 1.5) g.append("path").attr("d", `M${it.x0 + 6},${it.y0}L${lx - 4},${it.y}`).attr("stroke", C.axis).attr("fill", "none");
        g.append("text").attr("x", lx).attr("y", it.y + 3.5).text(`${it.s.label} ${it.s.endText ? it.s.endText : ""}`.trim());
      }
    }
    // crosshair + tooltip
    const cross = g.append("line").attr("y1", 0).attr("y2", h).attr("stroke", C.axis).attr("stroke-width", 1).style("display", "none");
    const dots = g.append("g").style("display", "none");
    g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent").style("cursor", "crosshair")
      .on("pointermove", (e) => {
        const [mx] = d3.pointer(e);
        const yr = Math.round(x.invert(mx));
        const i = years.indexOf(Math.max(years[0], Math.min(years[years.length - 1], yr)));
        if (i < 0) return;
        cross.style("display", null).attr("x1", x(years[i])).attr("x2", x(years[i]));
        dots.style("display", null).selectAll("circle").data(series.filter((s) => s.values[i] != null)).join("circle")
          .attr("cx", x(years[i])).attr("cy", (s) => y(s.values[i])).attr("r", 4).attr("fill", (s) => s.color).attr("stroke", C.surface).attr("stroke-width", 2);
        const rows = series.map((s) => AK.tip.row(AK.esc(s.label), tipFmt(s, i), s.color)).join("");
        AK.tip.show(e, `<b>${years[i]}</b>${rows}`);
      })
      .on("pointerleave", () => { cross.style("display", "none"); dots.style("display", "none"); AK.tip.hide(); });
    return F;
  }

  AK.section("trends", (el, D) => {
    const C = AK.colors();
    const T = D.trends, B = D.boroughs.boroughs;
    const be = T.bea_emp, yrs = be.years;
    const y0 = yrs[0], y1 = yrs[yrs.length - 1];

    // ---------- derive numbers ----------
    const panels = [
      ...Object.entries(be.sectors).map(([k, v]) => ({ label: k, values: v, gov: false })),
      { label: "Federal civilian", values: be.gov.federal_civilian, gov: true },
      { label: "Military", values: be.gov.military, gov: true },
      { label: "State & local government", values: be.gov.state_local, gov: true },
    ].map((p) => {
      const a = firstIdx(p.values), b = lastIdx(p.values);
      return { ...p, a, b, change: p.values[b] - p.values[a], from: yrs[a] };
    });
    panels.sort((p, q) => q.change - p.change);
    const byLabel = Object.fromEntries(panels.map((p) => [p.label, p]));
    const health = byLabel["Health care & social assistance"];
    const mil = byLabel["Military"];
    const priv = panels.filter((p) => !p.gov);
    const top2001 = [...priv].filter((p) => p.values[0] != null).sort((p, q) => q.values[0] - p.values[0])[0];
    const top2022 = [...priv].sort((p, q) => q.values[q.b] - p.values[p.b])[0];
    const losers = panels.filter((p) => p.change < 0);

    const qs = T.qcew_spot, qy = qs.years;
    const qv = (code, yr) => qs.series[code].jobs[qy.indexOf(yr)];
    const og14 = qv("211", 2014), og24 = qv("211", 2024);
    const os14 = qv("213", 2014), os24 = qv("213", 2024);
    const osMin = d3.min(qs.series["213"].jobs.filter((v) => v != null));
    const osMinYr = qy[qs.series["213"].jobs.indexOf(osMin)];
    const sf14 = qv("3117", 2014), sf24 = qv("3117", 2024);
    const hc14 = qv("62", 2014), hc24 = qv("62", 2024);

    const ws = be.wage_salary, pr = be.proprietors;
    const wsG = ws[ws.length - 1] / ws[0] - 1, prG = pr[pr.length - 1] / pr[0] - 1;

    // borough growth rows (combine Chugach + Copper River)
    const grow = [];
    let vcDone = false;
    for (const [fips, b] of Object.entries(B)) {
      const gr = b.growth;
      if (!gr) continue;
      if (gr.group === "valdez-cordova") {
        if (vcDone) continue;
        vcDone = true;
        grow.push({ fips: "valdez-cordova", name: "Chugach + Copper River", ...gr });
      } else grow.push({ fips, name: b.name, ...gr });
    }
    grow.sort((a, b) => b.pct - a.pct);
    const matsu = grow.find((r) => r.fips === "02170");
    const nDecline = grow.filter((r) => r.pct < 0).length;
    const msSeries = T.borough_emp.series["02170"];
    const msEveryYear = msSeries.every((v, i) => i === 0 || v > msSeries[i - 1]);
    const anc = grow.find((r) => r.fips === "02020");

    const inc = T.income;
    const pc0 = inc.per_capita[0], pc1 = inc.per_capita[inc.per_capita.length - 1];
    const incY0 = inc.years[0], incY1 = inc.years[inc.years.length - 1];

    const n = (s) => `<span class="num">${s}</span>`;
    const F = AK.fmt;

    // ---------- header + narrative ----------
    el.appendChild(AK.html(`
      <div class="eyebrow">Twenty years of change</div>
      <h2>Oil shrank, health care grew, and the Valley filled in</h2>
      <div class="prose">
        <p class="lede">Alaska had ${n(F.int(be.total[0]))} jobs in ${y0} and ${n(F.int(be.total[be.total.length - 1]))} in ${y1}, counting the self-employed and the military. That is growth of ${n(F.pct(be.total[be.total.length - 1] / be.total[0] - 1))} in two decades. The total hides a big reshuffle between industries and places.</p>
        <p><strong>Oil lost its workforce after the 2015 price crash.</strong> Oil and gas extraction fell from ${n(F.int(og14))} wage jobs in 2014 to ${n(F.int(og24))} in 2024. Oilfield services fared worse. They dropped from ${n(F.int(os14))} to a low of ${n(F.int(osMin))} in ${osMinYr} and were back to only ${n(F.int(os24))} in 2024. Oil still pays for much of state government, but it employs far fewer people than it once did.</p>
        <p><strong>Health care became the biggest private employer.</strong> It added ${n(F.int(health.change))} jobs between ${y0} and ${y1}, more than any other industry. ${top2001.label !== top2022.label ? `In ${y0}, ${top2001.label.toLowerCase()} employed more people. By ${y1} health care led by ${n(F.int(health.values[health.b] - [...priv].sort((p, q) => q.values[q.b] - p.values[p.b])[1].values[health.b]))} jobs.` : ""} Wage jobs in health care kept climbing after 2014 too, from ${n(F.int(hc14))} to ${n(F.int(hc24))}.</p>
        <p><strong>Seafood processing is shrinking.</strong> Processing plants had ${n(F.int(sf14))} wage jobs in 2014 and ${n(F.int(sf24))} in 2024, a drop of ${n(F.pct(1 - sf24 / sf14))}. The military went the other way, from ${n(F.int(mil.values[0]))} jobs in ${y0} to ${n(F.int(mil.values[mil.b]))} in ${y1}.</p>
        <p><strong>The Mat-Su Valley filled in.</strong> Matanuska-Susitna had ${n(F.pct(matsu.pct))} more jobs in 2022 than in 2010${msEveryYear ? ", and its count rose every single year" : ""}. Anchorage grew ${n(F.signedPct(anc.pct, 1))} over the same years. Many Valley residents commute to Anchorage, and services followed them home. Out of ${grow.length} borough areas, ${n(nDecline)} had fewer jobs in 2022 than in 2010. The biggest drop was in the ${grow[grow.length - 1].name} area (${n(F.signedPct(grow[grow.length - 1].pct))}), home of the Prudhoe Bay oil fields. Fishing regions and Southeast towns such as Dillingham, Petersburg and Kodiak lost jobs too.</p>
      </div>`));

    // ---------- 1. small multiples ----------
    {
      const fig = AK.fig({ id: "trends-sectors", title: `Jobs by industry, ${y0}\u2013${y1}`, sub: "All jobs, including self-employed and military, sorted by the change in jobs. Government is split into its parts.", note: "Source: BEA CAEMP25N (full- and part-time jobs by place of work). A few industries start in 2002 or 2003 because BEA withheld the earliest year." });
      fig.head.appendChild(AK.seg([{ value: false, label: "Own scale" }, { value: true, label: "Same scale" }], sameScale, (v) => { sameScale = v; rerender(); }, "Y-axis scale"));
      el.appendChild(fig.root);
      const grid = document.createElement("div");
      fig.body.appendChild(grid);
      function rerender() {
        fig.head.querySelectorAll(".seg button").forEach((b, i) => b.setAttribute("aria-pressed", String((i === 1) === sameScale)));
        grid.replaceChildren();
        const W = fig.body.clientWidth || 600;
        const gap = 12;
        let cols = Math.max(2, Math.min(5, Math.floor(W / 170)));
        if (panels.length % cols === 1) {
          if ((W - gap * cols) / (cols + 1) >= 135) cols++;
          else if (cols > 2) cols--;
        }
        const pw = Math.floor((W - gap * (cols - 1)) / cols);
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:14px ${gap}px`;
        const gmax = d3.max(panels, (p) => d3.max(p.values));
        const x = d3.scaleLinear().domain([y0, y1]);
        for (const p of panels) {
          const cell = document.createElement("div");
          cell.style.minWidth = "0";
          grid.appendChild(cell);
          const ph = 92;
          const svg = d3.select(cell).append("svg").attr("width", pw).attr("height", ph).attr("viewBox", `0 0 ${pw} ${ph}`).attr("role", "img")
            .attr("aria-label", `${p.label}: ${kfmt(p.change)} jobs since ${p.from}`);
          const m = { t: 30, r: 6, b: 14, l: 6 };
          const w = pw - m.l - m.r, h = ph - m.t - m.b;
          const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
          x.range([0, w]);
          const y = d3.scaleLinear().domain([0, sameScale ? gmax : d3.max(p.values) * 1.05]).range([h, 0]);
          // label + change
          const maxChars = Math.floor(w / 6.2);
          const name = p.label.length > maxChars ? p.label.slice(0, maxChars - 1) + "\u2026" : p.label;
          svg.append("text").attr("x", m.l).attr("y", 12).attr("class", "lbl-strong").text(name).append("title").text(p.label);
          svg.append("text").attr("x", pw - m.r).attr("y", 24).attr("text-anchor", "end").attr("class", "lbl-val").text(kfmt(p.change));
          svg.append("text").attr("x", m.l).attr("y", 24).attr("class", "axis-label").text(`${F.compact(p.values[p.b])} in ${y1}`);
          g.append("line").attr("x1", 0).attr("x2", w).attr("y1", h).attr("y2", h).attr("stroke", C.axis);
          const col = p.change >= 0 ? C.s[0] : C.s[1];
          const pts = yrs.map((yr, i) => [yr, p.values[i]]);
          g.append("path").attr("d", d3.area().defined((d) => d[1] != null).x((d) => x(d[0])).y0(h).y1((d) => y(d[1]))(pts)).attr("fill", col).attr("fill-opacity", 0.1);
          g.append("path").attr("d", d3.line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1]))(pts)).attr("fill", "none").attr("stroke", col).attr("stroke-width", 2).attr("stroke-linejoin", "round");
          g.append("circle").attr("cx", x(y1)).attr("cy", y(p.values[p.b])).attr("r", 3).attr("fill", col).attr("stroke", C.surface).attr("stroke-width", 1.5);
          svg.append("text").attr("x", m.l).attr("y", ph - 2).attr("class", "axis-label").text(p.from);
          svg.append("text").attr("x", pw - m.r).attr("y", ph - 2).attr("text-anchor", "end").attr("class", "axis-label").text(y1);
          const cross = g.append("line").attr("y1", 0).attr("y2", h).attr("stroke", C.axis).style("display", "none");
          g.append("rect").attr("width", w).attr("height", h).attr("fill", "transparent")
            .on("pointermove", (e) => {
              const yr = Math.max(y0, Math.min(y1, Math.round(x.invert(d3.pointer(e)[0]))));
              const i = yrs.indexOf(yr);
              cross.style("display", null).attr("x1", x(yr)).attr("x2", x(yr));
              AK.tip.show(e, `<b>${AK.esc(p.label)}</b>${AK.tip.row(String(yr), p.values[i] == null ? "n/a" : F.int(p.values[i]) + " jobs")}`);
            })
            .on("pointerleave", () => { cross.style("display", "none"); AK.tip.hide(); });
        }
      }
      rerender();
      AK.legend(fig.body, [{ label: "Gained jobs", color: C.s[0], kind: "line" }, { label: "Lost jobs", color: C.s[1], kind: "line" }]);
      AK.table(fig.body, [
        { key: "label", label: "Industry" },
        { key: "from", label: "From" },
        { key: "v0", label: "Jobs then", fmt: F.int },
        { key: "v1", label: `Jobs ${y1}`, fmt: F.int },
        { key: "change", label: "Change", fmt: (v) => (v > 0 ? "+" : "") + F.int(v) },
      ], panels.map((p) => ({ label: p.label, from: p.from, v0: p.values[p.a], v1: p.values[p.b], change: p.change })));
    }

    // ---------- 2. indexed QCEW lines + 3. wage vs proprietors ----------
    const grid2 = document.createElement("div");
    grid2.className = "fig-grid";
    el.appendChild(grid2);
    {
      const codes = ["62", "211", "3117", "213"];
      const fig = AK.fig({ id: "trends-index", title: "Oil jobs fell, health care rose", sub: "Wage jobs, indexed so 2014 = 100", note: "Source: BLS QCEW, private sector. 2025 data has heavy suppression; these four industries are still published for 2025." });
      grid2.appendChild(fig.root);
      const series = codes.map((c, i) => {
        const j = qs.series[c].jobs, base = j[0];
        const vals = j.map((v) => (v == null ? null : (v / base) * 100));
        return { key: c, label: SHORT[c], color: C.s[i], values: vals, jobs: j, endText: vals[lastIdx(vals)].toFixed(0) };
      });
      lineChart(fig.body, {
        years: qy, series, height: 290, baseline: 100, yFmt: (d) => d, label: "Indexed wage jobs 2014 to 2025",
        tipFmt: (s, i) => (s.values[i] == null ? "n/a" : `${s.values[i].toFixed(0)} \u00b7 ${F.int(s.jobs[i])}`),
      });
      AK.legend(fig.body, series.map((s) => ({ label: s.label, color: s.color, kind: "line" })));
      AK.table(fig.body, [{ key: "year", label: "Year" }, ...series.map((s) => ({ key: s.key, label: s.label, fmt: F.int }))],
        qy.map((yr, i) => Object.assign({ year: yr }, ...series.map((s) => ({ [s.key]: s.jobs[i] })))));
    }
    {
      const fig = AK.fig({ id: "trends-selfemp", title: "Self-employment grew faster than payroll jobs", sub: `Jobs indexed so ${y0} = 100`, note: "Source: BEA CAEMP25N. Proprietors are people who own their own business, including fishermen and contractors." });
      grid2.appendChild(fig.root);
      const series = [
        { key: "ws", label: "Wage & salary jobs", color: C.s[0], raw: ws, values: ws.map((v) => (v / ws[0]) * 100) },
        { key: "pr", label: "Self-employed", color: C.s[1], raw: pr, values: pr.map((v) => (v / pr[0]) * 100) },
      ];
      series.forEach((s) => (s.endText = "+" + (s.values[s.values.length - 1] - 100).toFixed(0) + "%"));
      lineChart(fig.body, {
        years: yrs, series, height: 290, baseline: 100, yFmt: (d) => d, label: "Wage jobs versus self-employed, indexed",
        tipFmt: (s, i) => `${s.values[i].toFixed(0)} \u00b7 ${F.int(s.raw[i])}`,
      });
      AK.legend(fig.body, series.map((s) => ({ label: s.label, color: s.color, kind: "line" })));
      const p = document.createElement("p");
      p.className = "fig-note";
      p.textContent = `Wage and salary jobs grew ${F.pct(wsG)} from ${y0} to ${y1}. Self-employed jobs grew ${F.pct(prG)}, from ${F.int(pr[0])} to ${F.int(pr[pr.length - 1])}.`;
      fig.body.appendChild(p);
      AK.table(fig.body, [{ key: "year", label: "Year" }, { key: "ws", label: "Wage & salary", fmt: F.int }, { key: "pr", label: "Self-employed", fmt: F.int }],
        yrs.map((yr, i) => ({ year: yr, ws: ws[i], pr: pr[i] })));
    }

    // ---------- 4. borough growth: ranked diverging bars + map ----------
    const grid3 = document.createElement("div");
    grid3.className = "fig-grid";
    el.appendChild(grid3);
    const m = Math.max(...grow.map((r) => Math.abs(r.pct)));
    const dscale = AK.div([-m, 0, m]);
    const growTip = (e, r) => AK.tip.show(e, `<b>${AK.esc(r.name)}</b>${AK.tip.row("Change 2010\u20132022", F.signedPct(r.pct, 1))}${AK.tip.row("Jobs 2010", F.int(r.jobs0))}${AK.tip.row("Jobs 2022", F.int(r.jobs1))}`);
    {
      const fig = AK.fig({ id: "trends-borough-bars", title: "Job growth by borough, 2010\u20132022", sub: "Change in all jobs, including self-employed", note: "Source: BEA CAEMP25N. Chugach and Copper River were one census area (Valdez-Cordova) until 2019, so they are combined here." });
      grid3.appendChild(fig.root);
      const W = fig.body.clientWidth || 500;
      const nameW = Math.min(150, W * 0.38);
      const rowH = 18;
      const Fr = AK.frame(fig.body, { height: grow.length * rowH + 24, margin: { t: 4, r: 44, b: 20, l: nameW }, label: "Job growth by borough, ranked" });
      const { g, w, h } = Fr;
      const x = d3.scaleLinear().domain([-m, m]).nice().range([0, w]);
      const yb = d3.scaleBand().domain(grow.map((r) => r.fips)).range([0, h]).padding(0.3);
      g.append("g").attr("class", "grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 5).tickSize(-h).tickFormat((d) => F.signedPct(d))).call((s) => s.select(".domain").remove());
      g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h).attr("stroke", C.axis);
      const bh = Math.min(12, yb.bandwidth());
      for (const r of grow) {
        const yy = yb(r.fips) + (yb.bandwidth() - bh) / 2;
        const len = Math.abs(x(r.pct) - x(0));
        let d;
        if (r.pct >= 0) d = AK.hbarPath(x(0), yy, len, bh);
        else {
          const x0 = x(0), rr = Math.min(4, len, bh / 2);
          d = len <= 0 ? "" : `M${x0},${yy}H${x0 - len + rr}Q${x0 - len},${yy} ${x0 - len},${yy + rr}V${yy + bh - rr}Q${x0 - len},${yy + bh} ${x0 - len + rr},${yy + bh}H${x0}Z`;
        }
        g.append("path").attr("d", d).attr("fill", dscale(r.pct));
        const isMS = r.fips === "02170";
        g.append("text").attr("x", -8).attr("y", yy + bh / 2 + 3.5).attr("text-anchor", "end").attr("class", isMS ? "lbl-strong" : null).text(r.name);
        g.append("text").attr("x", r.pct >= 0 ? x(r.pct) + 4 : x(r.pct) - 4).attr("y", yy + bh / 2 + 3.5).attr("text-anchor", r.pct >= 0 ? "start" : "end").attr("class", "lbl-val").text(Math.abs(r.pct) < 0.005 ? "0%" : F.signedPct(r.pct, 0));
        g.append("rect").attr("x", -nameW).attr("y", yb(r.fips)).attr("width", w + nameW).attr("height", yb.step()).attr("fill", "transparent")
          .on("pointermove", (e) => growTip(e, r)).on("pointerleave", () => AK.tip.hide());
      }
      AK.table(fig.body, [{ key: "name", label: "Borough" }, { key: "jobs0", label: "Jobs 2010", fmt: F.int }, { key: "jobs1", label: "Jobs 2022", fmt: F.int }, { key: "pct", label: "Change", fmt: (v) => F.signedPct(v, 1) }], grow);
    }
    {
      const fig = AK.fig({ id: "trends-borough-map", title: "Where jobs grew and shrank", sub: "Change in all jobs, 2010\u20132022" });
      grid3.appendChild(fig.root);
      const W = fig.body.clientWidth || 500;
      const Fm = AK.frame(fig.body, { height: Math.round(Math.min(420, W * 0.72)), margin: { t: 0, r: 0, b: 0, l: 0 }, label: "Map of job growth by borough" });
      const byFips = {};
      for (const [fips, b] of Object.entries(B)) if (b.growth) byFips[fips] = grow.find((r) => r.fips === (b.growth.group === "valdez-cordova" ? "valdez-cordova" : fips));
      const mapRes = AK.drawAlaska(Fm.g, {
        w: Fm.w, h: Fm.h,
        fill: (fips) => (byFips[fips] ? dscale(byFips[fips].pct) : C.grid),
        onHover: (e, fips) => (fips && byFips[fips] ? growTip(e, byFips[fips]) : AK.tip.hide()),
        places: ["city"], labelPlaces: false,
      });
      // label a sparse subset of cities (Wasilla/Valdez sit on top of Anchorage at this scale)
      if (W > 420) {
        const keep = ["Anchorage", "Fairbanks", "Juneau", "Bethel", "Nome", "Utqiagvik", "Kodiak", "Ketchikan", "Dillingham"];
        const lg = Fm.g.append("g").attr("pointer-events", "none");
        for (const pl of D.places.filter((q) => q.kind === "city" && keep.includes(q.name))) {
          const [px, py] = mapRes.projection([pl.lon, pl.lat]);
          lg.append("text").attr("x", px + 5).attr("y", py + 3.5).text(pl.name)
            .style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3);
        }
      }
      AK.rampKey(fig.body, dscale, { lo: F.signedPct(-m), hi: F.signedPct(m) });
      const p = document.createElement("p");
      p.className = "fig-note";
      p.textContent = "Blue means more jobs in 2022 than 2010, red means fewer. Grey is no change.";
      fig.body.appendChild(p);
    }

    // ---------- 5. per-capita income ----------
    {
      const fig = AK.fig({ id: "trends-income", title: `Personal income per person, ${incY0}\u2013${incY1}`, sub: "Nominal dollars, not adjusted for inflation", note: "Source: BEA CAINC4. Includes wages, business income, investment income and government transfers such as the PFD." });
      el.appendChild(fig.root);
      lineChart(fig.body, {
        years: inc.years, height: 250, yMin: 0, label: "Per-capita personal income",
        series: [{ key: "pc", label: "Per person", color: C.s[0], values: inc.per_capita, area: true, endText: F.moneyC(pc1) }],
        yFmt: (d) => F.moneyC(d), tipFmt: (s, i) => F.money(s.values[i]),
      });
      const p = document.createElement("p");
      p.className = "fig-note";
      p.textContent = `Income per person rose from ${F.money(pc0)} in ${incY0} to ${F.money(pc1)} in ${incY1} in current dollars. Prices also rose over these years, so the gain in buying power is smaller.`;
      fig.body.appendChild(p);
      AK.table(fig.body, [{ key: "year", label: "Year" }, { key: "pc", label: "Per person", fmt: F.money }], inc.years.map((yr, i) => ({ year: yr, pc: inc.per_capita[i] })));
    }
  });
})();
