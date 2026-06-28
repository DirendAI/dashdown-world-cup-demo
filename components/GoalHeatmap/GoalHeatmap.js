// GoalHeatmap — custom SVG heat-histogram of goals by match minute.
import { fetchQueryData, recordsOf, esc } from "dashdown/core.js";

const SVGNS = "http://www.w3.org/2000/svg";
const STOPS = [[0, [220, 231, 245]], [0.45, [46, 111, 201]], [0.75, [255, 199, 44]], [1, [228, 0, 43]]];

function heat(t) {
  t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < STOPS.length - 1 && t > STOPS[i + 1][0]) i++;
  const [p0, c0] = STOPS[i];
  const [p1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const f = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
  const m = (a, b) => Math.round(a + (b - a) * f);
  return `rgb(${m(c0[0], c1[0])},${m(c0[1], c1[1])},${m(c0[2], c1[2])})`;
}
function el(tag, attrs, kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (kids) for (const c of kids) n.appendChild(c);
  return n;
}
function num(v) { return v === "" || v == null ? null : Number(v); }

function draw(root, records, cfg) {
  const step = cfg.bin || 5;
  const nBins = Math.ceil(90 / step);
  const bins = Array.from({ length: nBins + 1 }, (_, i) => ({   // +1 = "90+"
    lo: i < nBins ? i * step + 1 : 91,
    hi: i < nBins ? (i + 1) * step : 0,
    n: 0,
    label: i < nBins ? `${i * step + 1}–${(i + 1) * step}` : "90+",
  }));
  let total = 0;
  for (const r of records) {
    const mn = num(r[cfg.minute]);
    const g = num(r[cfg.value]) ?? 1;
    if (mn == null) continue;
    const idx = mn > 90 ? nBins : Math.min(nBins - 1, Math.floor((mn - 1) / step));
    bins[idx].n += g;
    total += g;
  }
  if (!bins[nBins].n) bins.pop();          // drop empty stoppage bin
  const max = Math.max(1, ...bins.map((b) => b.n));
  const peak = bins.reduce((a, b) => (b.n > a.n ? b : a), bins[0]);

  // viewBox layout
  const W = 920, H = 250, padL = 40, padR = 16, padT = 26, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const bw = plotW / bins.length;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "wc-heat-svg", preserveAspectRatio: "xMidYMid meet" });

  // y gridlines
  for (let i = 0; i <= 2; i++) {
    const v = Math.round((max / 2) * i);
    const y = padT + plotH - (v / max) * plotH;
    svg.appendChild(el("line", { x1: padL, y1: y, x2: W - padR, y2: y, class: "wc-heat-grid" }));
    svg.appendChild(el("text", { x: padL - 6, y: y + 3, class: "wc-heat-ytick", "text-anchor": "end" })).textContent = v;
  }
  // bars
  bins.forEach((b, i) => {
    const x = padL + i * bw;
    const bh = (b.n / max) * plotH;
    const y = padT + plotH - bh;
    const g = el("g", { class: "wc-heat-bar" });
    g.appendChild(el("rect", {
      x: x + 1.5, y, width: Math.max(1, bw - 3), height: Math.max(0.5, bh),
      rx: 3, fill: heat(b.n / max),
    }));
    if (b.n > 0)
      g.appendChild(Object.assign(el("text", {
        x: x + bw / 2, y: y - 4, class: "wc-heat-val", "text-anchor": "middle",
      }), { textContent: b.n }));
    const title = el("title");
    title.textContent = `Minutes ${b.label}: ${b.n} goal${b.n === 1 ? "" : "s"}`;
    g.appendChild(title);
    svg.appendChild(g);
  });
  // baseline + minute axis
  const baseY = padT + plotH;
  svg.appendChild(el("line", { x1: padL, y1: baseY, x2: W - padR, y2: baseY, class: "wc-heat-axis" }));
  [0, 15, 30, 45, 60, 75, 90].forEach((mnt) => {
    const x = padL + (mnt / (bins.length * step)) * plotW;
    svg.appendChild(Object.assign(el("text", {
      x, y: H - 14, class: "wc-heat-xtick", "text-anchor": "middle",
    }), { textContent: mnt === 0 ? "1'" : mnt + "'" }));
  });
  svg.appendChild(Object.assign(el("text", {
    x: padL + plotW / 2, y: H - 2, class: "wc-heat-xlab", "text-anchor": "middle",
  }), { textContent: "Match minute" }));
  // half-time divider at 45'
  const htX = padL + (45 / (bins.length * step)) * plotW;
  svg.appendChild(el("line", { x1: htX, y1: padT - 6, x2: htX, y2: baseY, class: "wc-heat-ht" }));
  svg.appendChild(Object.assign(el("text", {
    x: htX, y: padT - 10, class: "wc-heat-htlab", "text-anchor": "middle",
  }), { textContent: "HT" }));

  root.innerHTML = "";
  if (cfg.title) {
    const h = document.createElement("div");
    h.className = "wc-heat-title";
    h.textContent = cfg.title;
    root.appendChild(h);
  }
  root.appendChild(svg);
  const cap = document.createElement("div");
  cap.className = "wc-heat-caption";
  cap.innerHTML =
    `<span><b>${total}</b> goals</span>` +
    `<span class="wc-heat-peak">🔥 Peak <b>${esc(peak.label)}'</b> · ${peak.n} goals</span>` +
    `<span class="wc-heat-scale"><i>fewer</i><span class="wc-heat-grad"></span><i>more</i></span>`;
  root.appendChild(cap);
}

function initAll() {
  for (const root of document.querySelectorAll('[data-async-component="wc-goalheat"]')) {
    if (root.dataset.wcInit) continue;
    root.dataset.wcInit = "1";
    let cfg;
    try { cfg = JSON.parse(root.dataset.config); } catch { continue; }
    fetchQueryData(cfg.query)
      .then((ds) => draw(root, recordsOf(ds), cfg))
      .catch((e) => { root.innerHTML = `<div class="wc-heat-skel">Heatmap failed to load.</div>`; console.error(e); });
  }
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initAll);
else initAll();
