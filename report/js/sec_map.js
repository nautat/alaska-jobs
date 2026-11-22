/* sec_map.js: map explorer. A borough choropleth with a metric picker, profile panel and ranked list. */
(function () {
  const F = AK.fmt;
  let metricKey = "jobs_per_res";
  let selected = "02170";

  const IND = {
    ag_fish: "Agriculture, fishing & forestry", mining: "Mining, oil & gas", construction: "Construction",
    manufacturing: "Manufacturing", trade: "Wholesale & retail trade", transport: "Transportation & utilities",
    info_fin: "Information, finance & real estate", prof: "Professional & business services", education: "Education",
    health: "Health care & social assistance", leisure: "Arts, recreation, lodging & food", other: "Other services",
    public_admin: "Public administration",
  };

  const lqFmt = (x) => (x == null ? "\u2013" : x >= 10 ? x.toFixed(0) + "\u00d7" : x.toFixed(2) + "\u00d7");

  function buildMetrics(D) {
    const M = [];
    const add = (m) => M.push(m);
    add({ key: "jobs", group: "Jobs & pay", label: "Wage jobs (2024)", get: (b) => b.jobs, fmt: F.int, scale: "log", sub: "Wage-and-salary jobs located in the borough, 2024 annual average (QCEW)." });
    add({ key: "avg_pay", group: "Jobs & pay", label: "Average annual pay", get: (b) => b.avg_pay, fmt: F.money, scale: "seq", sub: "Average pay per wage job, 2024 (QCEW)." });
    add({ key: "gov_share", group: "Jobs & pay", label: "Government share of jobs", get: (b) => b.gov_share, fmt: (x) => F.pct(x), scale: "seq", sub: "Federal civilian, state and local government jobs as a share of all wage jobs, 2024 (QCEW)." });
    add({ key: "jobs_per_res", group: "Jobs & pay", label: "Wage jobs per resident", get: (b) => (b.jobs && b.pop ? b.jobs / b.pop : null), fmt: (x) => (x == null ? "\u2013" : x.toFixed(2)), scale: "seq", sub: "Wage jobs located in the borough divided by its population. Above 1 means workers fly or drive in." });
    for (const [k, lab] of Object.entries(IND)) {
      add({ key: "ind_" + k, group: "What residents do", label: lab, get: (b) => b.resident_industry?.[k] ?? null, fmt: (x) => F.pct(x), scale: "seq", sub: `Share of employed residents working in ${lab.toLowerCase()}, including the self-employed (ACS 2020\u201324).` });
    }
    add({ key: "self_employed_share", group: "What residents do", label: "Self-employed share", get: (b) => b.self_employed_share, fmt: (x) => F.pct(x), scale: "seq", sub: "Share of employed residents who work for themselves, incorporated or not (ACS 2020\u201324)." });
    add({ key: "unemp_rate", group: "What residents do", label: "Unemployment rate", get: (b) => b.unemp_rate, fmt: (x) => F.pct(x, 1), scale: "seq", sub: "Unemployed as a share of the civilian labor force (ACS 2020\u201324)." });
    const spot = D.overview.spotlight, sup = D.overview.supersectors;
    for (const s of spot) add({ key: "lq_" + s.code, group: "Concentration vs US", label: s.label, get: (b) => { const v = b.spotlight?.[s.code]?.lq; return v > 0 ? v : null; }, fmt: lqFmt, scale: "lq", sub: `How concentrated ${s.label.toLowerCase()} jobs are compared with the US. 1\u00d7 is the national share; 10\u00d7 is ten times it (QCEW 2024).` });
    for (const s of sup) if (s.code !== "1029") add({ key: "lq_" + s.code, group: "Concentration vs US", label: s.label + " (all)", get: (b) => { const v = b.supersectors?.[s.code]?.lq; return v > 0 ? v : null; }, fmt: lqFmt, scale: "lq", sub: `Concentration of private ${s.label.toLowerCase()} jobs compared with the US share (QCEW 2024).` });
    add({ key: "per_capita", group: "Income", label: "Income per person", get: (b) => b.income?.per_capita, fmt: F.money, scale: "seq", sub: "Personal income from all sources per resident, 2024 (BEA)." });
    add({ key: "transfer_share", group: "Income", label: "Government transfers share of income", get: (b) => b.transfer_share, fmt: (x) => F.pct(x, 1), scale: "seq", sub: "Social Security, Medicare, Medicaid, the PFD and other transfers as a share of personal income, 2024 (BEA)." });
    add({ key: "pfd_share", group: "Income", label: "PFD share of income", get: (b) => b.pfd_share, fmt: (x) => F.pct(x, 1), scale: "seq", sub: "BEA's other-government-transfers line, which is mostly the Permanent Fund Dividend, as a share of personal income, 2022." });
    add({ key: "season", group: "Seasons", label: "Summer peak vs winter low", get: (b) => b.seasonal?.ratio, fmt: (x) => F.ratio(x), scale: "log", sub: "Busiest month's wage jobs divided by the slowest month's, averaged over 2022\u201324 (QCEW)." });
    add({ key: "growth", group: "Growth", label: "Job growth 2010\u20132022", get: (b) => b.growth?.pct, fmt: (x) => F.signedPct(x), scale: "div", sub: "Change in all jobs, including self-employed and military, 2010 to 2022 (BEA). Chugach and Copper River are combined because they split in 2019." });
    return M;
  }

  function scaleFor(m, vals) {
    const C = AK.colors();
    const v = vals.filter((x) => x != null);
    const lo = d3.min(v), hi = d3.max(v);
    if (m.scale === "div") {
      const a = Math.max(Math.abs(lo), Math.abs(hi));
      const s = AK.div([-a, 0, a]);
      return { color: (x) => (x == null ? C.grid : s(x)), key: s, lo: F.signedPct(-a), hi: F.signedPct(a), mid: "0%" };
    }
    if (m.scale === "lq") {
      const s = AK.div([-1, 0, 2]); // log10: 0.1\u00d7 \u2026 1\u00d7 \u2026 100\u00d7
      return { color: (x) => (x == null ? C.grid : s(Math.log10(x))), key: s, lo: "0.1\u00d7", hi: "100\u00d7", mid: "1\u00d7 (US share)" };
    }
    if (m.scale === "log") {
      const s = AK.seq([Math.log10(lo), Math.log10(hi)]);
      return { color: (x) => (x == null ? C.grid : s(Math.log10(x))), key: s, lo: m.fmt(lo), hi: m.fmt(hi) };
    }
    const s = AK.seq([lo, hi]);
    return { color: (x) => (x == null ? C.grid : s(x)), key: s, lo: m.fmt(lo), hi: m.fmt(hi) };
  }

  function narrative(D) {
    const B = D.boroughs.boroughs, ns = B["02185"], bb = B["02060"], ku = B["02158"], ms = B["02170"];
    const oil = ns.spotlight["213"].lq;
    const pfdMax = Object.values(B).reduce((a, b) => (b.pfd_share > a.pfd_share ? b : a));
    const sorted = Object.values(B).map((b) => b.pfd_share).sort((a, b) => a - b);
    const med = (sorted[14] + sorted[15]) / 2;
    return `
      <div class="eyebrow">Map explorer</div>
      <h2>What each borough lives on</h2>
      <div class="prose">
        <p class="lede">Alaska's 30 boroughs and census areas make a living in very different ways. Pick a measure, hover for values, and click a borough to see its profile.</p>
        <p>The North Slope runs on oil. Oilfield service jobs there are <span class="num">${Math.round(oil)}</span> times as concentrated as in the US. The average wage job pays <span class="num">${F.money(ns.avg_pay)}</span>, the highest in the state. Many of those workers fly in on rotation from elsewhere. The borough has <span class="num">${(ns.jobs / ns.pop).toFixed(2)}</span> wage jobs per resident.</p>
        <p>Bristol Bay lives by the salmon run. Its busiest month has <span class="num">${bb.seasonal.ratio.toFixed(1)}</span> times as many jobs as its slowest. In ${AK.esc(pfdMax.name)}, the Permanent Fund Dividend makes up <span class="num">${F.pct(pfdMax.pfd_share, 1)}</span> of all personal income, against <span class="num">${F.pct(med, 1)}</span> in the median borough. Mat-Su, the commuter belt north of Anchorage, grew its job count by <span class="num">${F.pct(ms.growth.pct)}</span> from 2010 to 2022, while the North Slope lost <span class="num">${F.pct(-ns.growth.pct)}</span>.</p>
      </div>`;
  }

  function sparkline(container, months, C) {
    const fr = AK.frame(container, { height: 64, margin: { t: 8, r: 34, b: 16, l: 4 }, label: "Wage jobs by month" });
    const x = d3.scaleLinear().domain([0, 11]).range([0, fr.w]);
    const y = d3.scaleLinear().domain(d3.extent(months)).nice().range([fr.h, 0]);
    fr.g.append("path").attr("d", d3.area().x((d, i) => x(i)).y0(fr.h).y1((d) => y(d)).curve(d3.curveMonotoneX)(months)).attr("fill", C.s[0]).attr("fill-opacity", 0.1);
    fr.g.append("path").attr("d", d3.line().x((d, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX)(months)).attr("fill", "none").attr("stroke", C.s[0]).attr("stroke-width", 2).attr("stroke-linecap", "round");
    const iMax = d3.maxIndex(months), iMin = d3.minIndex(months);
    for (const i of [iMax, iMin]) {
      fr.g.append("circle").attr("cx", x(i)).attr("cy", y(months[i])).attr("r", 4).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2);
    }
    fr.g.append("text").attr("x", fr.w + 6).attr("y", y(months[11]) + 4).attr("class", "lbl-val").text(F.compact(months[11]));
    [0, 6, 11].forEach((i) => fr.g.append("text").attr("x", x(i)).attr("y", fr.h + 13).attr("text-anchor", i === 0 ? "start" : i === 11 ? "end" : "middle").attr("class", "axis-label").text(F.month(i)));
    const hit = fr.g.append("rect").attr("width", fr.w).attr("height", fr.h + 8).attr("fill", "transparent");
    hit.on("pointermove", (e) => {
      const i = Math.max(0, Math.min(11, Math.round(x.invert(d3.pointer(e, fr.g.node())[0]))));
      AK.tip.show(e, `<b>${F.month(i)}</b>${AK.tip.row("Wage jobs, 2022\u201324 avg", F.int(months[i]))}`);
    }).on("pointerleave", AK.tip.hide);
  }

  function profile(panel, D, fips) {
    const C = AK.colors();
    const b = D.boroughs.boroughs[fips];
    panel.replaceChildren();
    const h = document.createElement("div");
    h.innerHTML = `<div class="eyebrow">Borough profile</div><h3 style="margin:.2rem 0 .6rem"></h3>`;
    h.querySelector("h3").textContent = b.name;
    panel.appendChild(h);

    const tiles = document.createElement("div");
    tiles.className = "tiles";
    tiles.style.gridTemplateColumns = "repeat(2, minmax(0,1fr))";
    const t = [["Population", F.int(b.pop)], ["Wage jobs", F.int(b.jobs)], ["Average pay", F.money(b.avg_pay)], ["Income per person", F.money(b.income?.per_capita)]];
    for (const [k, v] of t) { const d = document.createElement("div"); d.className = "tile"; d.innerHTML = `<span class="k"></span><span class="v" style="font-size:1.3rem"></span>`; d.children[0].textContent = k; d.children[1].textContent = v; tiles.appendChild(d); }
    panel.appendChild(tiles);

    // top resident industries
    const ttl = (s) => { const p = document.createElement("p"); p.className = "fig-sub"; p.style.margin = "1rem 0 .3rem"; p.style.fontWeight = "600"; p.style.color = "var(--ink)"; p.textContent = s; panel.appendChild(p); };
    ttl("What residents do: top six industries");
    const top = Object.entries(b.resident_industry || {}).sort((a, c) => c[1] - a[1]).slice(0, 6);
    const ind = document.createElement("div"); panel.appendChild(ind);
    const rowH = 20;
    const fr = AK.frame(ind, { height: top.length * rowH + 4, margin: { t: 2, r: 40, b: 2, l: 0 }, label: "Top resident industries" });
    const labW = Math.min(170, fr.w * 0.55);
    const x = d3.scaleLinear().domain([0, d3.max(top, (d) => d[1])]).range([0, fr.w - labW]);
    top.forEach(([k, v], i) => {
      const y = i * rowH;
      fr.g.append("text").attr("x", 0).attr("y", y + 13).text(IND[k].length > 30 && labW < 160 ? IND[k].slice(0, 26) + "\u2026" : IND[k]).style("font-size", "11px");
      fr.g.append("path").attr("d", AK.hbarPath(labW, y + 5, x(v), 10)).attr("fill", C.s[0]);
      fr.g.append("text").attr("x", labW + x(v) + 4).attr("y", y + 13.5).attr("class", "lbl-val").text(F.pct(v));
      fr.g.append("rect").attr("x", 0).attr("y", y).attr("width", fr.w).attr("height", rowH).attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(IND[k])}</b>${AK.tip.row("Share of employed residents", F.pct(v, 1))}`)).on("pointerleave", AK.tip.hide);
    });

    // income composition: tall segmented bar
    const inc = b.income;
    if (inc) {
      ttl("Where income comes from (2024)");
      const parts = [
        { label: "Wages & benefits", v: inc.wages_k + inc.supplements_k, c: C.s[0], ink: "#fff" },
        { label: "Business owners", v: inc.proprietors_k, c: C.s[1], ink: "#fff" },
        { label: "Dividends, interest & rent", v: inc.dir_k, c: C.s[2], ink: "#fff" },
        { label: "Government transfers", v: inc.transfers_k, c: C.s[3], ink: "#0b0b0b" },
      ];
      const tot = d3.sum(parts, (p) => Math.max(0, p.v));
      const segWrap = document.createElement("div"); panel.appendChild(segWrap);
      const W = Math.max(240, segWrap.clientWidth || panel.clientWidth || 300);
      const svg = d3.select(segWrap).append("svg").attr("width", W).attr("height", 28).attr("role", "img").attr("aria-label", "Income by source: " + parts.map((p) => `${p.label} ${F.pct(p.v / tot)}`).join(", "));
      let x0 = 0;
      parts.forEach((p) => {
        const w = (Math.max(0, p.v) / tot) * W;
        const gap = 2;
        const ww = Math.max(0, w - gap);
        svg.append("rect").attr("x", x0).attr("y", 0).attr("width", ww).attr("height", 28).attr("rx", 4).attr("fill", p.c)
          .on("pointermove", (e) => AK.tip.show(e, `<b>${p.label}</b>${AK.tip.row("Amount", F.moneyK(p.v))}${AK.tip.row("Share", F.pct(p.v / tot, 1))}`)).on("pointerleave", AK.tip.hide);
        const lbl = F.pct(p.v / tot);
        if (ww > lbl.length * 7 + 10) svg.append("text").attr("x", x0 + 6).attr("y", 18).text(lbl).style("fill", p.ink).style("font", "500 11px var(--f-data)").attr("pointer-events", "none");
        x0 += w;
      });
      AK.legend(panel, parts.map((p) => ({ label: p.label, color: p.c })));
      const note = document.createElement("p"); note.className = "fig-note"; note.style.marginTop = ".3rem";
      note.textContent = "Shares of these four sources before payroll taxes and commuting adjustments.";
      panel.appendChild(note);
    }

    // seasonal sparkline
    if (b.seasonal?.months) {
      ttl(`Wage jobs by month (peak ${F.ratio(b.seasonal.ratio)} the low)`);
      const sp = document.createElement("div"); panel.appendChild(sp);
      sparkline(sp, b.seasonal.months, C);
    }
    if (b.cfec && b.cfec.holders) {
      const p = document.createElement("p"); p.className = "fig-sub"; p.style.marginTop = ".75rem";
      p.textContent = `Commercial fishing (2023): ${F.int(b.cfec.holders)} resident permit holders, ${F.int(b.cfec.fishermen)} fished, ${F.moneyC(b.cfec.earnings)} estimated gross earnings.`;
      panel.appendChild(p);
    }
  }

  function render(el, D) {
    const B = D.boroughs.boroughs;
    const fipsList = Object.keys(B);
    const metrics = buildMetrics(D);
    let m = metrics.find((x) => x.key === metricKey) || metrics[0];
    const C = AK.colors();

    el.appendChild(AK.html(narrative(D)));
    const style = document.createElement("style");
    style.textContent = `.mx-grid{display:grid;gap:1.25rem;grid-template-columns:minmax(0,1fr)}
      @media(min-width:920px){.mx-grid{grid-template-columns:minmax(0,1.65fr) minmax(0,1fr)}}
      .mx-panel{min-width:0;border-top:1px solid var(--rule);padding-top:1rem}
      @media(min-width:920px){.mx-panel{border-top:0;border-left:1px solid var(--rule);padding:0 0 0 1.25rem}}`;
    el.appendChild(style);

    const fig = AK.fig({ id: "map-explorer", title: m.label, sub: m.sub, note: "Sources: BLS QCEW 2024, Census ACS 2020\u201324, BEA regional accounts. Gray boroughs have suppressed or no data for this measure." });
    el.appendChild(fig.root);
    const opts = metrics.map((x) => ({ value: x.key, label: x.label, group: x.group }));
    const selWrap = AK.select("map-metric", opts, m.key, (v) => { metricKey = v; rerender(); }, "Measure");
    selWrap.style.maxWidth = "100%"; selWrap.style.minWidth = "0";
    selWrap.querySelector("select").style.maxWidth = "min(22rem, 100%)";
    selWrap.querySelector("select").style.minWidth = "0";
    fig.head.style.maxWidth = "100%"; fig.head.style.minWidth = "0";
    fig.head.appendChild(selWrap);

    const grid = document.createElement("div"); grid.className = "mx-grid"; fig.body.appendChild(grid);
    const mapBox = document.createElement("div"); mapBox.style.minWidth = "0"; grid.appendChild(mapBox);
    const panel = document.createElement("div"); panel.className = "mx-panel"; grid.appendChild(panel);
    const rankBox = document.createElement("div"); rankBox.style.marginTop = "1.25rem"; fig.body.appendChild(rankBox);
    const tableBox = document.createElement("div"); fig.body.appendChild(tableBox);

    // full redraw of this section only (cheap: 30 features); keeps state in closure vars
    function rerender() { el.replaceChildren(); render(el, D); }

    const vals = {};
    fipsList.forEach((f) => (vals[f] = m.get(B[f])));
    const ranked = fipsList.filter((f) => vals[f] != null).sort((a, b) => vals[b] - vals[a]);
    const rankOf = (f) => (vals[f] == null ? null : ranked.indexOf(f) + 1);
    const sc = scaleFor(m, Object.values(vals));

    // map
    const w = mapBox.clientWidth || 600;
    const h = Math.round(Math.min(560, Math.max(190, w * 0.6)));
    const fr = AK.frame(mapBox, { height: h, margin: { t: 0, r: 0, b: 0, l: 0 }, label: "Map of Alaska boroughs colored by " + m.label });
    AK.drawAlaska(fr.g, {
      w: fr.w, h: fr.h,
      fill: (f) => sc.color(vals[f]),
      selected,
      onHover: (e, f) => {
        if (!f) return AK.tip.hide();
        const b = B[f], r = rankOf(f);
        let extra = "";
        if (m.key === "growth" && b.growth?.group) extra = `<div class="tk" style="margin-top:.3rem">Chugach and Copper River are shown together (they split in 2019).</div>`;
        AK.tip.show(e, `<b>${AK.esc(b.name)}</b>${AK.tip.row(AK.esc(m.label), vals[f] == null ? "Suppressed or none" : m.fmt(vals[f]))}${r ? AK.tip.row("Rank", `${r} of ${ranked.length}`) : ""}${extra}<div class="tk" style="margin-top:.3rem">Click for profile</div>`);
      },
      onClick: (e, f) => { selected = f; AK.tip.hide(); rerender(); },
    });
    // places: city dots (labels on wide screens) + Talkeetna highlighted
    const proj = AK.alaskaProjection(fr.w, fr.h);
    const pg = fr.g.append("g").attr("pointer-events", "none");
    const pts = D.places.filter((p) => (p.kind === "city" && p.name !== "Wasilla") || p.name === "Talkeetna");
    for (const p of pts) {
      const [px, py] = proj([p.lon, p.lat]);
      const isT = p.name === "Talkeetna";
      pg.append("circle").attr("cx", px).attr("cy", py).attr("r", isT ? 4.5 : 2.5).attr("fill", isT ? C.hl : C.ink).attr("stroke", C.surface).attr("stroke-width", 1.5);
      if (w > 520 || isT) {
        const left = ["Anchorage", "Unalaska", "Kodiak", "Dillingham", "Bethel", "Nome", "Kotzebue"].includes(p.name);
        pg.append("text").attr("x", left ? px - 6 : px + 6).attr("y", py + (p.name === "Anchorage" ? 9 : isT ? -4 : 3.5)).attr("text-anchor", left ? "end" : "start")
          .text(p.name).attr("class", isT ? "lbl-strong" : null).style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3).attr("stroke-linejoin", "round");
      }
    }
    // keys
    const keyRow = document.createElement("div");
    keyRow.style.display = "flex"; keyRow.style.flexWrap = "wrap"; keyRow.style.gap = ".25rem 1.25rem"; keyRow.style.alignItems = "center";
    mapBox.appendChild(keyRow);
    const rk = AK.rampKey(keyRow, sc.key, { lo: sc.lo, hi: sc.hi });
    if (sc.mid) { const s = document.createElement("span"); s.textContent = "mid: " + sc.mid; rk.appendChild(s); }
    if (fipsList.some((f) => vals[f] == null)) AK.legend(keyRow, [{ label: "Suppressed or none", color: C.grid }]);
    AK.legend(keyRow, [{ label: "Talkeetna", color: C.hl, kind: "dot" }]);

    profile(panel, D, selected);

    // ranked bars
    const rt = document.createElement("p"); rt.className = "fig-title"; rt.textContent = "All 30 boroughs, ranked"; rankBox.appendChild(rt);
    const order = [...ranked, ...fipsList.filter((f) => vals[f] == null).sort((a, b) => B[a].name.localeCompare(B[b].name))];
    const rowH = 18;
    const rf = AK.frame(rankBox, { height: order.length * rowH + 8, margin: { t: 6, r: 58, b: 2, l: 0 }, label: "Boroughs ranked by " + m.label });
    const labW = Math.min(150, rf.w * 0.42);
    const v = ranked.map((f) => vals[f]);
    const isDiv = m.scale === "div", isLog = m.scale === "lq" || m.scale === "log";
    let xs, x0;
    if (isDiv) { const a = d3.max(v, Math.abs); xs = d3.scaleLinear().domain([-a, a]).range([labW, rf.w]); x0 = xs(0); }
    else if (isLog) { const lo = Math.min(1, d3.min(v)) ; xs = d3.scaleLog().domain([m.scale === "lq" ? Math.min(lo, 0.1) : d3.min(v) * 0.95, d3.max(v)]).range([labW, rf.w]).clamp(true); x0 = labW; }
    else { xs = d3.scaleLinear().domain([0, d3.max(v)]).range([labW, rf.w]); x0 = labW; }
    if (m.scale === "lq") {
      const x1 = xs(1);
      rf.g.append("line").attr("x1", x1).attr("x2", x1).attr("y1", -4).attr("y2", order.length * rowH).attr("stroke", C.axis);
      rf.g.append("text").attr("x", x1 + 3).attr("y", -6 + 6).attr("class", "axis-label").text("US = 1\u00d7").attr("dy", -0.5);
    }
    if (isDiv) rf.g.append("line").attr("x1", x0).attr("x2", x0).attr("y1", 0).attr("y2", order.length * rowH).attr("stroke", C.axis);
    order.forEach((f, i) => {
      const y = i * rowH, val = vals[f], sel = f === selected;
      const nm = B[f].name;
      rf.g.append("text").attr("x", 0).attr("y", y + 12.5).text(nm.length > 22 && labW < 140 ? nm.slice(0, 20) + "\u2026" : nm).attr("class", sel ? "lbl-strong" : null).style("font-size", "11px");
      if (val == null) {
        rf.g.append("text").attr("x", labW).attr("y", y + 12.5).attr("class", "axis-label").text("suppressed or none");
      } else {
        let path, tipX;
        if (isDiv) {
          const xv = xs(val);
          if (val >= 0) { path = AK.hbarPath(x0, y + 4, xv - x0, 10); tipX = xv; }
          else { // mirror: rounded end on the left
            const wv = x0 - xv; path = AK.hbarPath(0, 0, wv, 10); tipX = xv;
            rf.g.append("path").attr("d", path).attr("transform", `translate(${x0},${y + 4}) scale(-1,1)`).attr("fill", sc.color(val)).attr("stroke", sel ? C.ink : "none").attr("stroke-width", sel ? 1.2 : 0);
            path = null;
          }
        } else { path = AK.hbarPath(x0, y + 4, Math.max(1, xs(val) - x0), 10); tipX = xs(val); }
        if (path) rf.g.append("path").attr("d", path).attr("fill", sc.color(val)).attr("stroke", sel ? C.ink : "none").attr("stroke-width", sel ? 1.2 : 0);
        const lx = isDiv && val < 0 ? x0 + 4 : tipX + 4;
        rf.g.append("text").attr("x", lx).attr("y", y + 12.5).attr("class", "lbl-val").text(m.fmt(val));
      }
      rf.g.append("rect").attr("x", 0).attr("y", y).attr("width", rf.w + 58).attr("height", rowH).attr("fill", "transparent").style("cursor", "pointer")
        .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(nm)}</b>${AK.tip.row(AK.esc(m.label), val == null ? "Suppressed or none" : m.fmt(val))}${rankOf(f) ? AK.tip.row("Rank", `${rankOf(f)} of ${ranked.length}`) : ""}`))
        .on("pointerleave", AK.tip.hide)
        .on("click", () => { selected = f; AK.tip.hide(); rerender(); });
    });

    AK.table(tableBox, [
      { key: "name", label: "Borough" },
      { key: "val", label: m.label, fmt: (x) => (x == null ? "Suppressed or none" : m.fmt(x)) },
      { key: "rank", label: "Rank", fmt: (x) => x ?? "\u2013" },
      { key: "pop", label: "Population", fmt: F.int },
      { key: "jobs", label: "Wage jobs", fmt: F.int },
    ], order.map((f) => ({ name: B[f].name, val: vals[f], rank: rankOf(f), pop: B[f].pop, jobs: B[f].jobs })));
  }
  AK.section("map", render);
})();
