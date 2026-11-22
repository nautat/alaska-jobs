/* sec_overview.js: hero map + "The big picture" section. */
(function () {
  const F = AK.fmt;

  // Short readable labels for BEA CAEMP25N lines.
  const BEA_LABEL = {
    100: "Forestry, fishing & related",
    200: "Mining, oil & gas",
    300: "Utilities",
    400: "Construction",
    500: "Manufacturing",
    600: "Wholesale trade",
    700: "Retail trade",
    800: "Transportation & warehousing",
    900: "Information",
    1000: "Finance & insurance",
    1100: "Real estate & rental",
    1200: "Professional & technical services",
    1300: "Management of companies",
    1400: "Administrative & support services",
    1500: "Educational services (private)",
    1600: "Health care & social assistance",
    1700: "Arts, entertainment & recreation",
    1800: "Accommodation & food services",
    1900: "Other services",
  };

  /**
   * Horizontal bar chart with labels. rows: [{label, value, color, tip(html)}]
   * Wide: labels in a left column. Narrow: label above each bar.
   * opts: {fmt, ref:{value,label}, xMax}
   */
  function hbars(container, rows, opts) {
    const C = AK.colors();
    const width = Math.max(260, container.clientWidth || 600);
    const narrow = width < 560;
    const barH = narrow ? 12 : 16;
    const rowH = narrow ? 36 : 24;
    const labelW = narrow ? 0 : Math.min(230, Math.round(width * 0.36));
    const valW = 64;
    const top = opts.ref ? 18 : 4;
    const height = top + rows.length * rowH + 6;
    const fr = AK.frame(container, { height, margin: { t: top, r: valW, b: 6, l: labelW }, label: opts.label });
    const xMax = opts.xMax || d3.max(rows, (r) => r.value) || 1;
    const x = d3.scaleLinear().domain([0, xMax]).range([0, fr.w]);
    const g = fr.g;

    if (opts.ref) {
      const xr = x(opts.ref.value);
      g.append("line").attr("x1", xr).attr("x2", xr).attr("y1", -6).attr("y2", rows.length * rowH)
        .attr("stroke", C.ink2).attr("stroke-width", 1).attr("stroke-dasharray", null);
      g.append("text").attr("x", xr).attr("y", -9).attr("text-anchor", xr > fr.w * 0.7 ? "end" : "middle")
        .attr("class", "axis-label").text(opts.ref.label);
    }

    rows.forEach((r, i) => {
      const y0 = i * rowH;
      const by = narrow ? y0 + 18 : y0 + (rowH - barH) / 2;
      const row = g.append("g");
      if (narrow) {
        row.append("text").attr("x", 0).attr("y", y0 + 11).text(r.label).style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 4).attr("stroke-linejoin", "round");
      } else {
        row.append("text").attr("x", -8).attr("y", y0 + rowH / 2 + 4).attr("text-anchor", "end").text(r.label);
      }
      row.append("path").attr("d", AK.hbarPath(0, by, x(r.value), barH)).attr("fill", r.color);
      row.append("text").attr("class", "lbl-val").attr("x", x(r.value) + 6).attr("y", by + barH / 2 + 3.5).text(opts.fmt(r.value));
      // hit target spans the whole row
      row.append("rect").attr("x", -labelW).attr("y", y0).attr("width", fr.w + labelW + valW).attr("height", rowH)
        .attr("fill", "transparent")
        .on("pointermove", (e) => AK.tip.show(e, r.tip))
        .on("pointerleave", () => AK.tip.hide());
    });
    return fr;
  }

  /**
   * Guard: drop any polygon whose spherical area exceeds a hemisphere. Simplification can
   * collapse a tiny island into an inverted ring that d3 reads as "the whole globe".
   * Idempotent; a no-op once the geo build drops degenerate rings itself.
   */
  function dropInverted(fc) {
    for (const f of fc.features) {
      const g = f.geometry;
      if (g.type === "MultiPolygon") g.coordinates = g.coordinates.filter((p) => d3.geoArea({ type: "Polygon", coordinates: p }) < 2 * Math.PI);
    }
    return fc;
  }

  // ---------------- hero ----------------
  AK.section("hero", (el, D) => {
    dropInverted(AK.boroughFeatures());
    const C = AK.colors();
    const B = D.boroughs.boroughs;
    const width = Math.max(260, el.clientWidth || 500);
    const height = Math.round(Math.min(340, width * 0.62));
    const fr = AK.frame(el, { height, margin: { t: 0, r: 0, b: 0, l: 0 }, label: "Map of Alaska's boroughs shaded by number of wage jobs in 2024" });
    const jobs = Object.values(B).map((b) => b.jobs).filter((v) => v > 0);
    const lo = Math.log10(d3.min(jobs)), hi = Math.log10(d3.max(jobs));
    const seq = AK.seq([lo, hi]);
    const fill = (f) => (B[f] && B[f].jobs > 0 ? seq(Math.log10(B[f].jobs)) : C.grid);
    const { projection } = AK.drawAlaska(fr.g, {
      w: fr.w, h: fr.h, fill,
      onHover: (e, f) => {
        if (!f) return AK.tip.hide();
        const b = B[f];
        AK.tip.show(e, `<b>${AK.esc(b.name)}</b>` + AK.tip.row("Wage jobs, 2024", F.int(b.jobs)) + AK.tip.row("Average pay", F.money(b.avg_pay)));
      },
    });
    // Places: small dots for cities + Upper Su; labels for a few.
    const LABEL = new Set(["Anchorage", "Fairbanks", "Juneau", "Bethel", "Utqiagvik", "Nome", "Talkeetna"]);
    const pg = fr.g.append("g").attr("pointer-events", "none");
    const pts = D.places.filter((p) => p.kind === "city" || p.kind === "uppersu");
    pts.sort((a, b) => (a.name === "Talkeetna") - (b.name === "Talkeetna"));
    for (const p of pts) {
      const [x, y] = projection([p.lon, p.lat]);
      const isT = p.name === "Talkeetna";
      if (p.kind === "uppersu" && !isT) continue;
      pg.append("circle").attr("cx", x).attr("cy", y).attr("r", isT ? 4.5 : 2.5)
        .attr("fill", isT ? C.hl : C.ink).attr("stroke", C.surface).attr("stroke-width", 1.5);
      if (LABEL.has(p.name)) {
        const left = p.name === "Anchorage" || p.name === "Bethel" || p.name === "Nome" || x > fr.w - 52;
        pg.append("text").attr("x", left ? x - 6 : x + 6).attr("y", y + (p.name === "Talkeetna" ? -4 : 3.5))
          .attr("text-anchor", left ? "end" : "start").text(p.name)
          .attr("class", isT ? "lbl-strong" : null)
          .style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3).attr("stroke-linejoin", "round");
      }
    }
    AK.rampKey(el, seq, { lo: F.compact(10 ** lo) + " jobs", hi: F.compact(10 ** hi) });
    const cap = document.createElement("p");
    cap.className = "fig-note";
    cap.textContent = "Wage-and-salary jobs by borough, 2024 (log scale). Source: BLS QCEW.";
    el.appendChild(cap);
    AK.table(el, [
      { key: "name", label: "Borough" },
      { key: "jobs", label: "Wage jobs 2024", fmt: F.int },
      { key: "avg_pay", label: "Average pay", fmt: F.money },
    ], Object.values(B).slice().sort((a, b) => b.jobs - a.jobs));
  });

  // ---------------- overview ----------------
  AK.section("overview", (el, D) => {
    const C = AK.colors();
    const O = D.overview, H = O.headline, A = O.all_jobs_bea, Q = O.qcew_total;
    const gov = A.gov;
    const govTotal = gov.federal_civilian + gov.military + gov.state + gov.local;
    const health = A.sectors.find((s) => s.line === 1600);
    const oil = O.spotlight.find((s) => s.code === "211");
    const sea = O.spotlight.find((s) => s.code === "3117");
    const scenic = O.spotlight.find((s) => s.code === "487");
    const acc = O.spotlight.find((s) => s.code === "721");
    const food = O.spotlight.find((s) => s.code === "722");
    const leis = O.supersectors.find((s) => s.code === "1026");
    const propShare = A.proprietors / A.total;

    el.appendChild(AK.html(`
      <div class="eyebrow">The big picture</div>
      <h2>Who employs Alaskans</h2>
      <div class="prose">
        <p class="lede">Alaska has about <span class="num">${F.compact(H.population)}</span> people and, counting the self-employed and the military, about <span class="num">${F.compact(A.total)}</span> jobs. Government is the single biggest employer, but health care and the visitor trade employ more people than oil.</p>
        <p>Public payrolls carry <span class="num">${F.pct(H.gov_share_jobs, 1)}</span> of wage-and-salary jobs. Add active-duty military, which payroll counts leave out, and government holds <span class="num">${F.int(govTotal)}</span> jobs, or <span class="num">${F.pct(govTotal / A.total)}</span> of all work in the state. The military alone accounts for <span class="num">${F.int(gov.military)}</span> of them, mostly around Anchorage and Fairbanks.</p>
        <p>The largest private sector is <strong>health care and social assistance</strong>, with <span class="num">${F.int(health.jobs)}</span> jobs. Oil is the opposite case. Oil and gas extraction employs only <span class="num">${F.int(oil.jobs)}</span> people, but the average job pays <span class="num">${F.money(oil.avg_pay)}</span>, and oil taxes and royalties fund much of state government.</p>
        <p>Other industries stand out for how concentrated they are. Seafood processing is <span class="num">${Math.round(sea.lq)}</span> times more common in Alaska than in the US as a whole. Scenic and sightseeing transport (flightseeing, glacier cruises, the railroad's tour trade) is <span class="num">${Math.round(scenic.lq)}</span> times more common. Hotels, restaurants and bars employ <span class="num">${F.int(acc.jobs + food.jobs)}</span>, and the leisure and hospitality sector pays the least of any sector, at <span class="num">${F.money(leis.avg_pay)}</span> a year on average.</p>
        <p>Many Alaskans work for themselves. Proprietors hold <span class="num">${F.int(A.proprietors)}</span> jobs, <span class="num">${F.pct(propShare)}</span> of the total, including fishermen, guides, contractors and lodge owners.</p>
      </div>`));

    // ---- stat tiles
    const tiles = [
      ["Population", F.int(H.population), "ACS 2020\u201324"],
      ["All jobs", F.int(A.total), `incl. self-employed & military, ${A.year}`],
      ["Wage & salary jobs", F.int(Q.jobs), `QCEW ${O.year}`],
      ["Average pay per wage job", F.money(Q.avg_pay), String(O.year)],
      ["Government share", F.pct(H.gov_share_jobs, 1), "of wage jobs, 2024"],
      ["Self-employed", F.pct(H.self_employed_share, 1), "of employed residents"],
      ["Permanent Fund Dividend", F.money(H.pfd.amount), `per person, ${H.pfd.year}`],
      ["Personal income per person", F.money(H.per_capita_income), String(H.per_capita_income_year)],
    ];
    const tg = document.createElement("div");
    tg.className = "tiles";
    tg.style.marginTop = "1.5rem";
    for (const [k, v, d] of tiles) {
      const t = document.createElement("div");
      t.className = "tile";
      t.innerHTML = `<span class="k"></span><span class="v"></span><span class="d"></span>`;
      t.children[0].textContent = k; t.children[1].textContent = v; t.children[2].textContent = d;
      tg.appendChild(t);
    }
    el.appendChild(tg);

    // ---- every job
    {
      const rows = A.sectors.map((s) => ({ label: BEA_LABEL[s.line] || s.label, value: s.jobs, kind: "Private" }));
      const govRows = [
        { label: "Local government", value: gov.local },
        { label: "Military", value: gov.military },
        { label: "State government", value: gov.state },
        { label: "Federal civilian", value: gov.federal_civilian },
      ].map((r) => ({ ...r, kind: "Government" }));
      rows.sort((a, b) => b.value - a.value);
      govRows.sort((a, b) => b.value - a.value);
      const all = [...govRows, ...rows].map((r) => ({
        ...r,
        color: r.kind === "Government" ? C.s[1] : C.s[0],
        tip: `<b>${AK.esc(r.label)}</b>` + AK.tip.row("Jobs, 2022", F.int(r.value)) + AK.tip.row("Share of all jobs", F.pct(r.value / A.total, 1)),
      }));
      const fig = AK.fig({
        id: "fig-every-job",
        title: `Every job in Alaska, ${A.year}`,
        sub: `${F.int(A.total)} full- and part-time jobs, including the self-employed and active-duty military. Government is shown first.`,
        note: "Source: BEA CAEMP25N, total employment by industry (place of work).",
      });
      el.appendChild(fig.root);
      AK.legend(fig.body, [{ label: "Government", color: C.s[1] }, { label: "Private industry", color: C.s[0] }]);
      const holder = document.createElement("div");
      holder.style.marginTop = ".5rem";
      fig.body.appendChild(holder);
      hbars(holder, all, { fmt: F.compact, label: "Jobs by industry, 2022" });
      AK.table(fig.body, [
        { key: "label", label: "Industry" },
        { key: "kind", label: "Type" },
        { key: "value", label: "Jobs", fmt: F.int },
        { key: "share", label: "Share", fmt: (v) => F.pct(v, 1) },
      ], all.map((r) => ({ ...r, share: r.value / A.total })));
    }

    // ---- location quotients
    {
      const items = [
        ...O.supersectors.filter((s) => s.code !== "1029").map((s) => ({ ...s, type: "Broad sector" })),
        ...O.spotlight.filter((s) => s.lq != null && s.code !== "23").map((s) => ({ ...s, type: "Specific industry" })),
      ].sort((a, b) => b.lq - a.lq);
      const fig = AK.fig({
        id: "fig-lq",
        title: "What Alaska does more of than the rest of the US",
        sub: "Location quotient: an industry's share of Alaska's private wage jobs divided by its share nationally. 1 = same as the US. Log scale.",
        note: `Source: BLS QCEW ${O.year}, private ownership.`,
      });
      el.appendChild(fig.root);
      AK.legend(fig.body, [{ label: "Broad sector", color: C.s[0], kind: "dot" }, { label: "Specific industry", color: C.s[2], kind: "dot" }]);
      const holder = document.createElement("div");
      holder.style.marginTop = ".5rem";
      fig.body.appendChild(holder);

      const width = Math.max(260, holder.clientWidth || 600);
      const narrow = width < 560;
      const rowH = narrow ? 34 : 22;
      const labelW = narrow ? 0 : Math.min(240, Math.round(width * 0.36));
      const fr = AK.frame(holder, { height: 26 + items.length * rowH + 22, margin: { t: 8, r: 46, b: 22, l: labelW }, label: "Location quotients" });
      const x = d3.scaleLog().domain([0.2, 150]).range([0, fr.w]);
      const ticks = narrow ? [0.25, 1, 5, 25, 100] : [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
      const ih = items.length * rowH;
      fr.g.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
        .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", ih);
      fr.g.append("g").attr("class", "tick").selectAll("text").data(ticks).join("text")
        .attr("x", x).attr("y", ih + 15).attr("text-anchor", "middle").text((d) => d + "\u00d7");
      fr.g.append("line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", -4).attr("y2", ih).attr("stroke", C.ink2).attr("stroke-width", 1.25);
      if (!narrow) fr.g.append("text").attr("x", x(1) + 4).attr("y", 4).attr("class", "axis-label").text("US average");
      items.forEach((it, i) => {
        const y0 = i * rowH;
        const cy = narrow ? y0 + 24 : y0 + rowH / 2;
        const row = fr.g.append("g");
        if (narrow) row.append("text").attr("x", 0).attr("y", y0 + 11).text(it.label).style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 4).attr("stroke-linejoin", "round");
        else row.append("text").attr("x", -8).attr("y", cy + 4).attr("text-anchor", "end").text(it.label);
        row.append("line").attr("x1", x(1)).attr("x2", x(it.lq)).attr("y1", cy).attr("y2", cy).attr("stroke", C.axis).attr("stroke-width", 2).attr("stroke-linecap", "round");
        row.append("circle").attr("cx", x(it.lq)).attr("cy", cy).attr("r", 5)
          .attr("fill", it.type === "Broad sector" ? C.s[0] : C.s[2]).attr("stroke", C.surface).attr("stroke-width", 2);
        row.append("text").attr("class", "lbl-val").attr("x", x(it.lq) + (it.lq >= 1 ? 9 : -9)).attr("y", cy + 3.5)
          .attr("text-anchor", it.lq >= 1 ? "start" : "end").text(it.lq >= 10 ? Math.round(it.lq) + "\u00d7" : it.lq.toFixed(1) + "\u00d7");
        row.append("rect").attr("x", -labelW).attr("y", y0).attr("width", fr.w + labelW + 46).attr("height", rowH).attr("fill", "transparent")
          .on("pointermove", (e) => AK.tip.show(e, `<b>${AK.esc(it.label)}</b>` + AK.tip.row("Location quotient", it.lq.toFixed(2) + "\u00d7") + AK.tip.row("Jobs, " + O.year, F.int(it.jobs)) + AK.tip.row("Average pay", F.money(it.avg_pay))))
          .on("pointerleave", () => AK.tip.hide());
      });
      AK.table(fig.body, [
        { key: "label", label: "Industry" },
        { key: "type", label: "Level" },
        { key: "lq", label: "Location quotient", fmt: (v) => v.toFixed(2) },
        { key: "jobs", label: "Jobs", fmt: F.int },
        { key: "avg_pay", label: "Avg pay", fmt: F.money },
      ], items);
    }

    // ---- what jobs pay
    {
      const OWN = { federal: "Federal government", state: "State government", local: "Local government" };
      const rows = [
        ...O.supersectors.filter((s) => s.code !== "1029").map((s) => ({ label: s.label, value: s.avg_pay, jobs: s.jobs, kind: "Private" })),
        ...Object.entries(OWN).map(([k, label]) => ({ label, value: Q.by_own[k].avg_pay, jobs: Q.by_own[k].jobs, kind: "Government" })),
      ].sort((a, b) => b.value - a.value).map((r) => ({
        ...r,
        color: r.kind === "Government" ? C.s[1] : C.s[0],
        tip: `<b>${AK.esc(r.label)}</b>` + AK.tip.row("Average annual pay", F.money(r.value)) + AK.tip.row("Jobs, " + O.year, F.int(r.jobs)),
      }));
      const fig = AK.fig({
        id: "fig-pay",
        title: "What jobs pay",
        sub: `Average annual pay per wage-and-salary job, ${O.year}. The line marks the all-jobs average of ${F.money(Q.avg_pay)}.`,
        note: "Source: BLS QCEW. Private sectors are broad supersectors; government is split by level.",
      });
      el.appendChild(fig.root);
      AK.legend(fig.body, [{ label: "Government", color: C.s[1] }, { label: "Private industry", color: C.s[0] }]);
      const holder = document.createElement("div");
      holder.style.marginTop = ".5rem";
      fig.body.appendChild(holder);
      hbars(holder, rows, { fmt: F.moneyC, ref: { value: Q.avg_pay, label: "All jobs " + F.moneyC(Q.avg_pay) }, label: "Average pay by sector" });
      AK.table(fig.body, [
        { key: "label", label: "Sector" },
        { key: "kind", label: "Type" },
        { key: "value", label: "Average pay", fmt: F.money },
        { key: "jobs", label: "Jobs", fmt: F.int },
      ], rows);
    }
  });
})();
