// MatchTimeline — self-initialising (app.js only wires built-in async types).
import { fetchQueryData, recordsOf, esc } from "dashdown/core.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso) {
  const p = String(iso).slice(0, 10).split("-").map(Number);
  if (p.length < 3 || !p[0]) return String(iso);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return `${WD[d.getUTCDay()]} · ${MON[p[1] - 1]} ${p[2]}`;
}
function kickoff(t) {
  // "20:00 UTC-6" -> "20:00"
  return String(t || "").split(" ")[0] || "";
}
function num(v) { return v === "" || v == null ? null : Number(v); }

function teamCell(name, flag, win, side) {
  const w = win ? " win" : "";
  const fl = `<span class="wc-tl-flag">${esc(flag || "")}</span>`;
  const nm = `<span class="wc-tl-name">${esc(name || "TBD")}</span>`;
  return side === "home"
    ? `<span class="wc-tl-team home${w}">${nm}${fl}</span>`
    : `<span class="wc-tl-team away${w}">${fl}${nm}</span>`;
}

function matchRow(r) {
  const played = num(r.played) === 1;
  const s1 = num(r.score1), s2 = num(r.score2);
  const stage = String(r.stage || "").toLowerCase() === "knockout" ? "knockout" : "group";
  const tag = r.round_short || r.round || "";
  const grp = r.group ? ` ${String(r.group).replace("Group ", "Grp ")}` : "";
  const home = teamCell(r.team1_label || r.team1, r.flag1, played && s1 > s2, "home");
  const away = teamCell(r.team2_label || r.team2, r.flag2, played && s2 > s1, "away");
  const mid = played
    ? `<span class="wc-tl-score">${s1}<span class="dash">–</span>${s2}</span>`
    : `<span class="wc-tl-kick">${esc(kickoff(r.time)) || "TBD"}</span>`;
  const venue = r.ground
    ? `<span class="wc-tl-venue">${esc(r.stadium ? r.stadium + " · " : "")}${esc(r.ground)}</span>`
    : "";
  return (
    `<div class="wc-tl-match${played ? "" : " upcoming"}">` +
    `<span class="wc-tl-tag ${stage}">${esc(tag + grp)}</span>` +
    `<div class="wc-tl-fixture">${home}${mid}${away}</div>` +
    venue +
    `</div>`
  );
}

function draw(el, records, cfg) {
  let rows = records.filter((r) => r.date);
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
    String(a.time).localeCompare(String(b.time)));
  if (cfg.order === "desc") rows.reverse();
  if (cfg.limit) rows = rows.slice(0, cfg.limit);
  if (!rows.length) { el.innerHTML = `<div class="wc-tl-skel">${esc(cfg.empty)}</div>`; return; }

  const byDay = [];
  let cur = null;
  for (const r of rows) {
    const d = String(r.date).slice(0, 10);
    if (!cur || cur.day !== d) { cur = { day: d, items: [] }; byDay.push(cur); }
    cur.items.push(r);
  }
  el.innerHTML =
    `<ol class="wc-tl-rail">` +
    byDay.map((g) => {
      const upcoming = g.items.every((r) => num(r.played) !== 1);
      return (
        `<li class="wc-tl-day${upcoming ? " future" : ""}">` +
        `<div class="wc-tl-date"><span class="wc-tl-dot"></span>${esc(dayLabel(g.day))}` +
        `<span class="wc-tl-count">${g.items.length} match${g.items.length > 1 ? "es" : ""}</span></div>` +
        `<div class="wc-tl-list">${g.items.map(matchRow).join("")}</div>` +
        `</li>`
      );
    }).join("") +
    `</ol>`;
}

function initAll() {
  for (const el of document.querySelectorAll('[data-async-component="wc-timeline"]')) {
    if (el.dataset.wcInit) continue;
    el.dataset.wcInit = "1";
    let cfg;
    try { cfg = JSON.parse(el.dataset.config); } catch { continue; }
    fetchQueryData(cfg.query)
      .then((ds) => draw(el, recordsOf(ds), cfg))
      .catch((e) => { el.innerHTML = `<div class="wc-tl-skel">Timeline failed to load.</div>`; console.error(e); });
  }
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initAll);
else initAll();
