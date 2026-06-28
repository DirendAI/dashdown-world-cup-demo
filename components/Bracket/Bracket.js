// Bracket — single-elimination knockout tree, reconstructed from W#/L# refs.
import { fetchQueryData, recordsOf, esc } from "dashdown/core.js";

const COL = { R32: 0, R16: 1, QF: 2, SF: 3, Final: 4 };
const ROUND_NAME = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", Final: "Final" };
const CARD_W = 178, COL_W = 214, ROW_H = 72, CARD_H = 58, PAD_T = 8;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function refNum(t) { const m = /^[WL](\d+)$/.exec(String(t || "")); return m ? Number(m[1]) : null; }
function num(v) { return v === "" || v == null ? null : Number(v); }
function kickoff(t) { return String(t || "").split(" ")[0] || ""; }
function shortDate(iso) {
  const p = String(iso).slice(0, 10).split("-").map(Number);
  return p[1] ? `${MON[p[1] - 1]} ${p[2]}` : "";
}

function teamLine(label, flag, raw, score, otherScore, played) {
  const isRef = refNum(raw) != null;
  const win = played && score != null && otherScore != null && score > otherScore;
  const fl = isRef ? `<span class="wc-br-seed">⟶</span>` : `<span class="wc-br-flag">${esc(flag || "")}</span>`;
  const sc = played ? `<span class="wc-br-score">${score}</span>` : "";
  return (
    `<div class="wc-br-team${win ? " win" : ""}${isRef ? " ref" : ""}">` +
    `${fl}<span class="wc-br-name">${esc(label || "TBD")}</span>${sc}</div>`
  );
}

function card(r, x, y) {
  const rs = r.round_short;
  const played = num(r.played) === 1;
  const s1 = num(r.score1), s2 = num(r.score2);
  const meta = played ? "FT" : `${shortDate(r.date)} · ${esc(kickoff(r.time)) || "TBD"}`;
  return (
    `<div class="wc-br-card r-${rs}" style="left:${x}px;top:${y}px;width:${CARD_W}px">` +
    `<div class="wc-br-meta"><span>M${r.num}</span><span>${meta}</span></div>` +
    teamLine(r.team1_label || r.team1, r.flag1, r.team1, s1, s2, played) +
    teamLine(r.team2_label || r.team2, r.flag2, r.team2, s2, s1, played) +
    `</div>`
  );
}

function draw(root, records, cfg) {
  const byNum = {};
  records.forEach((r) => { if (r.num != null) byNum[Number(r.num)] = r; });
  const final = records.find((r) => r.round_short === "Final");
  const third = records.find((r) => r.round_short === "3rd Place");
  if (!final) { root.innerHTML = `<div class="wc-br-skel">No knockout matches yet.</div>`; return; }

  const pos = {};
  let leaf = 0;
  (function place(r) {
    if (!r) return null;
    const col = COL[r.round_short] ?? 0;
    const kids = [refNum(r.team1), refNum(r.team2)].map((n) => (n != null ? byNum[n] : null)).filter(Boolean);
    let row;
    if (!kids.length) row = leaf++;
    else { const rows = kids.map(place).filter((v) => v != null); row = rows.reduce((a, b) => a + b, 0) / rows.length; }
    pos[Number(r.num)] = { col, row, rec: r };
    return row;
  })(final);

  const nLeaves = Math.max(1, leaf);
  const cardH = CARD_H;
  const headerH = 30;
  const totalH = PAD_T + headerH + nLeaves * ROW_H + 8;
  const totalW = 5 * COL_W;
  const cx = (col) => col * COL_W + 8;
  const cy = (row) => PAD_T + headerH + row * ROW_H;

  // connectors
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "wc-br-links");
  svg.setAttribute("width", totalW);
  svg.setAttribute("height", totalH);
  Object.values(pos).forEach(({ col, row, rec }) => {
    const kids = [refNum(rec.team1), refNum(rec.team2)].map((n) => (n != null ? byNum[n] : null)).filter(Boolean);
    const px = cx(col), py = cy(row) + cardH / 2;
    kids.forEach((k) => {
      const kp = pos[Number(k.num)];
      if (!kp) return;
      const kx = cx(kp.col) + CARD_W, ky = cy(kp.row) + cardH / 2;
      const midX = (kx + px) / 2;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M${kx},${ky} H${midX} V${py} H${px}`);
      path.setAttribute("class", "wc-br-link");
      svg.appendChild(path);
    });
  });

  // headers
  let headers = "";
  for (const rs of ["R32", "R16", "QF", "SF", "Final"]) {
    headers += `<div class="wc-br-colhead r-${rs}" style="left:${cx(COL[rs])}px;width:${CARD_W}px">${ROUND_NAME[rs]}</div>`;
  }
  // cards
  let cards = "";
  Object.values(pos).forEach(({ col, row, rec }) => { cards += card(rec, cx(col), cy(row)); });

  const stage = document.createElement("div");
  stage.className = "wc-br-stage";
  stage.style.width = totalW + "px";
  stage.style.height = totalH + "px";
  stage.appendChild(svg);
  stage.insertAdjacentHTML("beforeend", headers + cards);

  const scroller = document.createElement("div");
  scroller.className = "wc-br-scroll";
  scroller.appendChild(stage);

  root.innerHTML = "";
  if (cfg.title) {
    const h = document.createElement("div");
    h.className = "wc-br-title";
    h.textContent = cfg.title;
    root.appendChild(h);
  }
  root.appendChild(scroller);

  if (third) {
    const t = document.createElement("div");
    t.className = "wc-br-third";
    t.innerHTML =
      `<div class="wc-br-third-label">🥉 Third-place play-off</div>` +
      `<div class="wc-br-card r-3rd" style="position:relative;width:${CARD_W}px">` +
      `<div class="wc-br-meta"><span>M${third.num}</span><span>${num(third.played) === 1 ? "FT" : shortDate(third.date) + " · " + (esc(kickoff(third.time)) || "TBD")}</span></div>` +
      teamLine(third.team1_label || third.team1, third.flag1, third.team1, num(third.score1), num(third.score2), num(third.played) === 1) +
      teamLine(third.team2_label || third.team2, third.flag2, third.team2, num(third.score2), num(third.score1), num(third.played) === 1) +
      `</div>`;
    root.appendChild(t);
  }
}

function initAll() {
  for (const root of document.querySelectorAll('[data-async-component="wc-bracket"]')) {
    if (root.dataset.wcInit) continue;
    root.dataset.wcInit = "1";
    let cfg;
    try { cfg = JSON.parse(root.dataset.config); } catch { continue; }
    fetchQueryData(cfg.query)
      .then((ds) => draw(root, recordsOf(ds), cfg))
      .catch((e) => { root.innerHTML = `<div class="wc-br-skel">Bracket failed to load.</div>`; console.error(e); });
  }
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initAll);
else initAll();
