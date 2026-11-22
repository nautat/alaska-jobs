/* sec_income.js: "Beyond the paycheck" — personal income mix, PFD, transfers,
 * residence adjustment, self-employment and commercial fishing. */
(function () {
  const F = () => AK.fmt;
  const COMP = [
    { key: "wages", label: "Wages & salaries" },
    { key: "supplements", label: "Benefits (pensions, insurance)" },
    { key: "proprietors", label: "Self-employment income" },
    { key: "dir", label: "Dividends, interest & rent" },
    { key: "transfers", label: "Government & other transfers" },
  ];
  const narrow = (w) => w < 520;
  const short = (s, w) => (narrow(w) && s.length > 15 ? s.slice(0, 14) + "…" : s);

  // Horizontal bar that may run left of the baseline; rounded data-end only.
  function hbarAny(x0, x1, y, h, r = 4) {
    if (x1 >= x0) return AK.hbarPath(x0, y, x1 - x0, h, r);
    const w = x0 - x1;
    r = Math.min(r, w, h / 2);
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
  }
  // Rectangle with all four corners rounded (segmented-bar blocks).
  function roundRect(x, y, w, h, r = 4) {
    r = Math.min(r, w / 2, h / 2);
    if (w <= 0) return "";
    return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
  }

  /** Ranked / diverging horizontal bars. rows: [{label, value, color?, tip}] */
  function hbars(body, rows, o = {}) {
    const C = AK.colors();
    const width = Math.max(260, body.clientWidth || 600);
    const band = o.band || 20, thick = Math.min(o.thick || 12, 24);
    const labelW = o.labelW ?? (narrow(width) ? 108 : 156);
    const valW = o.valW ?? 58;
    const fr = AK.frame(body, { height: rows.length * band + 8, margin: { t: 4, r: valW, b: 4, l: labelW }, label: o.aria });
    const vals = rows.map((r) => r.value).filter((v) => v != null);
    const lo = Math.min(0, d3.min(vals)), hi = Math.max(0, d3.max(vals));
    const x = d3.scaleLinear().domain(o.domain || [lo, hi]).range([0, fr.w]).nice();
    const x0 = x(0);
    const g = fr.g;
    if (lo < 0) g.append("line").attr("x1", x0).attr("x2", x0).attr("y1", -2).attr("y2", rows.length * band + 2).attr("stroke", C.axis);
    rows.forEach((r, i) => {
      const y = i * band + (band - thick) / 2;
      const row = g.append("g");
      row.append("text").attr("x", -8).attr("y", i * band + band / 2 + 3.5).attr("text-anchor", "end")
        .attr("class", r.strong ? "lbl-strong" : null).text(short(r.label, width));
      if (r.value != null) {
        row.append("path").attr("d", hbarAny(x0, x(r.value), y, thick)).attr("fill", r.color || C.s[0]);
        const neg = r.value < 0;
        const tx = neg ? Math.min(x(r.value), x0) - 4 : Math.max(x(r.value), x0) + 4;
        const lab = row.append("text").attr("class", "lbl-val").attr("y", i * band + band / 2 + 3.5).text(o.fmt(r.value));
        if (neg && lo < 0) {
          // negative bars: put value inside the label gutter side of the zero line if room, else right of zero
          if (x(r.value) - 4 - 46 > 0) lab.attr("x", tx).attr("text-anchor", "end");
          else lab.attr("x", x0 + 4).attr("text-anchor", "start");
        } else lab.attr("x", tx);
      } else {
        row.append("text").attr("class", "axis-label").attr("x", x0 + 4).attr("y", i * band + band / 2 + 3.5).text("n/a");
      }
      row.append("rect").attr("x", -labelW).attr("y", i * band).attr("width", fr.w + labelW + valW).attr("height", band)
        .attr("fill", "transparent")
        .on("pointermove", (e) => { row.attr("opacity", 1); AK.tip.show(e, r.tip); })
        .on("pointerleave", () => AK.tip.hide());
    });
    return fr;
  }

  /** Single-series line with crosshair tooltip. */
  function line(body, xs, ys, o = {}) {
    const C = AK.colors();
    const fr = AK.frame(body, { height: o.height || 220, margin: { t: 14, r: 44, b: 24, l: 46 }, label: o.aria });
    const pts = xs.map((x, i) => ({ x, y: ys[i] })).filter((d) => d.y != null);
    const x = d3.scaleLinear().domain(d3.extent(xs)).range([0, fr.w]);
    const y = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.y) * 1.08]).nice().range([fr.h, 0]);
    const g = fr.g;
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-fr.w).tickFormat("")).call((s) => s.select(".domain").remove());
    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat(o.yFmt)).call((s) => s.select(".domain").remove()).call((s) => s.selectAll("line").remove());
    g.append("g").attr("transform", `translate(0,${fr.h})`).call(d3.axisBottom(x).ticks(fr.w < 360 ? 4 : 7).tickFormat(d3.format("d")).tickSizeOuter(0));
    g.append("path").datum(pts).attr("fill", C.s[0]).attr("fill-opacity", 0.1)
      .attr("d", d3.area().x((d) => x(d.x)).y0(fr.h).y1((d) => y(d.y)));
    g.append("path").datum(pts).attr("fill", "none").attr("stroke", C.s[0]).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", d3.line().x((d) => x(d.x)).y((d) => y(d.y)));
    const last = pts[pts.length - 1], first = pts[0];
    for (const p of [first, last]) {
      g.append("circle").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", 4).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2);
    }
    g.append("text").attr("class", "lbl-val").attr("x", x(last.x) + 7).attr("y", y(last.y) + 3.5).text(o.fmt(last.y));
    const cross = g.append("line").attr("y1", 0).attr("y2", fr.h).attr("stroke", C.axis).attr("visibility", "hidden");
    const dot = g.append("circle").attr("r", 4.5).attr("fill", C.s[0]).attr("stroke", C.surface).attr("stroke-width", 2).attr("visibility", "hidden");
    g.append("rect").attr("width", fr.w).attr("height", fr.h).attr("fill", "transparent")
      .on("pointermove", (e) => {
        const [mx] = d3.pointer(e);
        const xv = x.invert(mx);
        const p = pts.reduce((a, b) => (Math.abs(b.x - xv) < Math.abs(a.x - xv) ? b : a));
        cross.attr("x1", x(p.x)).attr("x2", x(p.x)).attr("visibility", "visible");
        dot.attr("cx", x(p.x)).attr("cy", y(p.y)).attr("visibility", "visible");
        AK.tip.show(e, `<b>${p.x}</b>${AK.tip.row(o.label, o.fmt(p.y), C.s[0])}`);
      })
      .on("pointerleave", () => { cross.attr("visibility", "hidden"); dot.attr("visibility", "hidden"); AK.tip.hide(); });
    return fr;
  }

  // ---------- figures ----------
  function stateBar(body, D) {
    const C = AK.colors(), f = F();
    const inc = D.trends.income, i = inc.years.length - 1, year = inc.years[i];
    const parts = COMP.map((c, k) => ({ ...c, v: inc.components_k[c.key][i], color: C.s[k] }));
    const pos = d3.sum(parts, (p) => p.v);
    const width = Math.max(260, body.clientWidth || 600);
    const fr = AK.frame(body, { height: 40, margin: { t: 6, r: 0, b: 6, l: 0 }, label: `Alaska personal income ${year} by source` });
    const gap = 2, H = 28, totalW = fr.w - gap * (parts.length - 1);
    let x = 0;
    for (const p of parts) {
      const w = (p.v / pos) * totalW;
      const share = p.v / pos;
      const g = fr.g.append("g");
      g.append("path").attr("d", roundRect(x, 0, w, H)).attr("fill", p.color);
      const label = f.pct(share);
      if (w > label.length * 7 + 12) {
        const dark = p.key === "dir" && !AK.isDark(); // yellow slot 4 takes near-black text in light mode
        g.append("text").attr("x", x + 6).attr("y", H / 2 + 4).text(label)
          .style("fill", dark ? "#0b0b0b" : "#ffffff").style("font", "600 11.5px var(--f-data)");
      }
      g.append("rect").attr("x", x).attr("width", w).attr("height", H).attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, `<b>${p.label}</b>${AK.tip.row(String(year), f.moneyK(p.v), p.color)}${AK.tip.row("Share", f.pct(share, 1))}`))
        .on("pointerleave", () => AK.tip.hide());
      x += w + gap;
    }
    AK.legend(body, parts.map((p) => ({ label: p.label, color: p.color })));
    AK.table(body, [{ key: "label", label: "Source" }, { key: "v", label: `${year} ($)`, fmt: f.moneyK }, { key: "s", label: "Share", fmt: (v) => f.pct(v, 1) }],
      parts.map((p) => ({ label: p.label, v: p.v, s: p.v / pos })));
    void width;
  }

  function boroughMix(body, D) {
    const C = AK.colors(), f = F();
    const B = D.boroughs.boroughs;
    const rows = Object.entries(B).map(([fips, b]) => {
      const vals = COMP.map((c) => b.income[c.key + "_k"] ?? 0);
      const pos = d3.sum(vals);
      return { fips, name: b.name, vals, pos, shares: vals.map((v) => v / pos), pc: b.income.per_capita };
    }).sort((a, b) => b.shares[4] - a.shares[4]);
    const width = Math.max(260, body.clientWidth || 600);
    const band = 18, thick = 12, labelW = narrow(width) ? 108 : 156;
    const fr = AK.frame(body, { height: rows.length * band + 30, margin: { t: 4, r: 8, b: 24, l: labelW }, label: "Income mix by borough" });
    const x = d3.scaleLinear().domain([0, 1]).range([0, fr.w]);
    const g = fr.g;
    g.append("g").attr("class", "grid").attr("transform", `translate(0,${rows.length * band})`)
      .call(d3.axisBottom(x).ticks(fr.w < 320 ? 3 : 5).tickFormat(d3.format(".0%")).tickSize(-rows.length * band))
      .call((s) => s.select(".domain").remove());
    rows.forEach((r, i) => {
      const y = i * band + (band - thick) / 2;
      const isMS = r.fips === "02170";
      const row = g.append("g");
      row.append("text").attr("x", -8).attr("y", i * band + band / 2 + 3.5).attr("text-anchor", "end")
        .attr("class", isMS ? "lbl-strong" : null).text(short(r.name, width));
      let cx = 0;
      const n = r.vals.length;
      r.shares.forEach((s, k) => {
        const w = Math.max(0, x(s) - (k < n - 1 ? 2 : 0));
        if (w > 0) {
          const d = k === n - 1 ? AK.hbarPath(cx, y, w, thick) : `M${cx},${y}h${w}v${thick}h${-w}Z`;
          row.append("path").attr("d", d).attr("fill", C.s[k]);
        }
        cx += x(s);
      });
      const tip = `<b>${AK.esc(r.name)}</b>` + COMP.map((c, k) => AK.tip.row(c.label, `${f.pct(r.shares[k])} · ${f.moneyK(r.vals[k])}`, C.s[k])).join("") +
        AK.tip.row("Per person (2024)", f.money(r.pc));
      row.append("rect").attr("x", -labelW).attr("y", i * band).attr("width", fr.w + labelW).attr("height", band).attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, tip)).on("pointerleave", () => AK.tip.hide());
    });
    AK.legend(body, COMP.map((c, k) => ({ label: c.label, color: C.s[k] })));
    AK.table(body, [{ key: "name", label: "Borough" }, ...COMP.map((c, k) => ({ key: "s" + k, label: c.label, fmt: (v) => f.pct(v, 1) })), { key: "pc", label: "Per person", fmt: f.money }],
      rows.map((r) => Object.assign({ name: r.name, pc: r.pc }, ...r.shares.map((s, k) => ({ ["s" + k]: s })))));
  }

  function residence(body, D) {
    const C = AK.colors(), f = F();
    const rows = Object.entries(D.boroughs.boroughs).map(([fips, b]) => ({
      fips, label: b.name, value: b.income.residence_adj_k * 1000, pi: b.income.pi_k * 1000,
    })).sort((a, b) => b.value - a.value);
    const out = rows.map((r) => ({
      label: r.label, value: r.value, strong: r.fips === "02170",
      color: r.value >= 0 ? C.s[0] : C.s[7],
      tip: `<b>${AK.esc(r.label)}</b>${AK.tip.row("Residence adjustment", (r.value > 0 ? "+" : "") + f.moneyC(r.value))}${AK.tip.row("Share of personal income", f.signedPct(r.value / r.pi, 1))}`,
    }));
    hbars(body, out, { band: 17, thick: 11, fmt: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + f.moneyC(Math.abs(v)), aria: "Residence adjustment by borough", valW: 54 });
    AK.legend(body, [{ label: "Residents earn more than local jobs pay (commuters)", color: C.s[0] }, { label: "Local jobs pay out to people living elsewhere", color: C.s[7] }]);
    AK.table(body, [{ key: "label", label: "Borough" }, { key: "value", label: "Residence adjustment, 2024", fmt: (v) => f.moneyC(v) }, { key: "s", label: "Share of income", fmt: (v) => f.signedPct(v, 1) }],
      rows.map((r) => ({ label: r.label, value: r.value, s: r.value / r.pi })));
  }

  function pfdColumns(body, D) {
    const C = AK.colors(), f = F();
    const P = D.trends.pfd;
    const fr = AK.frame(body, { height: 240, margin: { t: 22, r: 8, b: 24, l: 44 }, label: "Permanent Fund Dividend per person, 1982–2025" });
    const x = d3.scaleBand().domain(P.map((d) => d.year)).range([0, fr.w]).paddingInner(0.18);
    const y = d3.scaleLinear().domain([0, d3.max(P, (d) => d.amount) * 1.08]).nice().range([fr.h, 0]);
    const g = fr.g;
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-fr.w).tickFormat("")).call((s) => s.select(".domain").remove());
    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat((v) => "$" + d3.format(",")(v))).call((s) => s.select(".domain").remove()).call((s) => s.selectAll("line").remove());
    const step = fr.w < 400 ? 10 : 5;
    g.append("g").attr("transform", `translate(0,${fr.h})`)
      .call(d3.axisBottom(x).tickValues(P.map((d) => d.year).filter((yr) => yr % step === 0)).tickSizeOuter(0));
    const bw = Math.min(24, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    const notes = new Set([2022, 2025, 2008]);
    for (const d of P) {
      g.append("path").attr("d", AK.vbarPath(x(d.year) + off, y(d.amount), bw, fr.h, Math.min(4, bw / 2))).attr("fill", notes.has(d.year) && d.year !== 2008 ? C.s[1] : C.s[0]);
    }
    for (const yr of [2022, 2025]) {
      const d = P.find((p) => p.year === yr);
      if (!d) continue;
      const cx = x(d.year) + x.bandwidth() / 2;
      const prev = P.find((p) => p.year === yr - 1);
      const top = yr === 2025 && prev ? Math.min(y(d.amount), y(prev.amount)) : y(d.amount);
      g.append("text").attr("class", "lbl-val").attr("x", cx).attr("y", top - 6).attr("text-anchor", yr === 2025 ? "end" : "middle").text(f.money(d.amount));
    }
    g.append("rect").attr("width", fr.w).attr("height", fr.h).attr("fill", "transparent")
      .on("pointermove", (e) => {
        const [mx] = d3.pointer(e);
        const i = Math.max(0, Math.min(P.length - 1, Math.floor(mx / x.step())));
        const d = P[i];
        AK.tip.show(e, `<b>${d.year} dividend</b>${AK.tip.row("Per person", f.money(d.amount))}${AK.tip.row("Paid out", f.moneyC(d.disbursed))}${AK.tip.row("Recipients", f.int(d.recipients))}`);
      })
      .on("pointerleave", () => AK.tip.hide());
    AK.legend(body, [{ label: "Dividend per person", color: C.s[0] }, { label: "Years called out in the text", color: C.s[1] }]);
    AK.table(body, [{ key: "year", label: "Year" }, { key: "amount", label: "Per person", fmt: f.money }, { key: "disbursed", label: "Total paid", fmt: f.moneyC }, { key: "recipients", label: "Recipients", fmt: f.int }], [...P].reverse());
  }

  function pfdShareLine(body, D) {
    const f = F();
    const T = D.trends.transfers, I = D.trends.income;
    const piBy = new Map(I.years.map((y, i) => [y, I.personal_income_k[i]]));
    const ys = T.years.map((y, i) => (piBy.get(y) ? T.other_gov_k[i] / piBy.get(y) : null));
    line(body, T.years, ys, { fmt: (v) => f.pct(v, 1), yFmt: d3.format(".0%"), label: "PFD share of income", aria: "PFD share of Alaska personal income, 2001–2022" });
    AK.table(body, [{ key: "y", label: "Year" }, { key: "s", label: "Share of personal income", fmt: (v) => f.pct(v, 2) }, { key: "k", label: "Other gov't transfers", fmt: f.moneyK }],
      T.years.map((y, i) => ({ y, s: ys[i], k: T.other_gov_k[i] })).reverse());
  }

  function transfersComp(body, D) {
    const C = AK.colors(), f = F();
    const T = D.trends.transfers, i = T.years.length - 1, year = T.years[i];
    const items = [
      { key: "medicaid_k", label: "Medicaid & public medical care" },
      { key: "other_gov_k", label: "PFD & other gov't transfers" },
      { key: "social_security_k", label: "Social Security" },
      { key: "medicare_k", label: "Medicare" },
      { key: "income_maint_k", label: "SNAP, SSI & income support" },
      { key: "veterans_k", label: "Veterans' benefits" },
    ].map((d) => ({ ...d, v: T[d.key][i] }));
    const named = d3.sum(items, (d) => d.v);
    items.push({ key: "rest", label: "Everything else", v: T.total_k[i] - named });
    items.sort((a, b) => (a.key === "rest") - (b.key === "rest") || b.v - a.v);
    const total = T.total_k[i];
    hbars(body, items.map((d) => ({
      label: d.label, value: d.v * 1000, color: d.key === "other_gov_k" ? C.s[1] : C.s[0], strong: d.key === "other_gov_k",
      tip: `<b>${d.label}</b>${AK.tip.row(String(year), f.moneyK(d.v))}${AK.tip.row("Share of transfers", f.pct(d.v / total, 1))}`,
    })), { fmt: (v) => f.moneyC(v), aria: `Transfer income by program, ${year}`, labelW: narrow(body.clientWidth) ? 132 : 190 });
    AK.table(body, [{ key: "label", label: "Program" }, { key: "v", label: `${year}`, fmt: f.moneyK }, { key: "s", label: "Share", fmt: (v) => f.pct(v, 1) }],
      items.map((d) => ({ label: d.label, v: d.v, s: d.v / total })));
  }

  function selfEmployed(body, D) {
    const f = F(), C = AK.colors();
    const rows = Object.entries(D.boroughs.boroughs).map(([fips, b]) => ({ fips, label: b.name, value: b.self_employed_share, emp: b.employed }))
      .sort((a, b) => b.value - a.value);
    const st = D.overview.headline.self_employed_share;
    hbars(body, rows.map((r) => ({
      label: r.label, value: r.value, strong: r.fips === "02170", color: C.s[0],
      tip: `<b>${AK.esc(r.label)}</b>${AK.tip.row("Self-employed", f.pct(r.value, 1))}${AK.tip.row("Employed residents", f.int(r.emp))}${AK.tip.row("Alaska", f.pct(st, 1))}`,
    })), { band: 17, thick: 11, fmt: (v) => f.pct(v), aria: "Self-employed share of workers by borough", valW: 40 });
    AK.table(body, [{ key: "label", label: "Borough" }, { key: "value", label: "Self-employed share", fmt: (v) => f.pct(v, 1) }, { key: "emp", label: "Employed residents", fmt: f.int }], rows);
  }

  function fishResidency(body, D) {
    const f = F(), C = AK.colors();
    const R = D.trends.cfec_residency;
    hbars(body, R.rows.map((r) => ({
      label: r.who, value: r.earnings, color: r.who === "Alaska" ? C.s[0] : C.s[0], strong: r.who === "Alaska",
      tip: `<b>${AK.esc(r.who)} residents</b>${AK.tip.row("Gross earnings", f.moneyC(r.earnings))}${AK.tip.row("Permit holders", f.int(r.holders))}${AK.tip.row("Fished", f.int(r.fishermen))}${AK.tip.row("Earnings per fisherman", f.money(r.earnings / r.fishermen))}`,
    })), { fmt: f.moneyC, aria: `Commercial fishing earnings by residency, ${R.year}`, labelW: narrow(body.clientWidth) ? 96 : 150 });
    AK.table(body, [{ key: "who", label: "Residents of" }, { key: "earnings", label: "Gross earnings", fmt: f.money }, { key: "holders", label: "Permit holders", fmt: f.int }, { key: "fishermen", label: "Fished", fmt: f.int }], R.rows);
  }

  function fishGroups(body, D) {
    const f = F(), C = AK.colors();
    const G = D.trends.cfec_groups;
    const rows = G.rows.filter((r) => r.earnings > 1e5);
    hbars(body, rows.map((r) => ({
      label: r.group, value: r.earnings, color: C.s[0],
      tip: `<b>${AK.esc(r.group)}</b>${AK.tip.row("Gross earnings", f.moneyC(r.earnings))}${AK.tip.row("Permit holders", f.int(r.holders))}${AK.tip.row("Fished", f.int(r.fishermen))}`,
    })), { fmt: f.moneyC, aria: `Alaska residents' fishing earnings by fishery, ${G.year}`, labelW: narrow(body.clientWidth) ? 104 : 130 });
    AK.table(body, [{ key: "group", label: "Fishery" }, { key: "earnings", label: "Gross earnings", fmt: f.money }, { key: "holders", label: "Permit holders", fmt: f.int }, { key: "fishermen", label: "Fished", fmt: f.int }], G.rows);
  }

  function fishHolders(body, D) {
    const f = F();
    const R = D.trends.cfec_resident;
    line(body, R.years, R.holders, { fmt: f.int, yFmt: d3.format(",.0f"), label: "Permit holders", aria: "Alaska-resident commercial fishing permit holders, 2000–2023", height: 200 });
    AK.table(body, [{ key: "y", label: "Year" }, { key: "h", label: "Permit holders", fmt: f.int }, { key: "n", label: "Fished", fmt: f.int }, { key: "e", label: "Gross earnings", fmt: f.money }],
      R.years.map((y, i) => ({ y, h: R.holders[i], n: R.fishermen[i], e: R.earnings[i] })).reverse());
  }

  // ---------- section ----------
  AK.section("income", (el, D) => {
    const f = F();
    const inc = D.trends.income, li = inc.years.length - 1, yr = inc.years[li];
    const comp = (k) => inc.components_k[k][li];
    const pi = inc.personal_income_k[li];
    const pos = COMP.reduce((s, c) => s + comp(c.key), 0);
    const wageShare = comp("wages") / pos, trShare = comp("transfers") / pos, dirShare = comp("dir") / pos, propShare = comp("proprietors") / pos;
    const T = D.trends.transfers, ti = T.years.length - 1, tyr = T.years[ti];
    const piByYear = new Map(inc.years.map((y, i) => [y, inc.personal_income_k[i]]));
    const pfdShare = T.other_gov_k[ti] / piByYear.get(tyr);
    const pfd = D.trends.pfd, pfdLast = pfd[pfd.length - 1], pfd22 = pfd.find((d) => d.year === 2022), pfdMax = pfd.reduce((a, b) => (b.amount > a.amount ? b : a));
    const B = Object.entries(D.boroughs.boroughs).map(([fips, b]) => ({ fips, ...b }));
    const byPfd = [...B].sort((a, b) => b.pfd_share - a.pfd_share);
    const byTr = [...B].sort((a, b) => b.transfer_share - a.transfer_share);
    const ms = D.boroughs.boroughs["02170"];
    const anc = D.boroughs.boroughs["02020"];
    const byRes = B.filter((b) => b.fips !== "02020").sort((a, b) => a.income.residence_adj_k - b.income.residence_adj_k);
    const bySe = [...B].sort((a, b) => b.self_employed_share - a.self_employed_share);
    const st = D.overview.headline;
    const fr = D.trends.cfec_residency.rows, ak = fr.find((r) => r.who === "Alaska"), wa = fr.find((r) => r.who === "Washington");
    const totalFish = d3.sum(fr, (r) => r.earnings);
    const cr = D.trends.cfec_resident, h0 = cr.holders[0], h1 = cr.holders[cr.holders.length - 1];
    const salmon = D.trends.cfec_groups.rows.find((r) => r.group === "Salmon");
    const n = (s) => `<span class="num">${s}</span>`;

    el.appendChild(AK.html(`
      <div class="eyebrow">Income beyond wages</div>
      <h2>Beyond the paycheck</h2>
      <div class="prose">
        <p class="lede">Alaskans received ${n(f.moneyK(pi))} in personal income in ${yr}, or ${n(f.money(st.per_capita_income))} per person. Before payroll taxes, wages and salaries made up ${n(f.pct(wageShare))} of it. The rest came from benefits, businesses people run for themselves, investments, and checks from government.</p>
        <p>Government transfers made up ${n(f.pct(trShare))} of income. The biggest pieces are health programs: Medicaid and Medicare. Social Security comes next. Then there is the one only Alaska has: the Permanent Fund Dividend, a yearly payment to nearly every resident from the earnings of the state's oil-wealth savings account.</p>
      </div>`));

    let fg = AK.fig({ id: "inc-state", title: `Where Alaska's ${yr} personal income came from`, sub: "Share of income from each source, before taxes",
      note: `Source: BEA CAINC4. Also in the BEA total: ${f.moneyK(comp("contributions"))} in Social Security and Medicare payroll contributions are subtracted, and ${f.moneyK(Math.abs(comp("residence_adj")))} ${comp("residence_adj") < 0 ? "is subtracted for pay earned in Alaska by people who live elsewhere" : "is added for pay Alaskans earn outside the state"}. Personal income nets to ${f.moneyK(pi)}.` });
    el.appendChild(fg.root); stateBar(fg.body, D);

    el.appendChild(AK.html(`<div class="prose"><h3>The dividend</h3>
      <p>The dividend has been paid every year since 1982. It swings with oil prices, stock markets, and politics. The largest was ${n(f.money(pfdMax.amount))} in ${pfdMax.year}, which included a one-time energy relief payment. The ${pfdLast.year} check was ${n(f.money(pfdLast.amount))}, about ${n(f.moneyC(pfdLast.disbursed))} in all.</p>
      <p>Across the state the dividend and similar state payments were ${n(f.pct(pfdShare, 1))} of personal income in ${tyr}. In the rural Southwest it matters far more. In ${AK.esc(byPfd[0].name)} it was ${n(f.pct(byPfd[0].pfd_share, 1))} of all income, and in ${AK.esc(byPfd[1].name)} ${n(f.pct(byPfd[1].pfd_share, 1))}.</p></div>`));
    const grid1 = document.createElement("div"); grid1.className = "fig-grid"; el.appendChild(grid1);
    fg = AK.fig({ id: "inc-pfd", title: "Dividend per person, 1982–2025", sub: `${f.money(pfd22.amount)} in 2022 included a $662 energy relief payment`, note: "Source: Alaska Department of Revenue, PFD Division." });
    grid1.appendChild(fg.root); pfdColumns(fg.body, D);
    fg = AK.fig({ id: "inc-pfdshare", title: "Dividend share of personal income, 2001–2022", sub: "BEA's \"other transfers from government\", which in Alaska is mostly the PFD", note: "Source: BEA CAINC35 line 2700 and CAINC4." });
    grid1.appendChild(fg.root); pfdShareLine(fg.body, D);

    fg = AK.fig({ id: "inc-transfers", title: `Transfer income by program, ${tyr}`, sub: `${f.moneyK(T.total_k[ti])} statewide. Medicaid includes other public medical care.`, note: "Source: BEA CAINC35." });
    el.appendChild(fg.root); transfersComp(fg.body, D);

    el.appendChild(AK.html(`<div class="prose"><h3>Every borough mixes it differently</h3>
      <p>In ${AK.esc(byTr[0].name)} transfers were ${n(f.pct(byTr[0].transfer_share))} of income in 2024, the highest share in the state. In ${AK.esc(byTr[byTr.length - 1].name)} they were ${n(f.pct(byTr[byTr.length - 1].transfer_share))}. Places with big fishing fleets show more self-employment income. Places with many retirees show more dividends, interest, and rent.</p></div>`));
    fg = AK.fig({ id: "inc-mix", title: "Income mix by borough, 2024", sub: "Sorted by the share from transfers. Hover a row for dollar amounts.", note: "Source: BEA CAINC4. Shares of the five sources before payroll contributions and residence adjustment." });
    el.appendChild(fg.root); boroughMix(fg.body, D);

    el.appendChild(AK.html(`<div class="prose"><h3>Where paychecks go home</h3>
      <p>BEA counts wages where the job is, then moves them to where the worker lives. Mat-Su residents earned ${n(f.moneyK(ms.income.residence_adj_k))} more in 2024 than jobs inside the borough paid out, mostly from commuting to Anchorage and flying to the North Slope. The opposite happens where crews fly in. In ${AK.esc(byRes[0].name)}, ${n(f.moneyK(-byRes[0].income.residence_adj_k))} of local pay left with workers who live somewhere else. Anchorage shows ${n(f.moneyK(-anc.income.residence_adj_k))} going out, much of it to Mat-Su commuters.</p></div>`));
    fg = AK.fig({ id: "inc-residence", title: "Residence adjustment by borough, 2024", sub: "Pay earned by residents working elsewhere, minus pay leaving with non-residents", note: "Source: BEA CAINC4 line 42. Anchorage is negative partly because Mat-Su commuters work there." });
    el.appendChild(fg.root); residence(fg.body, D);

    el.appendChild(AK.html(`<div class="prose"><h3>Working for yourself</h3>
      <p>Payroll counts miss people who work for themselves. The Census survey finds ${n(f.pct(st.self_employed_share))} of employed Alaskans are self-employed. In small Southeast towns it runs much higher: ${n(f.pct(bySe[0].self_employed_share))} in ${AK.esc(bySe[0].name)}, ${n(f.pct(bySe[1].self_employed_share))} in ${AK.esc(bySe[1].name)}, and ${n(f.pct(bySe[2].self_employed_share))} in ${AK.esc(bySe[2].name)}. Many of these are fishermen, guides, builders, and lodge owners. Self-employment income added ${n(f.pct(propShare))} to Alaska's personal income in ${yr}.</p></div>`));
    fg = AK.fig({ id: "inc-self", title: "Self-employed share of working residents", sub: "Incorporated and unincorporated businesses, 2020–2024", note: "Source: Census ACS 5-year, table B24080." });
    el.appendChild(fg.root); selfEmployed(fg.body, D);

    el.appendChild(AK.html(`<div class="prose"><h3>Commercial fishing</h3>
      <p>Most commercial fishermen are self-employed, so they barely show up in job counts. In ${D.trends.cfec_residency.year} permit holders grossed ${n(f.moneyC(totalFish))} at the dock. Alaska residents took ${n(f.moneyC(ak.earnings))} of that. Washington residents took ${n(f.moneyC(wa.earnings))}, with about a fifth as many permit holders. Salmon alone paid Alaska residents ${n(f.moneyC(salmon.earnings))}.</p>
      <p>The number of Alaskans holding permits has fallen from ${n(f.int(h0))} in ${cr.years[0]} to ${n(f.int(h1))} in ${cr.years[cr.years.length - 1]}.</p></div>`));
    const grid2 = document.createElement("div"); grid2.className = "fig-grid"; el.appendChild(grid2);
    fg = AK.fig({ id: "inc-fish-res", title: `Fishing earnings by where fishermen live, ${D.trends.cfec_residency.year}`, sub: "Estimated gross earnings, all fisheries", note: "Source: Alaska CFEC." });
    grid2.appendChild(fg.root); fishResidency(fg.body, D);
    fg = AK.fig({ id: "inc-fish-grp", title: `What Alaska residents fish, ${D.trends.cfec_groups.year}`, sub: "Estimated gross earnings by fishery", note: "Source: Alaska CFEC. Fisheries under $100K omitted from the chart." });
    grid2.appendChild(fg.root); fishGroups(fg.body, D);
    fg = AK.fig({ id: "inc-fish-holders", title: "Alaska residents holding commercial fishing permits", sub: `${cr.years[0]}–${cr.years[cr.years.length - 1]}`, note: "Source: Alaska CFEC." });
    el.appendChild(fg.root); fishHolders(fg.body, D);
  });
})();
