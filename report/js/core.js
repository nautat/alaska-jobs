/* core.js: shared data loading, tokens, formatting, tooltip, chart frame, maps.
 *
 * Section scripts register with:
 *   AK.section(name, render)   // name matches <div data-section="name">; "hero" renders into #hero-figure
 *   render(el, D)              // el = the container; D = AK.data (all JSON loaded)
 * render is called once data loads, then again when the container width or the color theme changes.
 * It must be idempotent: it rebuilds el's contents each time (keep control state in closure vars).
 *
 * AK.data = {overview, boroughs, seasonal, trends, uppersu, places, geo:{alaska, upper}}
 */
(function () {
  const AK = (window.AK = {});
  const sections = [];
  let D = null;

  // ---------- tokens ----------
  AK.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  AK.colors = () => {
    const c = (n) => AK.css(n);
    return {
      s: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => c(`--s${i}`)),
      ink: c("--ink"), ink2: c("--ink-2"), muted: c("--muted"), grid: c("--grid"), axis: c("--axis"),
      surface: c("--surface"), bg: c("--bg"), accent: c("--accent"), hl: c("--hl"), mid: c("--mid"),
      q: [100, 200, 300, 400, 500, 600, 700].map((s) => c(`--q${s}`)),
    };
  };
  AK.isDark = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  };
  /** Sequential (magnitude) scale, theme-aware: low values sit near the surface. */
  AK.seq = (domain) => {
    const q = AK.colors().q;
    return d3.scaleSequential(d3.interpolateRgbBasis(q.slice(0, 7))).domain(domain).clamp(true);
  };
  /** Diverging scale [min, mid, max]: red (negative) ← neutral → blue (positive). */
  AK.div = (domain) => {
    const C = AK.colors();
    const red = AK.isDark() ? ["#f08d8c", C.s[7]] : ["#a32b2a", C.s[7]];
    const blue = AK.isDark() ? [C.s[0], "#9ec5f4"] : [C.s[0], "#104281"];
    return d3.scaleDiverging(d3.interpolateRgbBasis([red[0], red[1], C.mid, blue[0], blue[1]])).domain(domain).clamp(true);
  };

  // ---------- formatting ----------
  const nf = new Intl.NumberFormat("en-US");
  AK.fmt = {
    int: (n) => (n == null ? "–" : nf.format(Math.round(n))),
    compact: (n) => (n == null ? "–" : d3.format(Math.abs(n) >= 1e4 ? ".3~s" : ",.0f")(n).replace("G", "B")),
    money: (n) => (n == null ? "–" : "$" + nf.format(Math.round(n))),
    moneyC: (n) => (n == null ? "–" : "$" + d3.format(".3~s")(n).replace("G", "B")),
    moneyK: (k) => (k == null ? "–" : "$" + d3.format(".3~s")(k * 1000).replace("G", "B")),
    pct: (x, d = 0) => (x == null ? "–" : (x * 100).toFixed(d) + "%"),
    pctMoe: (pm, d = 0) => (!pm || pm[0] == null ? "–" : (pm[0] * 100).toFixed(d) + "%" + (pm[1] != null ? " ±" + (pm[1] * 100).toFixed(d) : "")),
    signedPct: (x, d = 0) => (x == null ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%"),
    ratio: (x, d = 2) => (x == null ? "–" : x.toFixed(d) + "×"),
    month: (i) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
  };
  /** Escape untrusted-ish text for tooltip HTML. */
  AK.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- tooltip ----------
  const tipEl = () => document.getElementById("tip");
  AK.tip = {
    /** html: built only from data you control; escape names with AK.esc. */
    show(event, html) {
      const t = tipEl();
      t.innerHTML = html;
      t.hidden = false;
      const pad = 12, r = t.getBoundingClientRect();
      const x = event.clientX ?? (event.touches && event.touches[0].clientX) ?? 0;
      const y = event.clientY ?? (event.touches && event.touches[0].clientY) ?? 0;
      let left = x + pad, top = y + pad;
      if (left + r.width > innerWidth - 8) left = x - r.width - pad;
      if (top + r.height > innerHeight - 8) top = y - r.height - pad;
      t.style.left = Math.max(8, left) + "px";
      t.style.top = Math.max(8, top) + "px";
    },
    hide() { tipEl().hidden = true; },
    /** helper: one "label … value" row with optional swatch color */
    row: (label, value, color) =>
      `<div class="row"><span class="tk">${color ? `<i style="background:${color}"></i>` : ""}${label}</span><b>${value}</b></div>`,
  };
  addEventListener("scroll", () => AK.tip.hide(), { passive: true });

  // ---------- DOM helpers ----------
  /** Create element from HTML string (trusted template text only). */
  AK.html = (s) => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content; };
  /**
   * Figure card: returns {root, body, head}. Use el.appendChild(fig.root).
   * opts: {id, title, sub, note, controls(HTMLElement|null)}
   */
  AK.fig = (opts) => {
    const root = document.createElement("figure");
    root.className = "fig";
    if (opts.id) root.id = opts.id;
    root.innerHTML = `<div class="fig-head"><div><p class="fig-title"></p>${opts.sub ? '<p class="fig-sub"></p>' : ""}</div><div class="controls"></div></div><div class="fig-body"></div>${opts.note ? '<p class="fig-note"></p>' : ""}`;
    root.querySelector(".fig-title").textContent = opts.title || "";
    if (opts.sub) root.querySelector(".fig-sub").textContent = opts.sub;
    if (opts.note) root.querySelector(".fig-note").textContent = opts.note;
    return { root, body: root.querySelector(".fig-body"), head: root.querySelector(".controls") };
  };
  /**
   * Responsive SVG frame inside container. Width = container.clientWidth.
   * opts: {height, margin:{t,r,b,l}} → {svg, g, w, h, width, height}
   */
  AK.frame = (container, opts = {}) => {
    const m = Object.assign({ t: 10, r: 12, b: 24, l: 40 }, opts.margin || {});
    const width = Math.max(260, container.clientWidth || 600);
    const height = typeof opts.height === "function" ? opts.height(width) : opts.height || 280;
    const svg = d3.select(container).append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img");
    if (opts.label) svg.attr("aria-label", opts.label);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    return { svg, g, w: width - m.l - m.r, h: height - m.t - m.b, width, height, m };
  };
  /** Legend row. items: [{label, color, kind:'swatch'|'line'|'dot'}] */
  AK.legend = (container, items) => {
    const div = document.createElement("div");
    div.className = "legend";
    for (const it of items) {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.className = it.kind && it.kind !== "swatch" ? it.kind : "";
      i.style.background = it.color;
      s.appendChild(i);
      s.appendChild(document.createTextNode(it.label));
      div.appendChild(s);
    }
    container.appendChild(div);
    return div;
  };
  /** Gradient key for a sequential/diverging scale. */
  AK.rampKey = (container, scale, { lo, hi, n = 12 } = {}) => {
    const d = scale.domain(), a = d[0], b = d[d.length - 1];
    const stops = d3.range(n).map((i) => scale(a + ((b - a) * i) / (n - 1)));
    const div = document.createElement("div");
    div.className = "ramp";
    div.innerHTML = `<span></span><span class="bar"></span><span></span>`;
    div.children[0].textContent = lo ?? a;
    div.children[2].textContent = hi ?? b;
    div.children[1].style.background = `linear-gradient(90deg, ${stops.join(",")})`;
    container.appendChild(div);
    return div;
  };
  /**
   * Accessible table view. columns: [{key, label, fmt?}] rows: [{...}]
   */
  AK.table = (container, columns, rows, summary = "Show the numbers") => {
    const det = document.createElement("details");
    det.className = "tableview";
    const sm = document.createElement("summary");
    sm.textContent = summary;
    det.appendChild(sm);
    const wrap = document.createElement("div");
    wrap.className = "tv";
    const t = document.createElement("table");
    const thead = t.createTHead().insertRow();
    for (const c of columns) { const th = document.createElement("th"); th.textContent = c.label; thead.appendChild(th); }
    const tb = t.createTBody();
    for (const r of rows) {
      const tr = tb.insertRow();
      for (const c of columns) { const td = tr.insertCell(); const v = r[c.key]; td.textContent = c.fmt ? c.fmt(v, r) : v ?? "–"; }
    }
    wrap.appendChild(t);
    det.appendChild(wrap);
    container.appendChild(det);
    return det;
  };
  /** Segmented control. options: [{value,label}] → element; onChange(value) */
  AK.seg = (options, value, onChange, ariaLabel) => {
    const div = document.createElement("div");
    div.className = "seg";
    div.setAttribute("role", "group");
    if (ariaLabel) div.setAttribute("aria-label", ariaLabel);
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.label;
      b.setAttribute("aria-pressed", String(o.value === value));
      b.addEventListener("click", () => onChange(o.value));
      div.appendChild(b);
    }
    return div;
  };
  /** Select control with stable id. options: [{value,label,group?}] */
  AK.select = (id, options, value, onChange, labelText) => {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex"; wrap.style.gap = ".5rem"; wrap.style.alignItems = "center";
    if (labelText) { const l = document.createElement("label"); l.htmlFor = id; l.textContent = labelText; wrap.appendChild(l); }
    const s = document.createElement("select");
    s.id = id;
    const groups = new Map();
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value; opt.textContent = o.label; if (o.value === value) opt.selected = true;
      if (o.group) {
        if (!groups.has(o.group)) { const og = document.createElement("optgroup"); og.label = o.group; groups.set(o.group, og); s.appendChild(og); }
        groups.get(o.group).appendChild(opt);
      } else s.appendChild(opt);
    }
    s.addEventListener("change", () => onChange(s.value));
    wrap.appendChild(s);
    return wrap;
  };
  /** Bar path with 4px rounded data-end, square at baseline. Horizontal bars grow right from x0. */
  AK.hbarPath = (x0, y, w, h, r = 4) => {
    if (w <= 0) return "";
    r = Math.min(r, w, h / 2);
    return `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
  };
  /** Vertical column growing up from baseline yBase (yTop < yBase). */
  AK.vbarPath = (x, yTop, w, yBase, r = 4) => {
    const h = yBase - yTop;
    if (h <= 0) return "";
    r = Math.min(r, h, w / 2);
    return `M${x},${yBase}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBase}Z`;
  };

  // ---------- maps ----------
  let _bf = null, _upper = null;
  /** Rewind polygons that d3 would read as inverted (area > hemisphere): GeoJSON-style CCW rings. */
  const cleanFC = (fc) => {
    const fix = (rings) => (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings);
    for (const f of fc.features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(fix);
      else if (g.type === "Polygon") g.coordinates = fix(g.coordinates);
    }
    return fc;
  };
  /** GeoJSON FeatureCollection of the 30 boroughs (props: fips, name). */
  AK.boroughFeatures = () => (_bf ||= cleanFC(topojson.feature(D.geo.alaska, D.geo.alaska.objects.boroughs)));
  /** Upper Su layers: {cdps, matsu, roads, rail, rivers, water} as GeoJSON. Fit to bbox below. */
  AK.upperLayers = () => {
    if (_upper) return _upper;
    const t = D.geo.upper, o = {};
    for (const k of Object.keys(t.objects)) o[k] = cleanFC(topojson.feature(t, t.objects[k]));
    return (_upper = o);
  };
  AK.UPPER_BBOX = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-151.8, 61.45], [-151.8, 63.25], [-148.8, 63.25], [-148.8, 61.45], [-151.8, 61.45]]] } }; // clockwise for d3
  /** Alaska Albers-style projection fitted to w×h. */
  AK.alaskaProjection = (w, h, pad = 6) =>
    d3.geoConicEqualArea().parallels([55, 65]).rotate([154, 0]).center([0, 62])
      .fitExtent([[pad, pad], [w - pad, h - pad]], AK.boroughFeatures());
  /**
   * Draw the borough map into a d3 selection g.
   * opts: {w, h, fill(fips, props) → color, onHover(event, fips|null), onClick(event, fips), selected: fips|null,
   *        places: bool | kinds array (e.g. ['city','uppersu']), labelPlaces: bool}
   * Returns {projection, path, paths}
   */
  AK.drawAlaska = (g, opts) => {
    const C = AK.colors();
    const projection = AK.alaskaProjection(opts.w, opts.h);
    const path = d3.geoPath(projection);
    const fc = AK.boroughFeatures();
    const paths = g.append("g").selectAll("path").data(fc.features).join("path")
      .attr("d", path)
      .attr("fill", (d) => (opts.fill ? opts.fill(d.properties.fips, d.properties) : C.grid))
      .attr("stroke", C.surface).attr("stroke-width", 0.8).attr("stroke-linejoin", "round")
      .style("cursor", opts.onClick ? "pointer" : null);
    if (opts.onHover) {
      paths.on("pointermove", (e, d) => opts.onHover(e, d.properties.fips)).on("pointerleave", (e) => opts.onHover(e, null));
    }
    if (opts.onClick) paths.on("click", (e, d) => opts.onClick(e, d.properties.fips));
    if (opts.selected) {
      const f = fc.features.find((d) => d.properties.fips === opts.selected);
      if (f) g.append("path").attr("d", path(f)).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 1.6).attr("pointer-events", "none");
    }
    if (opts.places) {
      const kinds = Array.isArray(opts.places) ? opts.places : ["city"];
      const pts = D.places.filter((p) => kinds.includes(p.kind));
      const pg = g.append("g").attr("pointer-events", "none");
      for (const p of pts) {
        const [x, y] = projection([p.lon, p.lat]);
        const isT = p.name === "Talkeetna";
        pg.append("circle").attr("cx", x).attr("cy", y).attr("r", isT ? 4 : 2.5)
          .attr("fill", isT ? C.hl : C.ink).attr("stroke", C.surface).attr("stroke-width", 1.5);
        if (opts.labelPlaces) pg.append("text").attr("x", x + 5).attr("y", y + 3.5).text(p.name)
          .attr("class", isT ? "lbl-strong" : null).style("paint-order", "stroke").attr("stroke", C.surface).attr("stroke-width", 3);
      }
    }
    return { projection, path, paths };
  };

  // ---------- section registry & lifecycle ----------
  AK.section = (name, render) => sections.push({ name, render, lastW: -1 });
  const containerFor = (name) => (name === "hero" ? document.getElementById("hero-figure") : document.querySelector(`[data-section="${name}"]`));
  function renderOne(s, force) {
    const el = containerFor(s.name);
    if (!el) return;
    const w = el.clientWidth;
    if (!force && w === s.lastW) return;
    s.lastW = w;
    try {
      el.replaceChildren();
      s.render(el, D);
    } catch (err) {
      console.error(`[section ${s.name}]`, err);
      el.replaceChildren(AK.html(`<p class="loading">This section failed to draw.</p>`));
    }
  }
  const renderAll = (force) => sections.forEach((s) => renderOne(s, force));

  async function load() {
    const j = (p) => fetch(p, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(p + " " + r.status); return r.json(); });
    const [overview, boroughs, seasonal, trends, uppersu, places, alaska, upper] = await Promise.all([
      j("data/overview.json"), j("data/boroughs.json"), j("data/seasonal.json"), j("data/trends.json"),
      j("data/uppersu.json"), j("data/places.json"), j("geo/alaska.topo.json"), j("geo/upper_su.topo.json"),
    ]);
    return { overview, boroughs, seasonal, trends, uppersu, places, geo: { alaska, upper } };
  }

  AK.start = async () => {
    try {
      D = AK.data = await load();
    } catch (err) {
      console.error(err);
      document.querySelectorAll("[data-section] .loading").forEach((p) => (p.textContent = "The data didn't load. Reload the page to try again."));
      return;
    }
    renderAll(true);
    let to;
    const ro = new ResizeObserver(() => { clearTimeout(to); to = setTimeout(() => renderAll(false), 150); });
    sections.forEach((s) => { const el = containerFor(s.name); if (el) ro.observe(el); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderAll(true));
    new MutationObserver(() => renderAll(true)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // rail highlight
    const links = [...document.querySelectorAll(".rail a")];
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("section.sec").forEach((s) => io.observe(s));
  };
})();
