/* RoboMME-Plus blog: card renderer. Data comes from window.BLOG_DATA (data/bundle.js, built by build_data.py).
   Every figure is a card of the same size: title, optional tab rows, a two-panel body (chart | video), a short caption. */
(function () {
  "use strict";

  const DATA = window.BLOG_DATA || {};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const tooltip = document.getElementById("tooltip");
  const ENT = {
    simplememvla: { name: "SimpleMemVLA", color: "var(--series-1)", marker: "circle" },
    fsm: { name: "FrameSamp+Modul", color: "var(--series-3)", marker: "diamond" },
    astra: { name: "Embodied Astra", color: "var(--series-2)", marker: "square" },
    pp: { name: "PonderPounce", color: "var(--series-4)", marker: "triangle" },
  };
  const SUITES = [
    ["Counting", ["BinFill", "PickXtimes", "SwingXtimes", "StopCube"]],
    ["Permanence", ["VideoUnmask", "VideoUnmaskSwap", "ButtonUnmask", "ButtonUnmaskSwap"]],
    ["Reference", ["PickHighlight", "VideoRepick", "VideoPlaceButton", "VideoPlaceOrder"]],
    ["Imitation", ["MoveCube", "InsertPeg", "PatternLock", "RouteStick"]],
  ];

  /* ------------------------------------------------------------ helpers */
  // suite and task names get their own type style wherever they appear in running text and captions
  const NAME_RE = new RegExp(`\\b(${SUITES.flatMap(([s, ts]) => [s, ...ts]).join("|")})\\b`, "g");
  const NAME_TEST = new RegExp(NAME_RE.source);  // non-global: .test() must not carry lastIndex between nodes
  const SUITE_SET = new Set(SUITES.map(([s]) => s));
  const SKIP = "h1, h2, h3, h4, button, svg, a, cite, code, pre, .tab-row, .tooltip, ol.refs, #revision-notes, table.results, .task-name, .suite-name";
  function styleNames(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) && NAME_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment(); let last = 0;
      n.nodeValue.replace(NAME_RE, (m, name, i) => {
        frag.append(n.nodeValue.slice(last, i));
        const span = document.createElement("span");
        span.className = SUITE_SET.has(name) ? "suite-name" : "task-name";
        span.textContent = name; frag.append(span); last = i + m.length; return m;
      });
      frag.append(n.nodeValue.slice(last));
      n.replaceWith(frag);
    });
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children || [])) if (c !== null && c !== undefined && c !== false) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  function svg(tag, attrs, children) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) { if (k === "text") n.textContent = v; else n.setAttribute(k, v); }
    for (const c of [].concat(children || [])) if (c) n.appendChild(c);
    return n;
  }
  const pct = (r) => (r === null || r === undefined ? "–" : `${Math.round(r * 100)}%`);
  const pct1 = (r) => (r === null || r === undefined ? "–" : `${(r * 100).toFixed(1)}%`);
  const rateOf = (p) => (typeof p.rate === "number" ? p.rate : typeof p.success === "number" && p.n ? p.success / p.n : null);
  function boldText(md) {
    const out = el("span");
    String(md || "").split("**").forEach((part, k) => out.appendChild(k % 2 ? el("b", { text: part }) : document.createTextNode(part)));
    return out;
  }
  function showTip(evt, rows) {
    tooltip.replaceChildren(...rows);
    tooltip.classList.add("show");
    const r = tooltip.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
  }
  const hideTip = () => tooltip.classList.remove("show");
  function tabs(options, onPick, cur, cls) {
    const box = el("div", { class: cls || "tabs", role: "tablist" });
    const btns = options.map((o) => {
      const b = el("button", { type: "button", role: "tab", class: o.ood ? "ood" : null, "aria-selected": String(o.value === cur), text: o.label });
      b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-selected", "false")); b.setAttribute("aria-selected", "true"); onPick(o.value); });
      return b;
    });
    btns.forEach((b) => box.appendChild(b));
    return box;
  }

  const tabRow = (label, tabsEl) => el("div", { class: "tab-row" }, [label ? el("span", { class: "tab-label", text: label }) : null, tabsEl]);

  // every rollout video: hold the last frame for 2 s, then replay (shared with the rollout player)
  function holdThenReplay(v) {
    if (window.RolloutPlayer && RolloutPlayer.replayAfter) return RolloutPlayer.replayAfter(v, 2000);
    v.loop = true;
  }

  /* ------------------------------------------------------------ citations: numbered in reading order */
  const REFS = (DATA.references && DATA.references.refs) || {};
  const citeOrder = [];
  const endStop = (t) => (/[.?!]$/.test(t) ? "" : ".");  // no "?." after question titles
  const refText = (k) => (REFS[k] ? `${REFS[k].authors} ${REFS[k].title}${endStop(REFS[k].title)} ${REFS[k].venue}, ${REFS[k].year}.` : k);
  function citeNums(keys) {
    return keys.map((k) => { if (!citeOrder.includes(k)) citeOrder.push(k); return citeOrder.indexOf(k) + 1; }).sort((a, b) => a - b);
  }
  function fillCite(node, keys) {
    // "[3]", "[1, 4]" or "[7–25]" (runs of three or more collapse), each number linking to its reference
    const nums = citeNums(keys), runs = [];
    nums.forEach((n) => { const r = runs[runs.length - 1]; if (r && n === r[1] + 1) r[1] = n; else runs.push([n, n]); });
    const link = (n) => el("a", { href: `#ref-${n}`, title: refText(citeOrder[n - 1]), text: String(n) });
    node.replaceChildren("[");
    runs.forEach(([a, b], i) => {
      if (i) node.append(", ");
      if (b - a >= 2) node.append(link(a), "–", link(b));
      else for (let n = a; n <= b; n++) node.append(...(n > a ? [", "] : []), link(n));
    });
    node.append("]");
    return node;
  }
  const cite = (...keys) => fillCite(el("cite"), keys);

  /* ------------------------------------------------------------ video panel (one box, optional mini-tabs) */
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target; if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
  }), { threshold: 0.35 }) : null;
  function videoPanel(items, startIdx = 0, tabsHost = null, label = "Video") {
    // items: [{label, video, caption}]
    const panel = el("div", { class: "panel" });
    const box = el("div", { class: "vid-box" });
    const cap = el("div", { class: "vid-cap" });
    const show = (i) => {
      const it = items[i];
      box.querySelectorAll("video").forEach((v) => io && io.unobserve(v));
      const v = el("video", { src: it.video, muted: true, playsinline: true, preload: "metadata" });
      holdThenReplay(v);  // 2 s on the last frame, then replay
      v.muted = true;
      // clean frame by default; native controls only while hovering
      v.addEventListener("mouseenter", () => (v.controls = true));
      v.addEventListener("mouseleave", () => (v.controls = false));
      box.replaceChildren(v);
      if (io) io.observe(v); else v.play().catch(() => {});
      cap.textContent = it.caption || "";
      styleNames(cap);
    };
    panel.appendChild(box);
    if (items.length > 1) {
      const t = tabs(items.map((it, i) => ({ label: it.label, value: i })), show, startIdx, tabsHost ? "tabs" : "vid-tabs");
      if (tabsHost) tabsHost.appendChild(tabRow(label, t)); else panel.appendChild(t);
    }
    panel.appendChild(cap);
    show(startIdx);
    return panel;
  }

  /* ------------------------------------------------------------ rollout panel: the episodes of one selected bar or point */
  const STATUS = { success: ["✓ success", "ok"], fail: ["✗ fail", "bad"], timeout: ["✗ timeout", "bad"], declared_complete: ["✗ stopped early", "bad"],
    gripper_closed: ["✗ fail · gripper not reopened", "bad"] };
  function rolloutPanel(opts = {}) {
    // set({title, items: [{video, poster, caption, status, text: [[seconds, line], ...], crop, wide}], index, textLabel, noText})
    const panel = el("div", { class: "panel rollout" + (opts.text === false ? " no-text" : "") });
    const title = el("span", { class: "ro-title" });
    const chip = el("span", { class: "ro-chip" });
    const count = el("span", { class: "ro-count" });
    const prev = el("button", { type: "button", class: "ro-btn", "aria-label": "previous episode", text: "‹" });
    const next = el("button", { type: "button", class: "ro-btn", "aria-label": "next episode", text: "›" });
    const box = el("div", { class: "vid-box" });
    const sub = el("div", { class: "ro-text", "aria-live": "polite" });
    const cap = el("div", { class: "vid-cap" });
    panel.append(el("div", { class: "ro-head" }, [el("span", { class: "ro-left" }, [title, chip]), el("span", { class: "ro-nav" }, [prev, count, next])]), box);
    if (opts.text !== false) panel.appendChild(sub);
    panel.appendChild(cap);
    let state = { items: [] }, idx = 0;
    const line = (track, t) => { let cur = null; for (const e of track) { if (e[0] <= t + 0.05) cur = e; else break; } return cur; };
    const show = (i) => {
      const items = state.items;
      box.querySelectorAll("video").forEach((v) => io && io.unobserve(v));
      if (!items.length) {
        box.replaceChildren(el("div", { class: "ro-empty", text: state.empty || "No rollouts." }));
        count.textContent = ""; chip.textContent = ""; sub.replaceChildren(); cap.textContent = state.caption || "";
        prev.disabled = next.disabled = true;
        return;
      }
      idx = (i + items.length) % items.length;
      const it = items[idx];
      const v = el("video", { src: it.video, poster: it.poster, muted: true, playsinline: true, preload: "metadata", class: it.crop ? "crop-top" : null });
      holdThenReplay(v);  // 2 s on the last frame, then replay
      v.muted = true;
      v.addEventListener("mouseenter", () => (v.controls = true));
      v.addEventListener("mouseleave", () => (v.controls = false));
      box.classList.toggle("wide", !!it.wide);
      box.replaceChildren(v);
      if (io) io.observe(v); else v.play().catch(() => {});
      const [label, cls] = STATUS[it.status] || [it.status || "", ""];
      chip.textContent = label; chip.className = `ro-chip ${cls}`;
      count.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : "";
      prev.disabled = next.disabled = items.length < 2;
      cap.textContent = it.caption || ""; styleNames(cap);
      // what the model said, in sync with the clip (subtitle style; full line on hover)
      const track = it.text || [];
      const render = () => {
        if (!track.length) {
          sub.replaceChildren(el("span", { class: "ro-none", text: state.noText || "" }));
          return;
        }
        const cur = line(track, v.currentTime);
        sub.replaceChildren(el("span", { class: "ro-label", text: `${state.textLabel || "Model"}${cur ? ` · ${cur[0].toFixed(1)} s` : ""}` }),
          cur ? el("span", { class: "ro-line", text: cur[1], title: cur[1] }) : el("span", { class: "ro-line muted", text: "no output yet" }));
      };
      v.addEventListener("timeupdate", render);
      v.addEventListener("seeked", render);
      render();
    };
    prev.addEventListener("click", () => show(idx - 1));
    next.addEventListener("click", () => show(idx + 1));
    return {
      el: panel,
      set(cfg) { state = { ...cfg, items: cfg.items || [] }; title.textContent = cfg.title || ""; show(cfg.index || 0); },
    };
  }

  /* ------------------------------------------------------------ lazily loaded data (data/lazy/<name>.js sets window.BLOG_LAZY[name]) */
  const LAZY = {};
  function lazy(name) {
    if (window.BLOG_LAZY && window.BLOG_LAZY[name]) return Promise.resolve(window.BLOG_LAZY[name]);
    if (!LAZY[name]) LAZY[name] = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = `data/lazy/${name}.js?v=${(DATA.__lazy || {})[name] || ""}`;
      s.onload = () => resolve((window.BLOG_LAZY || {})[name] || {});
      s.onerror = () => resolve({});
      document.head.appendChild(s);
    });
    return LAZY[name];
  }

  /* ------------------------------------------------------------ card shell */
  function card(host, title, caption) {
    // tabs on top, chart | video in the middle, the figure caption (title + description) at the bottom
    host.replaceChildren();
    let tabsBox = host.previousElementSibling;
    if (!tabsBox || !tabsBox.classList.contains("card-tabs")) { tabsBox = el("div", { class: "card-tabs" }); host.before(tabsBox); }
    tabsBox.replaceChildren();
    const body = el("div", { class: "card-body" });
    const foot = el("div", { class: "card-foot" }, el("span", { class: "cap-title" }, title));
    host.append(body, foot);
    if (caption) foot.append(" ", ...[].concat(caption));
    styleNames(foot);
    return { tabsBox, body, foot };
  }
  const figTitle = (n, t) => [el("b", { text: `Figure ${n}. ` }), t];

  /* ------------------------------------------------------------ charts */
  function markerShape(kind, x, y, color) {
    const s = 4.5;
    if (kind === "square") return svg("rect", { class: "marker", x: x - s, y: y - s, width: 2 * s, height: 2 * s, rx: 1.5, fill: color });
    if (kind === "triangle") return svg("path", { class: "marker", d: `M${x} ${y - s - 1}L${x + s + 1} ${y + s}L${x - s - 1} ${y + s}Z`, fill: color });
    if (kind === "diamond") return svg("path", { class: "marker", d: `M${x} ${y - s - 1}L${x + s + 1} ${y}L${x} ${y + s + 1}L${x - s - 1} ${y}Z`, fill: color });
    return svg("circle", { class: "marker", cx: x, cy: y, r: s, fill: color });
  }
  function legend(series, onPick, selected) {
    return el("div", { class: "legend" + (onPick ? " pickable" : "") }, series.map((s) => {
      const e = ENT[s.entity];
      const icon = svg("svg", { width: 22, height: 12 }, [svg("line", { x1: 1, y1: 6, x2: 21, y2: 6, stroke: e.color, "stroke-width": 2 }), markerShape(e.marker, 11, 6, e.color)]);
      const cls = [s.placeholder ? "ph-legend" : null, selected === s.entity ? "sel" : null].filter(Boolean).join(" ") || null;
      return el(onPick ? "button" : "span", { class: cls, type: onPick ? "button" : null, onclick: onPick ? () => onPick(s.entity) : null },
        [icon, e.name + (s.placeholder ? " (placeholder †)" : "")]);
    }));
  }
  function lineChart(host, cfg) {
    // cfg: {xs:[{key,label,inTrain}], series:[{entity, placeholder, values:{key:{rate,n,success}}}], xTitle, yTitle, height}
    const wrap = el("div", { class: "chart" });
    if (cfg.noLegend) host.append(wrap); else host.append(legend(cfg.series, cfg.onLegend, cfg.selected && cfg.selected.entity), wrap);
    const draw = () => {
      wrap.replaceChildren();
      const W = Math.max(300, wrap.clientWidth || 480), H = fillHeight(wrap, cfg.height || 300);
      const al = cfg.align ? cfg.align(wrap) : null;  // {t, b}: plot area top/bottom matched to something beside the chart
      const m = { l: 50, r: 16, t: al ? al.t : 20, b: al ? Math.max(al.b, cfg.xTitle ? 42 : 26) : cfg.xTitle ? 42 : 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = cfg.xs.length, step = iw / Math.max(1, n);
      const xAt = (i) => m.l + step * (i + 0.5), yAt = (r) => m.t + ih * (1 - r);
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": cfg.aria || "line chart" });
      let i = 0;
      while (i < n) {
        if (!cfg.xs[i].inTrain) { i++; continue; }
        let j = i; while (j + 1 < n && cfg.xs[j + 1].inTrain) j++;
        root.appendChild(svg("rect", { class: "band", x: m.l + step * i, y: m.t, width: step * (j - i + 1), height: ih, rx: 4 }));
        root.appendChild(svg("text", { class: "band-label", x: m.l + step * (i + j + 1) / 2, y: m.t + ih - 10, "text-anchor": "middle", text: cfg.bandLabel || "training range" }));  // inside the band
        i = j + 1;
      }
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        root.appendChild(svg("line", { class: t === 0 ? "baseline" : "gridline", x1: m.l, x2: m.l + iw, y1: yAt(t), y2: yAt(t) }));
        root.appendChild(svg("text", { class: "tick", x: m.l - 7, y: yAt(t) + 4, "text-anchor": "end", text: `${t * 100}%` }));
      });
      cfg.xs.forEach((x, k) => root.appendChild(svg("text", { class: "tick", x: xAt(k), y: m.t + ih + 17, "text-anchor": "middle", text: x.label })));
      if (cfg.xTitle) root.appendChild(svg("text", { class: "axis-title", x: m.l + iw / 2, y: Math.min(H - 6, m.t + ih + 36), "text-anchor": "middle", text: cfg.xTitle }));  // just under the ticks
      const S = cfg.series.length, dodge = S > 1 ? Math.min(5, step / 9) : 0;
      cfg.series.forEach((s, si) => {
        const e = ENT[s.entity], dx = (si - (S - 1) / 2) * dodge;
        const pts = cfg.xs.map((x, k) => { const v = s.values[x.key]; const r = v ? rateOf(v) : null; return r === null ? null : [xAt(k) + dx, yAt(r)]; });
        let d = ""; pts.forEach((p, k) => { if (p) d += `${d && pts[k - 1] ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`; });
        const g = svg("g", { opacity: s.placeholder ? 0.45 : 1 });
        if (d) g.appendChild(svg("path", { class: "series-line", d, stroke: e.color }));
        pts.forEach((p) => { if (p) g.appendChild(markerShape(e.marker, p[0], p[1], e.color)); });
        root.appendChild(g);
      });
      if (cfg.selected) {  // ring around the clicked point
        const si = cfg.series.findIndex((s) => s.entity === cfg.selected.entity), k = cfg.xs.findIndex((x) => x.key === cfg.selected.key);
        const v = si >= 0 && k >= 0 ? cfg.series[si].values[cfg.xs[k].key] : null, r = v ? rateOf(v) : null;
        if (r !== null) root.appendChild(svg("circle", { class: "sel-ring", cx: xAt(k) + (si - (S - 1) / 2) * dodge, cy: yAt(r), r: 9, stroke: ENT[cfg.series[si].entity].color }));
      }
      const cross = svg("line", { class: "crosshair", y1: m.t, y2: m.t + ih, visibility: "hidden" });
      const hit = svg("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", class: cfg.onPick ? "pickable" : null });
      if (cfg.onPick) hit.addEventListener("click", (evt) => {
        // the series whose point at this x is nearest to the pointer
        const b = hit.getBoundingClientRect(), k = Math.max(0, Math.min(n - 1, Math.floor(((evt.clientX - b.left) / b.width) * n)));
        const py = m.t + ((evt.clientY - b.top) / b.height) * ih;
        let best = null;
        cfg.series.forEach((s) => { const v = s.values[cfg.xs[k].key], r = v ? rateOf(v) : null; if (r === null) return;
          const dist = Math.abs(yAt(r) - py); if (!best || dist < best.dist) best = { dist, entity: s.entity }; });
        if (best) cfg.onPick(best.entity, cfg.xs[k].key);
      });
      hit.addEventListener("pointermove", (evt) => {
        const b = hit.getBoundingClientRect(), k = Math.max(0, Math.min(n - 1, Math.floor(((evt.clientX - b.left) / b.width) * n)));
        cross.setAttribute("x1", xAt(k)); cross.setAttribute("x2", xAt(k)); cross.setAttribute("visibility", "visible");
        const xk = cfg.xs[k];
        showTip(evt, [  // one line per series: success rate, model, successes/episodes (no header line)
          ...cfg.series.map((s) => { const v = s.values[xk.key]; const sw = el("i"); sw.style.background = ENT[s.entity].color;
            return el("div", { class: "tt-row" }, [sw, el("b", { text: v ? pct(rateOf(v)) + (s.placeholder ? "†" : "") : "–" }), el("span", { text: `${ENT[s.entity].name}${v && v.n ? ` (${v.success}/${v.n})` : ""}` })]); })]);
      });
      hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
      root.append(cross, hit);
      wrap.appendChild(root);
    };
    responsive(wrap, draw);
    return { redraw: draw };
  }
  function barChart(host, rows, opts = {}) {
    // rows: [{label, rate, n, success, color, note, ph}] -> vertical columns with value labels on the cap
    const wrap = el("div", { class: "chart" });
    host.appendChild(wrap);
    const draw = () => {
      wrap.replaceChildren();
      const al = opts.align ? opts.align(wrap) : null;  // {t, b}: plot area matched to something beside the chart
      const W = Math.max(280, wrap.clientWidth || 440), H = fillHeight(wrap, opts.height || 280), m = { l: 48, r: 10, t: al ? Math.max(al.t, 4) : 22, b: al ? Math.max(al.b, 46) : 46 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = rows.length, slot = iw / n, bw = Math.min(46, slot * 0.5);
      const yAt = (r) => m.t + ih * (1 - r);
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "bar chart" });
      [0, 0.5, 1].forEach((t) => {
        root.appendChild(svg("line", { class: t === 0 ? "baseline" : "gridline", x1: m.l, x2: m.l + iw, y1: yAt(t), y2: yAt(t) }));
        root.appendChild(svg("text", { class: "tick", x: m.l - 7, y: yAt(t) + 4, "text-anchor": "end", text: `${t * 100}%` }));
      });
      rows.forEach((r, k) => {
        const cx = m.l + slot * (k + 0.5), y = yAt(r.rate), h = Math.max(1.5, m.t + ih - y);
        const rad = Math.min(4, h / 2);
        const path = `M${cx - bw / 2} ${m.t + ih}V${y + rad}Q${cx - bw / 2} ${y} ${cx - bw / 2 + rad} ${y}H${cx + bw / 2 - rad}Q${cx + bw / 2} ${y} ${cx + bw / 2} ${y + rad}V${m.t + ih}Z`;
        const bar = svg("path", { d: path, fill: r.reported ? `url(#hatch-${k})` : r.color || "var(--series-2)", opacity: r.ph ? 0.45 : 1,
          class: opts.onPick && !r.reported ? "pickable" : null, stroke: opts.selected === k ? "var(--ink)" : r.reported ? r.color : null,
          "stroke-width": opts.selected === k ? 2.2 : r.reported ? 1.2 : null });
        if (r.reported) root.appendChild(svg("defs", {}, svg("pattern", { id: `hatch-${k}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
          [svg("rect", { width: 6, height: 6, fill: "#fff" }), svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: r.color, "stroke-width": 2.4, opacity: 0.55 })])));
        bar.addEventListener("pointermove", (evt) => showTip(evt, [el("div", { class: "tt-head", text: r.label.replace(/\n/g, " ") }),
          el("div", { class: "tt-row" }, [el("b", { text: pct1(r.rate) }), el("span", { text: r.n ? `${r.success}/${r.n} episodes` : r.note || "" })]),
          ...(opts.onPick && !r.reported ? [el("div", { class: "tt-head", text: "click to see its rollouts" })] : [])]));
        bar.addEventListener("pointerleave", hideTip);
        if (opts.onPick && !r.reported) bar.addEventListener("click", () => opts.onPick(k));
        root.appendChild(bar);
        root.appendChild(svg("text", { class: "bar-value", x: cx, y: y - 6, "text-anchor": "middle", text: `${pct(r.rate)}${r.ph ? "†" : ""}` }));
        // labels wider than their column break at a space or camel-case boundary ("SimpleMem / VLA", "Ponder / Pounce")
        const fit = (line) => {
          if (line.length * 7.6 <= slot - 4) return [line];
          const cuts = [...line.matchAll(/ |(?<=[a-z])(?=[A-Z])|(?=\+)/g)].map((x) => x.index);
          if (!cuts.length) return [line];
          const at = cuts.reduce((a, b) => (Math.abs(b - line.length / 2) < Math.abs(a - line.length / 2) ? b : a));
          return [line.slice(0, at).trim(), line.slice(at).trim()];
        };
        String(r.label).split("\n").flatMap(fit).forEach((line, li) => root.appendChild(svg("text", { class: "bar-label", x: cx, y: m.t + ih + 17 + li * 15, "text-anchor": "middle", text: line })));
      });
      wrap.appendChild(root);
    };
    responsive(wrap, draw);
    return { redraw: draw };
  }
  function groupedBars(host, cfg) {
    // cfg: {groups:[{key,label}], series:[{key,label,color}], value:(g,s)->{rate,n,success}|null, selected:{g,s}, onPick(g,s), xTitle}
    const keyItems = cfg.keyItems || (cfg.series.length > 1 ? cfg.series : []);  // [{label, color}]
    if (keyItems.length && (!cfg.align || cfg.keyTop)) host.appendChild(el("div", { class: "legend" }, keyItems.map((s) => el("span", {}, [
      svg("svg", { width: 12, height: 12 }, [svg("rect", { x: 0, y: 0, width: 12, height: 12, rx: 2.5, fill: s.color })]), s.label]))));
    const colorOf = cfg.colorOf || ((g, s) => s.color);
    const wrap = el("div", { class: "chart" });
    host.appendChild(wrap);
    const draw = () => {
      wrap.replaceChildren();
      const al = cfg.align ? cfg.align(wrap) : null;  // {t, b}: plot area matched to the video beside the chart
      const W = Math.max(280, wrap.clientWidth || 440), H = fillHeight(wrap, cfg.height || 280),
        m = { l: 48, r: 8, t: al ? Math.max(al.t, 18) : 22, b: al ? Math.max(al.b, cfg.xTitle ? 44 : 28) : cfg.xTitle ? 44 : 28 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, G = cfg.groups.length, S = cfg.series.length, slot = iw / G;
      const bw = Math.min(30, (slot * 0.78) / S), yAt = (r) => m.t + ih * (1 - r);
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": cfg.aria || "grouped bar chart" });
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        root.appendChild(svg("line", { class: t === 0 ? "baseline" : "gridline", x1: m.l, x2: m.l + iw, y1: yAt(t), y2: yAt(t) }));
        root.appendChild(svg("text", { class: "tick", x: m.l - 7, y: yAt(t) + 4, "text-anchor": "end", text: `${t * 100}%` }));
      });
      const hasSel = cfg.selected && cfg.selected.g !== undefined;
      cfg.groups.forEach((g, gi) => {
        const cx0 = m.l + slot * (gi + 0.5);
        root.appendChild(svg("text", { class: "tick", x: cx0, y: m.t + ih + 17, "text-anchor": "middle", text: g.label }));
        cfg.series.forEach((s, si) => {
          const v = cfg.value(g.key, s.key);
          if (!v || v.rate === null || v.rate === undefined) return;
          const cx = cx0 + (si - (S - 1) / 2) * (bw + 3), y = yAt(v.rate), h = Math.max(1.5, m.t + ih - y), rad = Math.min(3, h / 2);
          const sel = hasSel && cfg.selected.g === g.key && cfg.selected.s === s.key;
          const d = `M${cx - bw / 2} ${m.t + ih}V${y + rad}Q${cx - bw / 2} ${y} ${cx - bw / 2 + rad} ${y}H${cx + bw / 2 - rad}Q${cx + bw / 2} ${y} ${cx + bw / 2} ${y + rad}V${m.t + ih}Z`;
          const bar = svg("path", { d, fill: colorOf(g, s), class: cfg.onPick ? "pickable" : null,
            stroke: sel ? "var(--ink)" : null, "stroke-width": sel ? 2.2 : null });
          bar.addEventListener("pointermove", (evt) => showTip(evt, [el("div", { class: "tt-head", text: `${g.label} · ${s.label}` }),
            el("div", { class: "tt-row" }, [el("b", { text: pct(v.rate) }), el("span", { text: v.n ? `${v.success}/${v.n} episodes` : "" })]),
            ...(cfg.onPick ? [el("div", { class: "tt-head", text: "click to see its rollouts" })] : [])]));
          bar.addEventListener("pointerleave", hideTip);
          if (cfg.onPick) bar.addEventListener("click", () => cfg.onPick(g.key, s.key));
          root.appendChild(bar);
          if (bw >= 14) root.appendChild(svg("text", { class: "bar-value small" + (sel ? " sel" : ""), x: cx, y: y - 5, "text-anchor": "middle", text: v.n ? `${v.success}` : "" }));
        });
      });
      const ty = Math.min(H - 6, m.t + ih + 38);  // just under the ticks
      const inlineKey = cfg.align && !cfg.keyTop && cfg.series.length > 1;  // "■ Static  ■ Continuous motion · identical cubes", laid out once measured
      if (inlineKey) {
        const g = svg("g", { class: "inline-key" });
        cfg.series.forEach((s) => g.append(svg("rect", { y: ty - 10, width: 11, height: 11, rx: 2.5, fill: s.color }), svg("text", { class: "axis-title", y: ty, text: s.label })));
        if (cfg.xTitle) g.appendChild(svg("text", { class: "axis-title", y: ty, text: `· ${cfg.xTitle}` }));
        root.appendChild(g);
      } else if (cfg.xTitle) root.appendChild(svg("text", { class: "axis-title", x: m.l + iw / 2, y: ty, "text-anchor": "middle", text: cfg.xTitle }));
      wrap.appendChild(root);
      const key = root.querySelector(".inline-key");
      if (key) {
        let x = 0;
        [...key.children].forEach((n) => { if (n.tagName === "rect") { n.setAttribute("x", x); x += 16; } else { n.setAttribute("x", x); x += n.getComputedTextLength() + 14; } });
        key.setAttribute("transform", `translate(${Math.max(0, (W - x + 14) / 2)}, 0)`);
      }
    };
    responsive(wrap, draw);
    return { redraw: draw };
  }
  function responsive(wrap, draw) {
    draw();
    if (!window.ResizeObserver) return;
    let w = wrap.clientWidth, h = wrap.clientHeight;
    new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - w) > 4 || Math.abs(wrap.clientHeight - h) > 4) { w = wrap.clientWidth; h = wrap.clientHeight; draw(); } }).observe(wrap);
  }
  const fillHeight = (wrap, fallback) => (wrap.clientHeight > 140 ? wrap.clientHeight : fallback);
  const statRow = (items) => el("div", { class: "stats" }, items.map(([v, l]) => el("div", { class: "stat" }, [el("div", { class: "v", text: v }), el("div", { class: "l", text: l })])));

  /* ------------------------------------------------------------ results data */
  let normalized;
  function results() {
    if (normalized !== undefined) return normalized;
    const R = DATA.results;
    if (!R || !Array.isArray(R.methods)) return (normalized = null);
    const meta = {};
    R.methods.forEach((m) => {
      const tasks = {};
      Object.entries((m.ood && m.ood.tasks) || {}).forEach(([t, rec]) => { tasks[t] = { rate: rec.rate, n: rec.n, success: rec.success, regular: m.regular && m.regular.tasks ? m.regular.tasks[t] : null }; });
      meta[m.id] = { label: m.label, rate: m.ood ? m.ood.rate : null, regular: m.regular ? m.regular.overall : null, tasks };
    });
    return (normalized = meta);
  }

  /* ------------------------------------------------------------ Figure 1: leaderboard timeline */
  function cardTimeline(host) {
    // A mountain instead of axes: each method sits at the height of its RoboMME overall success (summit = 100%),
    // left to right in order of release; labels are placed greedily so none overlap.
    const d = DATA.leaderboard_timeline;
    const papers = d ? d.points.filter((p) => p.source === "paper") : [];
    const board = d ? [...new Set(d.points.filter((p) => p.source === "leaderboard" && p.ref).map((p) => p.ref))] : [];
    const c = card(host, figTitle(1, "Progress on RoboMME to date "), [cite(...board, ...papers.map((p) => p.ref)),
      ". Height shows overall success; darker dots mark more recent work."]);
    c.body.classList.add("single");
    if (!d) return;
    // dot darkness = when the method first came out (sequential ramp, light = earliest)
    const binOf = (ds) => (ds < "2026-01" ? "0-pre" : ds < "2026-08" ? "1-early" : ds.slice(0, 7));
    const bins = [...new Set(d.points.map((p) => binOf(p.released)))].sort();
    const RAMP = ["--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];
    // steps bunch toward the light end so the busy recent months (Sep, Oct) get the most contrast
    const shade = (b) => `var(${RAMP[bins.length > 1 ? Math.round(Math.pow(bins.indexOf(b) / (bins.length - 1), 1.3) * (RAMP.length - 1)) : RAMP.length - 1]})`;
    const mon = (ym) => new Date(`${ym}-01`).toLocaleString("en", { month: "short", timeZone: "UTC" });
    const binLabel = (b) => {
      if (b === "0-pre") return "before 2026";
      if (b === "1-early") {
        const ms = d.points.map((p) => p.released.slice(0, 7)).filter((m) => binOf(m + "-01") === b).sort();
        return `${mon(ms[0])}–${mon(ms[ms.length - 1])} 2026`;
      }
      return `${mon(b)} ${b.slice(0, 4)}`;  // every month with its year: Aug 2026, Sep 2026, Oct 2026
    };
    const R = 5.5, LOGO = 13, GAP = 3;
    const logosOf = (p) => p.logos || (p.logo ? [p.logo] : []);
    const dot = (fill, x, y) => [
      svg("circle", { cx: x, cy: y, r: R + 1.6, fill: "rgba(30, 40, 60, 0.28)" }),  // thin outline: light dots stay visible on snow
      svg("circle", { cx: x, cy: y, r: R, fill, stroke: "#fff", "stroke-width": 1.6 }),
    ];
    const panel = el("div", { class: "panel" });
    c.body.appendChild(panel);
    panel.appendChild(el("div", { class: "legend" }, bins.map((b) => el("span", {}, [svg("svg", { width: 15, height: 15 }, dot(shade(b), 7.5, 7.5)), binLabel(b)]))));
    const wrap = el("div", { class: "chart" });
    panel.appendChild(wrap);
    const byDate = d.points.map((p, i) => ({ ...p, i })).sort((a, b) => a.released.localeCompare(b.released) || a.rate - b.rate);
    byDate.forEach((p, k) => (p.order = byDate.length > 1 ? k / (byDate.length - 1) : 0.5));
    // the three lowest methods sit in the middle of the mountain's foot (by date, left to right) rather than at its edge
    [...byDate].sort((a, b) => a.rate - b.rate).slice(0, 3).sort((a, b) => a.released.localeCompare(b.released))
      .forEach((p, k) => (p.order = 0.36 + 0.14 * k));
    // LogLook and Embodied Astra sit in the middle, under the summit, as a pair centred on it (LogLook left, Astra right)
    const MIDDLE = { LogLook: -1, "Embodied Astra": 1 };
    const tip = (p) => (evt) => {
      const r = REFS[p.paper];
      // method and its overall RoboMME success first, then the paper (or project page)
      const v = Math.round(p.rate * 10000) / 100, rate = Number.isInteger(Math.round(v * 100) / 10) ? v.toFixed(1) : v.toFixed(2);  // 97.0, 79.13
      const head = el("div", { class: "tt-rate" }, [el("b", { text: p.name }), ` · ${rate}% overall success`]);
      showTip(evt, r ? [head, el("div", { class: "tt-title", text: r.title }), el("div", { class: "tt-head", text: r.url.replace(/^https:\/\//, "") })]
        : [head, el("div", { class: "tt-title", text: "No paper yet" }), el("div", { class: "tt-head", text: (p.page || p.site).replace(/^https:\/\//, "") })]);
    };
    const draw = () => {
      wrap.replaceChildren();
      const W = Math.max(300, wrap.clientWidth || 860), narrow = W < 600, H = narrow ? 640 : fillHeight(wrap, 360);
      const cx = W / 2, top = 34, base = H - 6, spread = W * (narrow ? 0.7 : 0.56);
      const yAt = (r) => base - r * (base - top);
      const hw = (h) => spread * Math.pow(Math.max(0, 1 - h), 0.8);  // half-width of the main peak at height h
      const hAt = (y) => (base - y) / (base - top);
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "RoboMME methods placed on a mountain by overall success" });
      const defs = svg("defs", {}, [
        svg("linearGradient", { id: "mtn-fill", x1: 0, y1: 0, x2: 0, y2: 1 }, [
          svg("stop", { offset: "0", "stop-color": "#ffffff" }), svg("stop", { offset: "0.22", "stop-color": "#eef2f8" }),
          svg("stop", { offset: "0.62", "stop-color": "#c7d2e2" }), svg("stop", { offset: "1", "stop-color": "#a4b4ca" })]),
        svg("linearGradient", { id: "mtn-back", x1: 0, y1: 0, x2: 0, y2: 1 }, [
          svg("stop", { offset: "0", "stop-color": "#f4f6fa" }), svg("stop", { offset: "1", "stop-color": "#d5dde9" })]),
      ]);
      root.appendChild(defs);
      defs.appendChild(svg("clipPath", { id: "mtn-clip" }, [svg("rect", { x: 0, y: 0, width: W, height: H, rx: 8 })]));
      // deterministic ragged outline
      const jag = (h, ph) => 0.035 * Math.sin(h * 41 + ph) + 0.025 * Math.sin(h * 97 + 2 * ph) + 0.015 * Math.sin(h * 211 + ph);
      const outline = (x0, peakH, w, ph, steps = 60) => {
        const pts = [];
        for (let k = 0; k <= steps; k++) { const h = (k / steps) * peakH; pts.push([x0 - w * Math.pow(1 - h / peakH, 0.8) * (1 + jag(h, ph)), yAt(h)]); }
        for (let k = steps - 1; k >= 0; k--) { const h = (k / steps) * peakH; pts.push([x0 + w * Math.pow(1 - h / peakH, 0.8) * (1 + jag(h, ph + 1.7)), yAt(h)]); }
        return "M" + pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L") + "Z";
      };
      defs.appendChild(svg("linearGradient", { id: "mtn-sky", x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg("stop", { offset: "0", "stop-color": "#e9f0fa" }), svg("stop", { offset: "0.75", "stop-color": "#ffffff" })]));
      defs.appendChild(svg("linearGradient", { id: "mtn-mist", x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": 0 }), svg("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": 0.85 })]));
      const scene = svg("g", { "clip-path": "url(#mtn-clip)" });
      root.appendChild(scene);
      const add = root.appendChild.bind(root);
      root.appendChild = (n) => scene.appendChild(n);  // scenery goes into the clipped group
      root.appendChild(svg("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#mtn-sky)" }));
      root.appendChild(svg("path", { d: outline(cx - W * 0.12, 0.42, W * 0.24, 3.3), fill: "#e6ebf3" }));
      root.appendChild(svg("path", { d: outline(cx - W * 0.3, 0.6, W * 0.32, 0.4), fill: "url(#mtn-back)" }));
      root.appendChild(svg("path", { d: outline(cx + W * 0.31, 0.68, W * 0.3, 2.1), fill: "url(#mtn-back)" }));
      root.appendChild(svg("path", { d: outline(cx, 1, spread, 0), fill: "url(#mtn-fill)" }));
      // shaded east face and a ridge line from the summit
      const face = [[cx, top]];
      for (let k = 1; k <= 40; k++) { const h = 1 - k / 40; face.push([cx + hw(h) * (1 + jag(h, 1.7)), yAt(h)]); }
      face.push([cx + spread * 0.12, base]);
      for (let k = 39; k >= 1; k--) { const h = 1 - k / 40; face.push([cx + hw(h) * 0.18 + 6 * Math.sin(h * 53), yAt(h)]); }
      root.appendChild(svg("path", { d: "M" + face.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L") + "Z", fill: "rgba(58, 78, 112, 0.13)" }));
      // snow cap with a ragged lower edge
      const cap = [];
      for (let k = 0; k <= 24; k++) { const h = 0.72 + (k / 24) * 0.28; cap.push([cx - hw(h) * (1 + jag(h, 0)), yAt(h)]); }
      for (let k = 23; k >= 0; k--) { const h = 0.72 + (k / 24) * 0.28; cap.push([cx + hw(h) * (1 + jag(h, 1.7)), yAt(h)]); }
      const xl = cx - hw(0.72), xr = cx + hw(0.72);
      for (let k = 1; k < 14; k++) { const x = xr - ((xr - xl) * k) / 14; cap.push([x, yAt(0.72 + (k % 2 ? -0.07 : 0.015) + 0.02 * Math.sin(k * 2.3))]); }
      root.appendChild(svg("path", { d: "M" + cap.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L") + "Z", fill: "#ffffff", opacity: 0.88 }));
      // ridge lines: snow-lit spurs from the summit, rock streaks lower down
      const spur = (h0, h1, dir, bend, color, wdt) => {
        const q = [];
        for (let k = 0; k <= 16; k++) { const h = h0 - ((h0 - h1) * k) / 16; q.push([cx + dir * hw(h) * (0.25 + bend * (k / 16)) + 3 * Math.sin(h * 70), yAt(h)]); }
        root.appendChild(svg("path", { d: "M" + q.map((z) => `${z[0].toFixed(1)} ${z[1].toFixed(1)}`).join("L"), fill: "none", stroke: color, "stroke-width": wdt, "stroke-linejoin": "round" }));
      };
      spur(0.98, 0.45, -1, 0.35, "rgba(255,255,255,0.75)", 1.4);
      spur(0.96, 0.3, 1, 0.1, "rgba(255,255,255,0.6)", 1.2);
      spur(0.62, 0.08, -1, 0.55, "rgba(58,78,112,0.16)", 1.2);
      spur(0.55, 0.05, 1, 0.5, "rgba(58,78,112,0.14)", 1.2);
      spur(0.4, 0.02, -1, 0.85, "rgba(58,78,112,0.12)", 1);
      root.appendChild(svg("rect", { x: 0, y: base - 40, width: W, height: 46, fill: "url(#mtn-mist)" }));
      // summit flag
      root.appendChild(svg("line", { x1: cx, x2: cx, y1: top, y2: top - 24, stroke: "#4a4f57", "stroke-width": 1.4 }));
      root.appendChild(svg("path", { d: `M${cx} ${top - 24}L${cx + 15} ${top - 19.5}L${cx} ${top - 15}Z`, fill: "#e0412f" }));
      root.appendChild = add;
      // human performance contour
      const yH = yAt(d.human.rate);
      root.appendChild(svg("line", { x1: 8, x2: W - 8, y1: yH, y2: yH, stroke: "#6b7280", "stroke-width": 1, "stroke-dasharray": "4 4" }));
      const humanLabel = svg("text", { class: "end-label", x: W - 10, y: yH - 6, "text-anchor": "end", text: `Human ${(d.human.rate * 100).toFixed(1)}%` });
      root.appendChild(humanLabel);
      wrap.appendChild(root);  // attached so labels can be measured
      // ---- greedy placement, most constrained (highest) first
      const boxes = [];
      const hb = humanLabel.getBBox(); boxes.push({ x: hb.x - 2, y: hb.y - 1, w: hb.width + 4, h: hb.height + 2 });
      boxes.push({ x: cx - 3, y: top - 26, w: 22, h: 28 });  // flag
      const hit = (b) => boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
      const measure = svg("text", { class: "mtn-label", x: 0, y: -50 });
      root.appendChild(measure);
      const layer = svg("g");
      root.appendChild(layer);
      const PAD = narrow ? 3 : 7;  // spacing between methods (px)
      const placed = [...byDate].sort((a, b) => b.rate - a.rate).map((p) => {
        const st = { r: R };
        measure.textContent = p.name;
        const logoW = logosOf(p).length * (LOGO + 1) - 1;
        const tw = logoW + GAP + measure.getComputedTextLength(), th = 14;  // label = logo(s) + name
        const best = { cost: Infinity }, half = (4 + tw) / 2;  // labels sit right of their dots: aim the middle of dot + label
        // dot x: the left item ends, the right one starts, PAD past the centre line
        // (phones: no room for the pair beside the human label, so each item is centred on its own)
        const mid = !(p.name in MIDDLE) ? null : narrow ? cx - (4 + tw) / 2 : MIDDLE[p.name] < 0 ? cx - PAD - 4 - tw : cx + PAD + st.r;
        for (const dy of [0, -3, 3, -6, 6, -9, 9, -12, 12]) {  // the dot may move a little up or down to find room
          const y = yAt(p.rate) + dy, lim = hw(hAt(y)) * (narrow ? 0.97 : 0.9) - st.r;
          if (lim <= 0 && dy) continue;
          const target = mid ?? cx + (p.order - 0.5) * 2 * Math.max(0, lim) * 0.95 - half;  // the item's centre, not its dot
          for (let x = cx - Math.max(0, lim); x <= cx + Math.max(0, lim) + 0.01; x += 3) {
            const mk = { x: x - st.r - 1.5, y: y - st.r - 1.5, w: 2 * st.r + 3, h: 2 * st.r + 3 };
            if (hit(mk)) continue;
            for (const side of [1]) for (const ly of [0]) {  // label always right of the dot, on its line: "● logo Name"
              const lx = x + st.r + 4;
              const lb = { x: lx - 1, y: y + ly - th / 2 - 1, w: tw + 2, h: th + 2 };
              if (lb.x < 2 || lb.x + lb.w > W - 2 || hit(lb)) continue;
              const cost = Math.abs(x - target) + Math.abs(dy) * 6 + Math.abs(ly) * 3 + (side < 0 ? 2 : 0);
              if (cost < best.cost) Object.assign(best, { cost, x, y, side, lx, ly, mk, lb });
            }
          }
          if (best.cost < Infinity) break;
        }
        if (best.cost === Infinity) {  // nothing on the slope: any free spot across the figure, a little further up or down
          for (const dy of narrow ? [0, -4, 4, -8, 8, -12, 12, -16, 16, -20, 20, -26, 26, -32, 32, -40, 40] : [0, -4, 4, -8, 8, -12, 12, -16, 16, -20, 20]) {
            const y = yAt(p.rate) + dy, target = mid ?? cx + (p.order - 0.5) * W * 0.6 - half;
            for (let x = st.r + 6; x + st.r + 4 + tw <= W - 4; x += 3) {
              const mk = { x: x - st.r - 1.5, y: y - st.r - 1.5, w: 2 * st.r + 3, h: 2 * st.r + 3 }, lx = x + st.r + 4;
              const lb = { x: lx - 1, y: y - th / 2 - 1, w: tw + 2, h: th + 2 };
              if (hit(mk) || hit(lb)) continue;
              const cost = Math.abs(x - target) + Math.abs(dy) * 6;
              if (cost < best.cost) Object.assign(best, { cost, x, y, side: 1, lx, ly: 0, mk, lb });
            }
            if (best.cost < Infinity) break;
          }
        }
        if (best.cost === Infinity) {  // no room for a label: keep the marker at the nearest free spot (tooltip still names it)
          for (const dy of [0, -3, 3, -6, 6, -9, 9]) {
            const y = yAt(p.rate) + dy, lim = Math.max(0, hw(hAt(y)) * 0.97 - st.r), target = cx + (p.order - 0.5) * 2 * lim;
            for (let x = cx - lim; x <= cx + lim + 0.01; x += 2) {
              const mk = { x: x - st.r - 1.5, y: y - st.r - 1.5, w: 2 * st.r + 3, h: 2 * st.r + 3 }, cost = Math.abs(x - target) + Math.abs(dy) * 6;
              if (!hit(mk) && cost < best.cost) Object.assign(best, { cost, x, y, side: 0, mk });
            }
            if (best.cost < Infinity) break;
          }
          if (best.cost === Infinity) { const y = yAt(p.rate), x = cx; Object.assign(best, { x, y, side: 0, mk: { x: x - st.r, y: y - st.r, w: 2 * st.r, h: 2 * st.r } }); }
        }
        // keep a margin around every placed dot and label so neighbouring methods stay apart
        const pad = (b) => ({ x: b.x - PAD, y: b.y - PAD / 2, w: b.w + 2 * PAD, h: b.h + PAD });
        boxes.push(pad(best.mk)); if (best.lb) boxes.push(pad(best.lb));
        return { p, st, ...best };
      });
      measure.remove();
      placed.forEach(({ p, x, y, side, lx, ly = 0 }) => {
        // the whole item links to the project website
        const g = svg("a", { class: "mtn-item", href: p.site, target: "_blank", rel: "noopener" }, dot(shade(binOf(p.released)), x, y));
        if (side) {
          const ls = logosOf(p);
          ls.forEach((k, i) => g.append(svg("image", { href: `logos/${k}.png`, x: lx + i * (LOGO + 1), y: y + ly - LOGO / 2, width: LOGO, height: LOGO, preserveAspectRatio: "xMidYMid meet" })));
          g.append(svg("text", { class: "mtn-label", x: lx + ls.length * (LOGO + 1) - 1 + GAP, y: y + ly + 4, text: p.name }));
        }
        g.addEventListener("pointermove", tip(p));
        g.addEventListener("pointerleave", hideTip);
        layer.appendChild(g);
      });
      wrap.dataset.unlabeled = placed.filter((q) => !q.side).map((q) => q.p.name).join(",");
    };
    responsive(wrap, draw);
  }

  /* ------------------------------------------------------------ Figure 2: fine-tuned policies beyond the training range */
  // a sweep setup in short, as on the axis: PickXtimes "N=6", PickHighlight "2/4" (highlighted / total cubes), VideoUnmaskSwap "S=5"
  const setupAbbr = (task, label) => String(label);
  const SWEEP = {
    PickXtimes: { smv: "e1_simplememvla_pickxtimes", astra: "e5_astra_pickxtimes", axis: null, xTitle: "N: pick-and-place repetitions",
      start: { setting: "n6", seed: 9100000 },
      video: { smv: "media/e1/n6/s9100000.mp4", astra: "media/e5/pickxtimes/n6/s9100000.mp4", setting: "N = 6",
        smvCap: "N = 6: SimpleMemVLA presses the button after five cycles.", astraCap: "N = 6, same seed: Embodied Astra completes all six cycles." },
      caption: "Training covers N = 1–5 (shaded). SimpleMemVLA: 40/40 episodes up to N = 5, 0/40 beyond; its predicted subtask never goes past “for the fifth time”. 10 seeds per setting; click a point to see its rollouts." },
    // the 1/3 ... 6/12 ladder (E15) is merged into Figure 2b's data (e9_sweeps_all), so both figures read it from there
    PickHighlight: { e9: true, axis: null, xTitle: "highlighted / total cubes",
      start: { setting: "ph_half_p5t10", seed: 9200300 },
      video: { smv: "media/e2b/ph_half_p5t10/s9200300.mp4", setting: "5/10",
        smvCap: "5 of 10 highlighted: SimpleMemVLA picks four, re-picks finished cubes and times out." },
      // counts beyond the training range come from the data (pts: {simplememvla, astra} points of this task)
      caption: (pts) => { const out = (arr) => arr.filter((p) => !p.in_distribution && p.n).reduce((a, p) => [a[0] + p.success, a[1] + p.n], [0, 0]);
        const [ks, ns] = out(pts.simplememvla);
        return `Training covers 1/3, 2/4 and 3/6, RoboMME's three configurations (shaded); beyond them half of the cubes are highlighted (4/8, 5/10, 6/12). SimpleMemVLA solves ${ks}/${ns} episodes beyond the range and rarely names more than “the third highlighted cube”. 10 seeds per setting; click a point to see its rollouts.`; } },
    VideoUnmaskSwap: { smv: "e3_simplememvla_videounmaskswap", astra: "e5_astra_videounmaskswap", axis: "swaps", xTitle: "S: number of swaps (four containers, one pick)",
      start: { setting: "swaps_s5", seed: 9300100 },
      video: { smv: "media/e3/swaps_s4/s9300100.mp4", astra: "media/e5/videounmaskswap/swaps_s4/s9300100.mp4", setting: "4 swaps",
        smvCap: "Four swaps: SimpleMemVLA lifts the container where the cube was first revealed.", astraCap: "Same seed: Embodied Astra follows the swaps and lifts the right container." },
      caption: "Training covers 1–3 swaps (shaded). With 4–6 swaps SimpleMemVLA fails all 21 episodes in which the target container actually moved. 10 seeds per setting; click a point to see its rollouts." },
  };
  // plot area: top level with the video's top edge, baseline (0%) level with the video's time track
  const alignToPlayer = (right) => (wrap) => {
    const vb = right.querySelector(".rp-video"); if (!vb) return null;
    const w = wrap.getBoundingClientRect(), v = vb.getBoundingClientRect();
    if (v.top >= w.bottom - 1 || v.height < 100) return null;  // stacked (phone): no alignment
    const seg = right.querySelector(".rp-timeline .seg"), tr = seg ? seg.getBoundingClientRect() : null;
    const base = tr ? tr.top + tr.height / 2 : v.bottom;
    return { t: Math.max(4, v.top - w.top), b: Math.max(0, w.bottom - base) };
  };

  // in- vs out-of-distribution totals over the three sweeps of Figures 2 / 2b (VideoUnmaskSwap: the swaps sweep only)
  function sweepTotals() {
    const D = DATA.e9_sweeps_all, out = { setups: {}, id: 0, ood: 0, by: {}, task: {} };
    if (!D) return out;
    Object.entries(D.tasks).forEach(([task, T]) => {
      const axis = (E9_AXES[task] || [])[0];
      const sett = Object.fromEntries(T.settings.filter((st) => !axis || st.axis === axis[0]).map((st) => [st.setting_id, st]));
      out.setups[task] = Object.keys(sett).length;
      Object.entries(T.series).forEach(([m, pts]) => pts.forEach((pt) => {
        const st = sett[pt.setting_id];
        if (!st || !pt.n) return;
        const b = (out.by[m] = out.by[m] || { id: [0, 0], ood: [0, 0] }), k = st.in_distribution ? "id" : "ood";
        b[k][0] += pt.success; b[k][1] += pt.n;
        const tk = ((out.task[task] = out.task[task] || {})[m] = (out.task[task] || {})[m] || { id: [0, 0], ood: [0, 0] });
        tk[k][0] += pt.success; tk[k][1] += pt.n;
      }));
    });
    const any = Object.values(out.by)[0];
    if (any) { out.id = any.id[1]; out.ood = any.ood[1]; }
    return out;
  }

  // Figure 2: SimpleMemVLA beyond the training range, the three sweeps stacked (one row per task) beside one rollout player.
  // Clicking a point in any row plays that task's rollouts; « » walks the points of that row.
  const F2_TASKS = ["PickXtimes", "PickHighlight", "VideoUnmaskSwap"];
  const F2_ROW = { PickXtimes: "N: pick-and-place repetitions", PickHighlight: "highlighted / total cubes", VideoUnmaskSwap: "S: number of swaps" };
  function smvSweep(task) {
    const S = SWEEP[task];
    const e9 = (((DATA.e9_sweeps_all || { tasks: {} }).tasks[task] || { series: {} }).series.simplememvla) || [];
    const src = S.e9 ? { points: e9 } : DATA[S.smv];
    const pts = src && src.points ? src.points.filter((p) => !S.axis || p.axis === S.axis) : [];
    const key = (p) => String(p.setting_id || p.label);
    return { pts, key, xs: pts.map((p) => ({ key: key(p), label: setupAbbr(task, p.label), inTrain: !!p.in_distribution })) };
  }
  function cardSweepsStack(host) {
    let cur = "PickXtimes", sel = SWEEP[cur].start.setting, keep = null;  // keep: Rollout i to reopen after « »
    const draw = () => {
      const tot = sweepTotals(), all = tot.by.simplememvla, t = (k) => (tot.task[k] || {}).simplememvla;
      const ms = F2_TASKS.filter(t).map((k) => `${t(k).id[0]}/${t(k).id[1]} → ${t(k).ood[0]}/${t(k).ood[1]} on ${k}`);
      const per = ms.length > 1 ? `${ms.slice(0, -1).join(", ")}, and ${ms[ms.length - 1]}` : ms.join("");
      const c = card(host, figTitle(2, "SimpleMemVLA’s performance drops sharply beyond training ranges."),
        all ? `Rows show PickXtimes (${tot.setups.PickXtimes} setups), PickHighlight (${tot.setups.PickHighlight}), and VideoUnmaskSwap ` +
          `(${tot.setups.VideoUnmaskSwap}), with 10 episodes per setup. Success drops from ${all.id[0]}/${all.id[1]} in-distribution episodes ` +
          `(shaded) to ${all.ood[0]}/${all.ood[1]} out-of-distribution episodes: ${per}. Click a point to view its rollouts.` : "Click a point to view its rollouts.");
      if (window.RolloutPlayer) { c.tabsBox.classList.add("has-speed"); c.tabsBox.appendChild(RolloutPlayer.speedSelect()); }
      host.classList.add("rp-fit");
      const left = el("div", { class: "panel f2-stack" }), right = el("div", { class: "panel" });
      c.body.append(left, right);
      F2_TASKS.forEach((task, ti) => {
        const { pts, key, xs } = smvSweep(task);
        const holder = el("div", { class: "f2-chart" });
        left.append(el("div", { class: "f2-row-title" }, [el("span", { class: "task-name", text: task }), ` · ${F2_ROW[task]}`]), holder);
        lineChart(holder, { xs, height: 132, noLegend: true, bandLabel: ti ? " " : "training range",
          series: [{ entity: "simplememvla", values: Object.fromEntries(pts.map((p) => [key(p), p])) }],
          selected: task === cur ? { entity: "simplememvla", key: sel } : null, onPick: (_, k) => { cur = task; sel = k; draw(); } });
      });
      lazy("fig2_rollouts").then((d) => {
        const eps = ((d || {})[cur] || {})[sel] || [];
        if (!eps.length || !window.RolloutPlayer) { right.textContent = "No rollouts."; return; }
        const S = SWEEP[cur], xs = smvSweep(cur).xs;
        const start = keep != null ? Math.min(keep, eps.length - 1)  // « »: stay on the same Rollout i
          : sel === S.start.setting ? Math.max(0, eps.findIndex((e) => e.seed === S.start.seed)) : 0;
        keep = null;
        const ki = xs.findIndex((x) => x.key === sel);
        // plenty of height beside the three charts: the task goal sits in a bar above the video, always shown
        RolloutPlayer.mount(right, eps, { band: "card", goal: "bar", start, prefix: `${cur} · ${(xs[ki] || {}).label || ""}`,
          settings: { prev: ki > 0, next: ki >= 0 && ki < xs.length - 1, go: (dd, i) => { sel = xs[ki + dd].key; keep = i; draw(); } } });
      });
    };
    draw();
  }

  /* ------------------------------------------------------------ Figure 2b: the same sweeps for four models, any point -> its rollouts */
  const E9_ENTITY = { simplememvla: "simplememvla", "framesamp-modul": "fsm", ponderpounce: "pp", "embodied-astra": "astra" };
  const E9_METHOD = Object.fromEntries(Object.entries(E9_ENTITY).map(([m, e]) => [e, m]));
  const E9_TEXT = { simplememvla: "Predicted subtask", ponderpounce: "Ponder subgoal", "embodied-astra": "Thought" };
  const E9_AXES = { VideoUnmaskSwap: [["swaps", "swaps"]] };  // only the swaps sweep (the picks / containers sweeps are not shown)
  const E9_XTITLE = { swaps: "S: number of swaps (four containers, one pick)", picks: "number of picks (four containers, two swaps)",
    bins: "number of containers (two swaps, one pick)" };
  function cardSweepsAll(host) {
    const D = DATA.e9_sweeps_all;
    let task = "PickXtimes", axis = null, sel = null, keep = null;
    const draw = () => {
      const T = D && D.tasks[task];
      const axes = E9_AXES[task];
      if (axes && !axis) axis = axes[0][0];
      const settings = T ? T.settings.filter((s) => !axes || s.axis === axis) : [];
      const outside = settings.filter((s) => !s.in_distribution).map((s) => s.setting_id);
      const tally = (m) => { let k = 0, n = 0; (T.series[m] || []).forEach((p) => { if (outside.includes(p.setting_id) && p.n) { k += p.success; n += p.n; } }); return [k, n]; };
      const foot = T ? ["Beyond the training range: ", ...D.method_order.flatMap((m, i) => { const [k, n] = tally(m);
        return [i ? ", " : "", `${D.methods[m]} ${n ? `${k}/${n}` : "running"}`]; }), ". Click any point to watch its ten rollouts (‹ › switches seed); the text under the video is what the model said at that moment."] : "";
      const tot = sweepTotals();
      const rate = (b) => `${Math.round((100 * b[0]) / b[1])}%`;
      const ms = D.method_order.filter((m) => tot.by[m]).map((m) => `${rate(tot.by[m].id)} / ${rate(tot.by[m].ood)} for ${D.methods[m]}`);
      const per = ms.length > 1 ? `${ms.slice(0, -1).join(", ")}, and ${ms[ms.length - 1]}` : ms.join("");
      const c = card(host, figTitle("2b", "Model performance as task parameters exceed training ranges."),
        `We evaluate ${tot.setups.PickXtimes} PickXtimes setups, ${tot.setups.PickHighlight} PickHighlight setups, and ${tot.setups.VideoUnmaskSwap} ` +
        `VideoUnmaskSwap setups, with 10 episodes per setup: ${tot.id} in-distribution (shaded) and ${tot.ood} out-of-distribution episodes. ` +
        `In- / out-of-distribution success rates are ${per}.`);
      // Model on top, then Task with the subgoal / speed controls on its line, then Axis (VideoUnmaskSwap)
      const taskRow = tabRow("Task", tabs(Object.keys(SWEEP).map((k) => ({ label: k, value: k })), (v) => { task = v; axis = null; sel = null; draw(); }, task));
      c.tabsBox.appendChild(taskRow);
      if (axes && axes.length > 1) c.tabsBox.appendChild(tabRow("Axis", tabs(axes.map(([v, l]) => ({ label: l, value: v })), (v) => { axis = v; sel = null; draw(); }, axis)));
      if (!T) return;
      if (window.RolloutPlayer) {
        c.tabsBox.classList.add("has-speed", "speed-inline"); taskRow.classList.add("with-speed");
        taskRow.appendChild(RolloutPlayer.speedSelect()); host.classList.add("rp-fit");
      }
      const key = (s) => s.setting_id;
      const modelRow = () => {  // the four models as buttons with their line colour: picks the model (and is the legend)
        const box = el("div", { class: "tabs" });
        D.method_order.forEach((m) => {
          const b = el("button", { type: "button", "aria-selected": String(sel && sel.method === m) });
          const sw = el("i", { class: "swatch" }); sw.style.background = ENT[E9_ENTITY[m]].color;
          b.append(sw, D.methods[m]);
          b.addEventListener("click", () => { sel = { method: m, key: sel.key }; draw(); });
          box.appendChild(b);
        });
        return tabRow("Model", box);
      };
      if (!sel || !settings.some((s) => key(s) === sel.key)) sel = { method: "ponderpounce", key: (settings.find((s) => !s.in_distribution) || settings[0]).setting_id };
      // a link elsewhere in the text can open this figure on a given task / model / point (see setupShowLinks)
      host.showPoint = (t, m, k) => { task = t; axis = null; sel = { method: m, key: k }; draw(); };
      const left = el("div", { class: "panel" }), right = el("div", { class: "panel" });
      c.body.append(left, right);
      c.tabsBox.prepend(modelRow());
      let lc = null;
      const pickRollouts = () => {
        // the shared player (style 3) with clean clips; « » steps through the settings for the same model
        lazy(`fig2b_${task}`).then((rd) => {
          const eps = (((rd || {})[sel.method]) || {})[sel.key] || [];
          if (!eps.length || !window.RolloutPlayer) { right.textContent = "No rollouts."; return; }
          const ki = settings.findIndex((s) => key(s) === sel.key);
          const st = settings.find((s) => key(s) === sel.key);
          const start = keep != null ? Math.min(keep, eps.length - 1) : 0;  // « »: stay on the same Rollout i
          keep = null;
          RolloutPlayer.mount(right, eps, { band: "card", goal: "corner", start, prefix: `${D.methods[sel.method]} · ${st ? setupAbbr(task, st.label) : ""}`,
            settings: { prev: ki > 0, next: ki >= 0 && ki < settings.length - 1, go: (dd, i) => { sel = { method: sel.method, key: key(settings[ki + dd]) }; keep = i; chart(); pickRollouts(); } } });
          requestAnimationFrame(() => lc && lc.redraw());
        });
      };
      const chart = () => {
        left.replaceChildren();
        const xs = settings.map((s) => ({ key: key(s), label: setupAbbr(task, s.label), inTrain: s.in_distribution }));
        const vals = (m) => Object.fromEntries((T.series[m] || []).filter((p) => p.n).map((p) => [p.setting_id, p]));
        lc = lineChart(left, { xs, xTitle: axes ? E9_XTITLE[axis] : SWEEP[task].xTitle, height: 320, align: alignToPlayer(right), noLegend: true,
          series: D.method_order.map((m) => ({ entity: E9_ENTITY[m], values: vals(m) })),
          selected: { entity: E9_ENTITY[sel.method], key: sel.key },
          onPick: (entity, k) => { sel = { method: E9_METHOD[entity], key: k }; chart(); pickRollouts(); },
          onLegend: (entity) => { sel = { method: E9_METHOD[entity], key: sel.key }; chart(); pickRollouts(); } });
      };
      chart();
      pickRollouts();
    };
    draw();
  }

  /* ------------------------------------------------------------ Figure 3: StopCube (click a bar -> that method on three shared episodes) */
  const E10_COLOR = { simplememvla: "var(--series-1)", ponderpounce: "var(--series-4)", t2mem: "var(--series-7)", "embodied-astra": "var(--series-2)" };
  const E10_TEXT = { simplememvla: "Predicted subtask", ponderpounce: "Ponder subgoal", "embodied-astra": "Thought" };
  const E10_CAT = { accidental_press_while_hovering: "presses by accident while hovering", right_pass_early: "presses on the right pass, but too early",
    right_pass_late: "presses on the right pass, but too late" };
  function cardStopCube(host) {
    // Figure 3: StopCube success on RoboMME. Click a bar -> that method's three rollouts in the shared player (style 3).
    const d = DATA.e10_stopcube;
    const c = card(host, figTitle(3, "Model success rates on StopCube."),
      "Click a bar or a model button to switch models.");
    if (!d) return;
    if (window.RolloutPlayer) { c.tabsBox.classList.add("has-speed"); c.tabsBox.appendChild(RolloutPlayer.speedSelect()); }
    host.classList.add("rp-fit");
    const left = el("div", { class: "panel" }), right = el("div", { class: "panel" });
    c.body.append(left, right);
    const bars = d.bars, order = bars.map((b, k) => k).filter((k) => (d.rollouts || {})[bars[k].id]);  // T²Mem: reported only
    let sel = Math.max(0, bars.findIndex((b) => b.id === "embodied-astra")), keep = null;
    // models as buttons above the figure (like Figure 2b); the bar colour is the swatch
    const models = el("div", { class: "tabs" });
    c.tabsBox.insertBefore(tabRow("Model", models), c.tabsBox.querySelector(".rp-speed"));
    const show = () => {
      models.replaceChildren(...order.map((k) => {
        const b = el("button", { type: "button", "aria-selected": String(k === sel) });
        const sw = el("i", { class: "swatch" }); sw.style.background = E10_COLOR[bars[k].id];
        b.append(sw, bars[k].label);
        b.addEventListener("click", () => { sel = k; show(); });
        return b;
      }));
      left.replaceChildren();
      const chart = barChart(left, bars.map((b) => ({ label: b.label + (b.reported_only ? "\n(reported)" : ""), rate: b.rate, color: E10_COLOR[b.id],
        reported: !!b.reported_only, note: b.reported_only ? "reported; no public rollouts" : "" })), { height: 270, selected: sel,
        align: alignToPlayer(right), onPick: (k) => { if (order.includes(k)) { sel = k; show(); } } });
      lazy("fig3_rollouts").then((rd) => {
        const eps = ((rd || {})[bars[sel].id]) || [];
        if (!eps.length || !window.RolloutPlayer) { right.textContent = "No rollouts."; return; }
        const oi = order.indexOf(sel);
        const start = keep != null ? Math.min(keep, eps.length - 1) : 0;  // « »: stay on the same Rollout i (same episode)
        keep = null;
        RolloutPlayer.mount(right, eps, { band: "card", goal: "corner", start, prefix: bars[sel].label, goalIntro: { mount: "same" },
          settings: { prev: oi > 0, next: oi >= 0 && oi < order.length - 1, go: (dd, i) => { sel = order[oi + dd]; keep = i; show(); } } });
        requestAnimationFrame(() => chart.redraw());  // re-align the bars once the video box exists
      });
    };
    show();
  }

  /* ------------------------------------------------------------ Figures 4-6: one sweep per figure, click a bar -> its ten rollouts */
  function sweepCard(host, d, opts) {
    const c = card(host, figTitle(opts.fig, opts.title), opts.caption(d));
    if (!d) return;
    if (opts.player && window.RolloutPlayer) return sweepCardPlayer(c, host, d, opts);
    const left = el("div", { class: "panel" }), rp = rolloutPanel({ text: true });
    c.body.append(left, rp.el);
    const colors = opts.colors || ["var(--astra-static)", "var(--astra-moving)"];
    const series = d.series.map((s, i) => ({ ...s, color: colors[i % colors.length] }));
    let sel = opts.start(d);
    const show = () => {
      left.replaceChildren();
      groupedBars(left, { groups: d.groups, series, value: (g, s) => d.cells[`${g}|${s}`], selected: sel, xTitle: opts.xTitle || d.x_label, height: 300,
        onPick: (g, s) => { sel = { g, s }; show(); } });
      const cell = d.cells[`${sel.g}|${sel.s}`] || { episodes: [] };
      const gl = d.groups.find((g) => g.key === sel.g), sl = series.find((s) => s.key === sel.s);
      lazy(`${d.experiment}_text`).then((tx) => rp.set({
        title: `${opts.groupName(gl)}${series.length > 1 ? ` · ${sl.label.toLowerCase()}` : ""}`, textLabel: "Thought", noText: "",
        empty: "Still running.",
        items: cell.episodes.map((e) => ({ video: e.video, poster: e.poster, status: e.status, wide: !!e.wide,
          text: tx[`${opts.spec(sel.g, sel.s)}|${e.episode}`] || [], caption: opts.epCaption(e, cell) })),
      }));
    };
    show();
  }
  function sweepCardPlayer(c, host, d, opts) {
    // click a bar -> its ten rollouts in the shared player (style 3); « » walks the bars group by group
    // opts.view "pip" (front | wrist clips, Figure 6): front view + wrist inset and a "Wrist camera" checkbox, as Figure 9
    c.tabsBox.classList.add("has-speed"); c.tabsBox.appendChild(RolloutPlayer.speedSelect(opts.view ? { wrist: true } : undefined));
    host.classList.add("rp-fit");
    const left = el("div", { class: "panel" }), right = el("div", { class: "panel" });
    c.body.append(left, right);
    const colors = opts.colors || ["var(--astra-static)", "var(--astra-moving)"];
    const series = d.series.map((s, i) => ({ ...s, color: colors[i % colors.length] }));
    const order = d.groups.flatMap((g) => series.map((s) => ({ g: g.key, s: s.key })));
    let sel = opts.start(d), keep = null;
    const show = () => {
      left.replaceChildren();
      const groups = d.groups.map((g) => ({ ...g, label: opts.tick ? opts.tick(g) : g.label }));  // e.g. "N=5" under each group
      const chart = groupedBars(left, { groups, series, value: (g, s) => d.cells[`${g}|${s}`], selected: sel, xTitle: opts.xTitle || d.x_label,
        height: 300, align: alignToPlayer(right), keyTop: true, colorOf: opts.colorOf, keyItems: opts.keyItems, onPick: (g, s) => { sel = { g, s }; show(); } });
      // key + plot span exactly the video's height: both columns start at the top (key level with the video's top edge),
      // and the plot's 0% line meets the video's bottom edge
      left.style.justifyContent = right.style.justifyContent = "flex-start";
      left.style.paddingTop = right.style.paddingTop = "12px";  // both columns down by the same amount: centred, still aligned
      lazy(opts.player).then((rd) => {
        const eps = (((rd || {})[d.experiment]) || {})[`${sel.g}|${sel.s}`] || [];
        if (!eps.length) { right.textContent = "No rollouts."; return; }
        const oi = order.findIndex((o) => o.g === sel.g && o.s === sel.s);
        const gObj = d.groups.find((g) => g.key === sel.g);
        const start = keep != null ? Math.min(keep, eps.length - 1) : 0;  // « »: stay on the same Rollout i (same seed)
        keep = null;
        RolloutPlayer.mount(right, eps, { band: "card", goal: "corner", start, prefix: opts.setup ? opts.setup(gObj, sel.s) : null, goalIntro: opts.goalIntro,
          view: opts.view, goalBold: opts.goalBold, endHold: opts.endHold, demoRate: opts.demoRate, settings: { prev: oi > 0, next: oi >= 0 && oi < order.length - 1, go: (dd, i) => { sel = order[oi + dd]; keep = i; show(); } } });
        requestAnimationFrame(() => chart.redraw());  // re-align the bars once the video box exists
      });
    };
    show();
  }
  const epNote = (e, cell) => `Seed ${cell.episodes.indexOf(e) + 1} of ${cell.episodes.length}${e.note && e.status !== "success" ? `: ${e.note}` : ""}.`;
  const sumCells = (d, s, f) => d.groups.reduce((a, g) => { const v = d.cells[`${g.key}|${s}`]; return v && f(g) ? [a[0] + v.success, a[1] + v.n] : a; }, [0, 0]);

  function cardRepick(host) {
    sweepCard(host, DATA.e11_repick_counts, {
      fig: 4, title: "Embodied Astra’s performance on VideoRepick with discrete swaps (original) versus continuous motion (new).", caption: () => "Click a bar to see its rollouts.",
      start: () => ({ g: 3, s: "on" }), groupName: (g) => `${g.label} cubes`, xTitle: "N: identical cubes", goalIntro: { mount: "same", sample: "same" },
      tick: (g) => `N=${g.label}`, setup: (g, s) => `N=${g.label} · ${s === "on" ? "New" : "Original"}`,
      spec: (g, s) => `repick:${s}:${g}`, epCaption: epNote, player: "fig45_rollouts",
    });
  }

  function cardPlaceOrder(host) {
    sweepCard(host, DATA.e12_placeorder_targets, {
      fig: 5, title: "Embodied Astra’s performance on VideoPlaceOrder with at most one ring swap at the end of the demonstration (original) versus continuous swaps throughout it (new).", caption: () => "Click a bar to see its rollouts.",
      start: () => ({ g: 4, s: "on" }), groupName: (g) => `${g.label} rings`, xTitle: "N: target rings", goalIntro: { mount: "same" },
      tick: (g) => `N=${g.label}`, setup: (g, s) => `N=${g.label} · ${s === "on" ? "New" : "Original"}`,
      spec: (g, s) => `placeorder:${s}:${g}`, epCaption: epNote, player: "fig45_rollouts",
    });
  }

  function cardInsertPeg(host) {
    const big = (g) => g.key === 34;  // RoboMME's original hole
    sweepCard(host, DATA.e13_insertpeg_holes, {
      fig: 8, title: "Embodied Astra on InsertPeg as the hole narrows down (peg is 20 mm).", caption: () => "Click a bar to see its rollouts.",
      colors: ["var(--astra-moving)"], colorOf: (g) => (big(g) ? "var(--astra-static)" : "var(--astra-moving)"),
      keyItems: [{ label: "Original (34 mm hole)", color: "var(--astra-static)" }, { label: "New (smaller holes)", color: "var(--astra-moving)" }],
      start: (d) => ({ g: d.groups[d.groups.length - 1].key, s: "astra" }),
      groupName: (g) => `${g.label} hole (${g.clearance_mm} mm per side)`, xTitle: "hole width",
      setup: (g) => `${g.label} hole · ${g.key === 34 ? "Original" : "New"}`, goalIntro: "first",
      spec: (g) => `insertpeg:${g}`, epCaption: epNote, player: "fig45_rollouts",
    });
  }

  /* ------------------------------------------------------------ Figure 7: MoveCube */
  function cardMoveCube(host) {
    // Figure 7: two players side by side. Left: RoboMME pushes where a stroke fails and Astra resumes (pause + "Astra retries and
    // replans"); right: the RoboMME-Plus rolling ball, two attempts (pause where the scene resets). Totals under each video.
    const c = card(host, figTitle(7, "Embodied Astra on MoveCube: pushing allows continuous correction; rolling a ball allows only two attempts."));
    if (window.RolloutPlayer) { c.tabsBox.classList.add("has-speed"); c.tabsBox.appendChild(RolloutPlayer.speedSelect()); }
    host.classList.add("rp-fit");
    const sides = [["push", "Original (push / hook)", "succeed"], ["ball", "New (ball rolling)", "succeed"]];
    const cols = sides.map(([key, title]) => {
      const col = el("div", { class: "panel mc-side" }), mount = el("div", { class: "mc-player" }), stat = el("div", { class: "mc-stat" });
      col.append(el("div", { class: "mc-title", text: title }), mount, stat);
      c.body.appendChild(col);
      return { key, mount, stat };
    });
    lazy("fig7_rollouts").then((rd) => {
      cols.forEach(({ key, mount, stat }, k) => {
        const eps = (rd || {})[key] || [], sm = ((rd || {}).summary || {})[key];
        if (!eps.length || !window.RolloutPlayer) { mount.textContent = "No rollouts."; return; }
        RolloutPlayer.mount(mount, eps, { band: "card", goal: "corner", prefix: "Embodied Astra", goalIntro: "first" });
        if (sm) stat.replaceChildren(el("b", { text: `${sm.success}/${sm.n}` }), ` ${sides[k][2]}`);
      });
    });
  }

  /* ------------------------------------------------------------ Figure 8: design per task */
  function cardDesign(host) {
    // Figure 8: RoboMME vs RoboMME-Plus oracle rollouts side by side (front view + wrist inset, task goal above each video);
    // ‹ Sample i (easy / medium / hard) › under each video picks its difficulty (medium first), the setup line under it follows
    let suite = "Counting", task = "PickXtimes";
    const boldNums = (t) => String(t || "").split(/(\d+(?:–\d+)?)/).map((x, i) => (i % 2 ? el("b", { text: x }) : x));
    const draw = () => {
      const c = card(host, figTitle(8, "Comparison examples of RoboMME and RoboMME-Plus."),
        "Each side plays an oracle rollout, with the wrist camera inset in the corner; the line under each video summarizes that " +
        "setup. Use ‹ › to switch between the easy, medium, and hard examples (MoveCube: one per manipulation method).");
      // Speed at the right end of the Suite line; the wrist-camera and oracle-subgoal checkboxes at the end of the Task line
      const suiteRow = tabRow("Suite", tabs(SUITES.map(([s]) => ({ label: s, value: s })), (v) => { suite = v; task = SUITES.find(([s]) => s === v)[1][0]; draw(); }, suite));
      const taskRow = tabRow("Task", tabs(SUITES.find(([s]) => s === suite)[1].map((t) => ({ label: t, value: t })), (v) => { task = v; draw(); }, task));
      c.tabsBox.append(suiteRow, taskRow);
      if (!window.RolloutPlayer) return;
      c.tabsBox.classList.add("has-speed", "speed-inline");
      suiteRow.classList.add("with-speed"); suiteRow.appendChild(RolloutPlayer.speedSelect({ subgoal: false }));
      taskRow.classList.add("with-speed"); taskRow.appendChild(RolloutPlayer.speedSelect({ subgoal: false, speed: false, wrist: true, oracle: true }));
      host.classList.add("rp-fit");
      c.body.classList.add("single");
      const pair = el("div", { class: "f8-pair" });
      c.body.appendChild(pair);
      lazy("fig8_rollouts").then((rd) => {
        const T = (rd || {})[task];
        if (!T) { pair.textContent = "No rollouts."; return; }
        // the two goal bars share one height so the videos line up
        const even = () => { const bars = [...pair.querySelectorAll(".rp-task")]; bars.forEach((b) => (b.style.minHeight = ""));
          const h = Math.max(...bars.map((b) => b.offsetHeight)); bars.forEach((b) => (b.style.minHeight = `${h}px`)); };
        [["RoboMME Example", T.robomme, "robomme"], ["RoboMME-Plus Example", T.ood, "ood"]].forEach(([title, eps, side]) => {
          const col = el("div", { class: "f8-side" }), mount = el("div"), setup = el("div", { class: "f8-setup" });
          col.append(el("div", { class: "f8-title", text: title }), mount, setup);
          pair.appendChild(col);
          RolloutPlayer.mount(mount, eps, { band: "card", goal: "bar", view: "pip",
            start: Math.max(0, eps.findIndex((e) => e.difficulty === "medium")), onShow: (smp) => {  // opens on the medium example
            const cmp = (T.comparisons || {})[smp.difficulty] || (T.comparisons || {})["*"] || {};
            setup.replaceChildren(...boldNums(cmp[side])); requestAnimationFrame(even);
          } });
        });
      });
    };
    draw();
  }

  /* ------------------------------------------------------------ Table 1: results */
  const SIX = [
    { id: "framesamp-modul", label: "FrameSamp+Modul" },
    { id: "simplememvla", label: "SimpleMemVLA" }, { id: "ponderpounce", label: "PonderPounce" },
    { id: "3-tier-astra", label: "3-tier Astra" }, { id: "embodied-astra", label: "Embodied Astra" }, { id: "embodied-astra-fs", label: "Embodied Astra (one-shot)" },
  ];
  const REGULAR_OVERALL = { "framesamp-modul": 0.445, simplememvla: 0.883, ponderpounce: 0.608, "3-tier-astra": 0.79125, "embodied-astra": 0.921,
    "embodied-astra-fs": 0.94625 };  // one-shot Astra on RoboMME: our run, 757/800
  function seqColor(r) {
    if (r === null || r === undefined) return ["transparent", "var(--muted)"];
    const steps = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];
    const k = r <= 0 ? 0 : Math.min(7, 1 + Math.floor(r * 7 - 1e-9));
    return [`var(${steps[k]})`, k >= 4 ? "#ffffff" : "#0b0b0b"];
  }
  function cardResults(host) {
    const R = results(), PH = (DATA.placeholders && DATA.placeholders.methods) || {};
    host.classList.add("table-card");
    host.replaceChildren(el("div", { class: "card-title" }, [el("b", { text: "Table 1. " }), "Success rates on RoboMME-Plus by task."]));
    if (!R) return;
    const td = (r, ph, digits1) => {
      const [bg, fg] = seqColor(r);
      const x = el("td", { class: ph ? "ph-cell" : null, text: r === null || r === undefined ? "–" : `${digits1 ? pct1(r) : pct(r)}${ph ? "†" : ""}` });
      if (!ph) { x.style.background = bg; x.style.color = fg; }
      return x;
    };
    // Embodied Astra spans its two variants; every method column has the same width.
    const dag = (id) => (PH[id] ? "\u00a0†" : "");
    const head = [
      el("tr", {}, [el("th", { rowspan: 2 }), el("th", { class: "task", rowspan: 2, text: "Task" }),
        el("th", { rowspan: 2, class: "two", text: "FrameSamp\n+Modul" }), el("th", { rowspan: 2, class: "two", text: "SimpleMem\nVLA" }),
        el("th", { rowspan: 2, class: "two", text: "Ponder\nPounce" + dag("ponderpounce") }), el("th", { rowspan: 2, class: "two", text: "3-tier\nAstra" }),
        el("th", { class: "group", colspan: 2, text: "Embodied Astra" })]),
      el("tr", { class: "sub" }, [el("th", { text: "zero-shot" }), el("th", { text: "one-shot" })]),
    ];
    const gap = (cls) => el("tr", { class: cls }, [el("td", { colspan: SIX.length + 2 })]);
    const body = [el("tr", { class: "regular-row" }, [el("td"), el("td", { class: "task", text: "RoboMME (original)" }), ...SIX.map((m) => el("td", { text: REGULAR_OVERALL[m.id] ? pct1(REGULAR_OVERALL[m.id]) : "–" }))])];
    SUITES.forEach(([s, tasks]) => { body.push(gap("suite-gap")); tasks.forEach((t, k) => body.push(el("tr", {}, [
      k === 0 ? el("td", { class: "suite", rowspan: 4, text: s }) : null, el("td", { class: "task", text: t }),
      ...SIX.map((m) => (PH[m.id] ? td(PH[m.id].tasks[t], true) : td(R[m.id] && R[m.id].tasks[t] ? R[m.id].tasks[t].rate : null))),
    ]))); });
    body.push(gap("overall-gap"));
    body.push(el("tr", { class: "overall" }, [el("td"), el("td", { class: "task", text: "Overall" }), ...SIX.map((m) => (PH[m.id] ? td(PH[m.id].rate, true, true) : td(R[m.id] ? R[m.id].rate : null, false, true)))]));
    const cols = el("colgroup", {}, [el("col", { class: "c-suite" }), el("col", { class: "c-task" }), ...SIX.map(() => el("col", { class: "c-method" }))]);
    host.appendChild(el("div", { class: "results-wrap" }, el("table", { class: "results" }, [cols, el("thead", {}, head), el("tbody", {}, body)])));
    const ramp = el("span", { class: "ramp" }, ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"].map((v) => { const i = el("i"); i.style.background = `var(${v})`; return i; }));
    host.appendChild(el("div", { class: "scale-legend" }, ["0%", ramp, "100%"]));
  }

  /* ------------------------------------------------------------ Figure 6: occlusion (E16c, same layouts with and without the fence) */
  function cardOcclusion(host) {
    sweepCard(host, DATA.e16_occlusion_rungs, {
      fig: 6, title: "Embodied Astra’s performance on VideoUnmask without occlusion (original) versus with a fence that hides at least half of every target cube from the front camera (new).",
      caption: () => "Click a bar to see its rollouts; the wrist camera is inset in the corner.",
      start: () => ({ g: 2, s: "board" }), groupName: (g) => `${g.label} containers`, xTitle: "Containers",
      tick: (g) => g.label, setup: (g, s) => `${g.label} containers · ${s === "board" ? "New" : "Original"}`,
      spec: (g, s) => `cfence:${s}:${g}`, epCaption: epNote, player: "fig6_rollouts", view: "pip", goalIntro: { mount: "same" }, goalBold: ["white", "violet"],
      endHold: 2000, demoRate: 1,  // last frame for 2 s before the outcome card; the demonstration always at 1×
    });
  }

  /* ------------------------------------------------------------ Figure 9: episode horizons, RoboMME vs RoboMME-Plus */
  function cardHorizon(host) {
    // two distributions of oracle execution steps per episode: the share of each benchmark's episodes per 100-step bin,
    // the two bars of a bin side by side, dashed lines at the medians
    const D = DATA.horizon_steps;
    host.classList.add("table-card");
    if (!D) { host.textContent = "No data."; return; }
    const sets = [{ name: "RoboMME", v: Object.values(D.robomme).flat(), col: "var(--series-1)" },
      { name: "RoboMME-Plus", v: Object.values(D.plus).flat(), col: "var(--series-2)" }];
    const BIN = 100, top = Math.ceil(Math.max(...sets.flatMap((st) => st.v)) / BIN) * BIN, nb = top / BIN;
    sets.forEach((st) => {
      st.counts = Array(nb).fill(0); st.v.forEach((x) => st.counts[Math.min(nb - 1, Math.floor(x / BIN))]++);
      st.share = st.counts.map((c) => c / st.v.length);
      const a = [...st.v].sort((x, y) => x - y); st.med = (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2;
    });
    const c = card(host, figTitle(9, "RoboMME-Plus episodes have much longer horizons."));
    c.body.classList.add("single");
    c.body.style.gap = "2px";
    const swatch = (col) => { const i = el("i", { class: "hz-sw" }); i.style.background = col; return i; };
    const wrap = el("div", { class: "chart hz-chart" });
    c.body.append(el("div", { class: "legend" }, sets.map((st) => el("span", {}, [swatch(st.col), st.name]))), wrap);
    const draw = () => {
      wrap.replaceChildren();
      const W = Math.max(320, wrap.clientWidth || 860), narrow = W < 600, H = narrow ? 260 : 300;
      const m = { l: 46, r: 12, t: 22, b: 44 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / nb;
      const ymax = Math.ceil(Math.max(...sets.flatMap((st) => st.share)) * 20) / 20;  // round up to 5%
      const x = (steps) => m.l + (steps / top) * iw, y = (f) => m.t + ih - (f / ymax) * ih;
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Distribution of oracle steps per episode, RoboMME vs RoboMME-Plus" });
      for (let f = 0; f <= ymax + 1e-9; f += 0.05) {
        root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: y(f), y2: y(f), stroke: "var(--line)", "stroke-width": 1 }));
        root.appendChild(svg("text", { class: "tick", x: m.l - 6, y: y(f) + 4, "text-anchor": "end", text: `${Math.round(f * 100)}%` }));
      }
      const tickStep = narrow ? 1000 : 500;
      for (let v = 0; v <= top; v += tickStep) root.appendChild(svg("text", { class: "tick", x: x(v), y: H - m.b + 16, "text-anchor": "middle", text: String(v) }));
      root.appendChild(svg("text", { class: "axis-title", x: m.l + iw / 2, y: H - 6, "text-anchor": "middle", text: "oracle execution steps per episode" }));
      const half = Math.max(1, (bw - 4) / 2);
      for (let k = 0; k < nb; k++) {
        sets.forEach((st, si) => {
          const f = st.share[k]; if (!f) return;
          const bx = m.l + k * bw + 1 + si * (half + 2), by = y(f), h = m.t + ih - by, rr = Math.min(2, half / 2, h);
          root.appendChild(svg("path", { d: `M${bx} ${m.t + ih}V${by + rr}Q${bx} ${by} ${bx + rr} ${by}H${bx + half - rr}Q${bx + half} ${by} ${bx + half} ${by + rr}V${m.t + ih}Z`, fill: st.col }));
        });
        const hit = svg("rect", { x: m.l + k * bw, y: m.t, width: bw, height: ih, fill: "transparent" });
        hit.addEventListener("pointermove", (e) => showTip(e, [el("div", { class: "tt-title", text: `${k * BIN}–${(k + 1) * BIN} steps` }),
          ...sets.map((st) => el("div", {}, [swatch(st.col), ` ${st.name}: ${(st.share[k] * 100).toFixed(1)}% (${st.counts[k]} episodes)`]))]));
        hit.addEventListener("pointerleave", hideTip);
        root.appendChild(hit);
      }
      root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "var(--muted)", "stroke-width": 1 }));
      sets.forEach((st, si) => {  // medians
        const mx = x(st.med);
        root.appendChild(svg("line", { x1: mx, x2: mx, y1: m.t - 4, y2: m.t + ih, stroke: st.col, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
        root.appendChild(svg("text", { class: "hz-med", x: mx + 5, y: m.t + 6 + si * 15, text: narrow ? String(Math.round(st.med)) : `median ${Math.round(st.med)}` }));
      });
      wrap.appendChild(root);
    };
    draw();
    if (window.ResizeObserver) { let w0 = 0; new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - w0) > 4) { w0 = wrap.clientWidth; draw(); } }).observe(wrap); }
  }

  /* ------------------------------------------------------------ Table 2: overall success, latency and API cost */
  const OVERALL_LABEL = { "framesamp-modul-ood": "FrameSamp+Modul w/ OOD FT", "embodied-astra-fs": "One-shot Embodied Astra" };
  function cardOverall(host) {
    const O = DATA.overall_metrics;
    host.classList.add("table-card");
    host.replaceChildren(el("div", { class: "card-title" }, [el("b", { text: "Table 2. " }), "Overall success, runtime, and API cost on RoboMME-Plus."]));
    if (!O) return;
    // one row per method, best success rate first; † marks a method whose evaluation is still running
    const rows = O.rows.filter((r) => !r.method.startsWith("framesamp-modul-ood")).sort((x, y) => (y.success_rate || 0) - (x.success_rate || 0));  // OOD fine-tuning: future work
    const sec = (v) => (v == null ? "–" : `${v.toFixed(1)} s`), ms = (v) => (v == null ? "–" : `${Math.round(v * 1000)} ms`);
    const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
    // headers on two balanced lines ("\n", white-space: pre-line)
    const FEW_SHOT = new Set(["embodied-astra-fs"]);  // the rest are evaluated zero-shot
    const head = el("tr", {}, ["Method", "Setting", "Overall\nsuccess rate", "Avg. time\nper episode", "Avg. model\ntime per step", "Avg. API\nlatency", "Total\nAPI cost"]
      .map((t, i) => el("th", { class: i > 1 ? "num" : i === 1 ? "set" : null, text: t })));
    const partial = rows.filter((r) => r.completed < r.planned);
    const body = rows.map((r) => el("tr", {}, [
      el("td", { class: "m", text: (OVERALL_LABEL[r.method] || r.label) + (r.completed < r.planned ? " †" : "") }),
      el("td", { class: "set", text: FEW_SHOT.has(r.method) ? "FS" : "ZS" }),
      el("td", { class: "num", text: pct1(r.success_rate) }),
      el("td", { class: "num", text: sec(r.wall_per_episode) }),
      el("td", { class: "num", text: ms(r.model_per_step) }),
      el("td", { class: "num", text: r.api_applicable ? sec(r.api_per_request) : "–" }),
      el("td", { class: "num", text: r.api_applicable && r.cost_usd != null ? (r.cost_lower_bound ? "~" : "") + money(r.cost_usd) : "–" }),
    ]));
    const cols = el("colgroup", {}, ["c-method", "c-set", "c-succ", "c-ep", "c-step", "c-api", "c-cost"].map((c) => el("col", { class: c })));
    host.appendChild(el("div", { class: "results-wrap" }, el("table", { class: "overall-table" }, [cols, el("thead", {}, head), el("tbody", {}, body)])));
    host.appendChild(el("div", { class: "table-note", text:
      "FS: few-shot (one in-context example); ZS: zero-shot evaluation. Timings were measured on a machine with 2× NVIDIA RTX 6000 Ada GPUs and a " +
      "32-core AMD EPYC CPU and vary with hardware and API load. Model time is policy inference time per control step. API cost is " +
      "estimated from token usage across all test episodes." +
      (partial.length ? ` † ${partial.map((r) => `${r.completed} of ${r.planned}`).join(", ")} episodes so far.` : "") }));
  }

  /* ------------------------------------------------------------ revision notes */
  function renderRevisionNotes(host) {
    const R = DATA.revision_notes;
    if (!R) return;
    if (R.changes) host.appendChild(el("table", { class: "notes-table" }, [
      el("thead", {}, el("tr", {}, [el("th", { text: "Draft wording" }), el("th", { text: "Revised to" }), el("th", { text: "Why" })])),
      el("tbody", {}, R.changes.map((c) => el("tr", {}, [el("td", { text: c.original }), el("td", { text: c.revised }), el("td", { text: c.why })]))),
    ]));
    if (R.placeholders) host.append(el("h3", { text: "Placeholders (fake numbers) to replace" }), el("ul", {}, R.placeholders.map((x) => el("li", { text: x }))));
    if (R.todo) host.append(el("h3", { text: "Still to do" }), el("ul", {}, R.todo.map((x) => el("li", { text: x }))));
  }

  function renderReferences(host) {
    host.replaceChildren(...citeOrder.map((k, i) => {
      const r = REFS[k];
      return el("li", { id: `ref-${i + 1}` }, [el("span", { class: "ref-n", text: `[${i + 1}]` }),
        r ? el("span", {}, [`${r.authors} `, el("a", { href: r.url, text: r.title }), `${endStop(r.title)} ${r.venue}, ${r.year}.`]) : el("span", { class: "todo", text: `missing reference: ${k}` })]);
    }));
  }

  /* ------------------------------------------------------------ hover notes: a bubble pointing at the phrase */
  function placePop(pop, n) {
    // above the anchor when there is room (else below), clamped to the viewport, the arrow pointing at the anchor
    const r = n.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 10;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - gap > 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${above ? r.top - h - gap : r.bottom + gap}px`;
    pop.classList.toggle("below", !above);
    pop.style.setProperty("--arrow-x", `${r.left + r.width / 2 - left}px`);
  }
  function setupNotes() {
    const pop = el("div", { class: "note-pop", role: "tooltip" });
    document.body.appendChild(pop);
    let owner = null;
    const hide = () => { pop.classList.remove("show"); owner = null; };
    const show = (n) => {
      const src = document.getElementById(n.dataset.note);
      if (!src) return;
      owner = n;
      pop.replaceChildren(...[...src.cloneNode(true).childNodes]);  // keeps inline emphasis (e.g. <b>only once</b>)
      pop.classList.add("show");
      placePop(pop, n);
    };
    document.querySelectorAll(".note[data-note]").forEach((n) => {
      n.addEventListener("mouseenter", () => show(n));
      n.addEventListener("mouseleave", hide);
      n.addEventListener("focus", () => show(n));
      n.addEventListener("blur", hide);
      // touch: a tap opens the note (focus already shows it), a second tap closes it; mouse: hover handles it
      n.addEventListener("pointerdown", (e) => { n.wasOpen = owner === n && e.pointerType !== "mouse"; });
      n.addEventListener("click", (e) => { e.stopPropagation(); if (n.wasOpen) hide(); else show(n); });
    });
    document.addEventListener("click", hide);
    addEventListener("scroll", () => owner && show(owner), { passive: true });
  }

  /* ------------------------------------------------------------ citation cards: hover a [n] for the paper, click to jump */
  function setupCitePops() {
    const pop = el("div", { class: "note-pop cite-pop", role: "tooltip" });
    document.body.appendChild(pop);
    let owner = null;
    const hide = () => { pop.classList.remove("show"); owner = null; };
    const show = (a) => {
      const n = Number(a.getAttribute("href").slice(5)), r = REFS[citeOrder[n - 1]];
      if (!r) return;
      owner = a;
      pop.replaceChildren(el("div", { class: "cp-title" }, [el("span", { class: "cp-n", text: `[${n}]` }), r.title]),
        el("div", { class: "cp-meta", text: `${r.authors} · ${r.venue}, ${r.year}` }));
      pop.classList.add("show");
      placePop(pop, a);
    };
    document.querySelectorAll('cite a[href^="#ref-"]').forEach((a) => {
      a.removeAttribute("title");  // the card replaces the browser tooltip
      a.addEventListener("mouseenter", () => show(a));
      a.addEventListener("mouseleave", hide);
      a.addEventListener("focus", () => show(a));
      a.addEventListener("blur", hide);
      a.addEventListener("click", (e) => {  // smooth scroll to the entry (highlighted via :target)
        const t = document.querySelector(a.getAttribute("href"));
        if (!t) return;
        e.preventDefault(); hide();
        history.pushState(null, "", a.getAttribute("href"));
        t.scrollIntoView({ behavior: "smooth", block: "center" });
        t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
      });
    });
    addEventListener("scroll", () => owner && placePop(pop, owner), { passive: true });
  }

  /* ------------------------------------------------------------ text links that open a figure on a given point */
  function setupShowLinks() {
    // <a class="show-link" data-show="<card>" data-task data-method data-setting>: opens a collapsed figure, selects the
    // point (the card's showPoint) and scrolls it into view
    document.querySelectorAll("a.show-link[data-show]").forEach((a) => a.addEventListener("click", (e) => {
      const host = document.querySelector(`[data-card="${a.dataset.show}"]`);
      if (!host) return;
      e.preventDefault();
      const det = host.closest("details");
      if (det) det.open = true;
      if (host.showPoint) host.showPoint(a.dataset.task, a.dataset.method, a.dataset.setting);
      const top = host.previousElementSibling && host.previousElementSibling.classList.contains("card-tabs") ? host.previousElementSibling : host;
      requestAnimationFrame(() => top.scrollIntoView({ behavior: "smooth", block: "start" }));
    }));
  }

  /* ------------------------------------------------------------ contents panel: every section, the current one highlighted */
  function setupToc() {
    const nav = document.querySelector("nav.toc");
    if (!nav) return;
    const heads = [...document.querySelectorAll("main section > h2, main section > h3")].filter((h) => h.closest("section").id !== "revision-notes");
    const links = heads.map((h) => {
      const target = h.tagName === "H2" ? h.closest("section") : h;
      const a = el("a", { href: `#${target.id}`, class: h.tagName === "H3" ? "sub" : null, text: h.textContent.replace(/\s+/g, " ").trim() });
      a.addEventListener("click", (e) => { e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); target.scrollIntoView({ behavior: "smooth", block: "start" }); });
      return { a, h };
    });
    nav.replaceChildren(el("div", { class: "toc-title", text: "Contents" }), ...links.map((l) => l.a));
    // narrow screens: a button opens the list as a pop-up; picking a section or clicking elsewhere closes it
    const btn = el("button", { type: "button", class: "toc-btn", "aria-label": "Contents", text: "☰ Contents" });
    document.body.appendChild(btn);
    btn.addEventListener("click", (e) => { e.stopPropagation(); nav.classList.toggle("open"); });
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) nav.classList.remove("open"); e.stopPropagation(); });
    document.addEventListener("click", () => nav.classList.remove("open"));
    const mark = () => {  // the last heading above the upper third of the window is the current one
      const y = innerHeight * 0.3;
      let cur = links[0];
      links.forEach((l) => { if (l.h.getBoundingClientRect().top <= y) cur = l; });
      links.forEach((l) => l.a.classList.toggle("active", l === cur));
      const inArticle = document.querySelector("main").getBoundingClientRect().top < innerHeight * 0.6;
      nav.classList.toggle("shown", inArticle); btn.classList.toggle("shown", inArticle);
    };
    addEventListener("scroll", mark, { passive: true }); addEventListener("resize", mark); mark();
  }

  /* ------------------------------------------------------------ boot */
  const CARDS = { timeline: cardTimeline, sweeps: cardSweepsStack, "sweeps-all": cardSweepsAll, stopcube: cardStopCube, repick: cardRepick, placeorder: cardPlaceOrder,
    insertpeg: cardInsertPeg, movecube: cardMoveCube, occlusion: cardOcclusion, design: cardDesign, results: cardResults, overall: cardOverall, horizon: cardHorizon };
  // walk the page in reading order so citations are numbered by first appearance, figure captions included
  document.querySelectorAll("cite[data-ref], [data-card]").forEach((h) => {
    if (h.matches("cite")) { fillCite(h, h.dataset.ref.split(",").map((x) => x.trim())); return; }
    try { CARDS[h.dataset.card](h); } catch (err) { console.error(h.dataset.card, err); h.textContent = `Render error: ${err}`; }
  });
  document.querySelectorAll('[data-render="references"]').forEach(renderReferences);
  styleNames(document.querySelector(".hero")); styleNames(document.querySelector("main"));
  setupNotes();
  setupCitePops();
  setupShowLinks();
  setupToc();
  document.querySelectorAll(".bib-copy").forEach((b) => b.addEventListener("click", () => {  // copy the BibTeX next to it
    const pre = b.parentElement.querySelector("pre");
    (navigator.clipboard ? navigator.clipboard.writeText(pre.textContent) : Promise.reject()).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); })
      .catch(() => { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
  }));
  document.querySelectorAll('[data-render="revision-notes"]').forEach(renderRevisionNotes);
})();
