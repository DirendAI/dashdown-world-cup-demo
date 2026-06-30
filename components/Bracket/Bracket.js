// Bracket — single-elimination knockout tree, built from a fixed feeder map
// (with live W#/L# refs as a fallback) so it stays intact as results come in.
import { fetchQueryData, recordsOf, esc } from "dashdown/core.js";

const COL = { R32: 0, R16: 1, QF: 2, SF: 3, Final: 4 };
const ROUND_NAME = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", Final: "Final" };
const CARD_W = 178, COL_W = 214, ROW_H = 92, CARD_H = 58, PAD_T = 8;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Which two earlier matches feed each knockout match (2026 schedule). The feed
// overwrites a slot's "W##" ref with the winner's name once that match is played
// (e.g. M90 becomes "Canada vs W75"), which would otherwise drop the feeder from
// the tree — losing both the connector line and the played match itself. This map
// keeps the structure intact regardless of how many results are in.
const FEEDERS = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102],
};

function refNum(t) { const m = /^[WL](\d+)$/.exec(String(t || "")); return m ? Number(m[1]) : null; }
function num(v) { return v === "" || v == null ? null : Number(v); }
function shortDate(iso) {
  const p = String(iso).slice(0, 10).split("-").map(Number);
  return p[1] ? `${MON[p[1] - 1]} ${p[2]}` : "";
}
// Kickoff date + time in the *visitor's* local timezone, from the connector's UTC
// instant; fall back to the raw venue-local date/time when it's missing.
function kickDate(r) {
  if (r.kickoff_utc) { const d = new Date(r.kickoff_utc); if (!isNaN(d)) return d; }
  return null;
}
function localKick(r) {
  const d = kickDate(r);
  if (d) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return String(r.time || "").split(" ")[0] || "";
}
function localShortDate(r) {
  const d = kickDate(r);
  return d ? `${MON[d.getMonth()]} ${d.getDate()}` : shortDate(r.date);
}

// One team row. `pen` is the side's penalty-shootout tally (shown only when the tie
// went to spot-kicks); `isWinner` comes from the match result, so the team that won
// on penalties is bolded even though the 90/120-min score is level.
function teamLine(label, flag, raw, score, pen, isWinner, played) {
  const isRef = refNum(raw) != null;
  const fl = isRef ? `<span class="wc-br-seed">⟶</span>` : `<span class="wc-br-flag">${esc(flag || "")}</span>`;
  const penTxt = played && pen != null ? `<span class="wc-br-pen">(${pen})</span>` : "";
  const sc = played ? `<span class="wc-br-score">${score}</span>` : "";
  return (
    `<div class="wc-br-team${isWinner ? " win" : ""}${isRef ? " ref" : ""}">` +
    `${fl}<span class="wc-br-name">${esc(label || "TBD")}</span>${sc}${penTxt}</div>`
  );
}

// Meta line right-hand label: how a played tie was decided (penalties / extra time /
// full time), or the upcoming kickoff for a match still to be played.
function statusMeta(r) {
  if (num(r.played) !== 1) return `${esc(localShortDate(r))} · ${esc(localKick(r)) || "TBD"}`;
  const d = String(r.decided || "");
  return d === "PENS" ? "Pens" : d === "AET" ? "AET" : "FT";
}

// Card body (meta + both team rows), shared by the bracket grid and the 3rd-place card.
function cardInner(r) {
  const played = num(r.played) === 1;
  const result = String(r.result || "");
  return (
    `<div class="wc-br-meta"><span>M${r.num}</span><span>${statusMeta(r)}</span></div>` +
    teamLine(r.team1_label || r.team1, r.flag1, r.team1, num(r.score1), num(r.pen1), played && result === "1", played) +
    teamLine(r.team2_label || r.team2, r.flag2, r.team2, num(r.score2), num(r.pen2), played && result === "2", played)
  );
}

function card(r, x, y) {
  return (
    `<div class="wc-br-card r-${r.round_short}" style="left:${x}px;top:${y}px;width:${CARD_W}px">` +
    cardInner(r) +
    `</div>`
  );
}

function draw(root, records, cfg) {
  const byNum = {};
  records.forEach((r) => { if (r.num != null) byNum[Number(r.num)] = r; });
  const final = records.find((r) => r.round_short === "Final");
  const third = records.find((r) => r.round_short === "3rd Place");
  if (!final) { root.innerHTML = `<div class="wc-br-skel">No knockout matches yet.</div>`; return; }

  // Feeder matches for r: the fixed 2026 map first (survives result resolution),
  // falling back to live W#/L# refs for anything not in the map.
  const kidsOf = (r) => {
    const nums = FEEDERS[Number(r.num)] || [refNum(r.team1), refNum(r.team2)].filter((n) => n != null);
    return nums.map((n) => byNum[n]).filter(Boolean);
  };

  const pos = {};
  let leaf = 0;
  (function place(r) {
    if (!r) return null;
    const col = COL[r.round_short] ?? 0;
    const kids = kidsOf(r);
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
    const kids = kidsOf(rec);
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
      cardInner(third) +
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
