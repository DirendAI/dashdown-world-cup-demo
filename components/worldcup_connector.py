"""Live World Cup connector — `type: worldcup` in sources.yaml.

Fetches the openfootball worldcup.json feed (2026) straight from GitHub at query
time, flattens its nested matches/goals/groups/teams/stadiums into clean,
SQL-queryable tables in an in-memory DuckDB, and re-fetches at most once per
`refresh_ttl` seconds — so reloading the dashboard reflects whatever results are
currently published upstream, with no checked-in data files.

Tables exposed: matches · goals · standings · teams · stadiums.

    # sources.yaml
    main:
      type: worldcup
      base_url: https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026
      refresh_ttl: 180        # seconds; 0 disables live refresh after first load
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import re
import ssl
import time
import urllib.request
from collections import defaultdict
from typing import Any

import pandas as pd


def _ssl_context() -> ssl.SSLContext:
    """A verifying SSL context that works on framework Python (which ships no CA
    bundle). Prefer certifi's bundle; fall back to the system default."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        return ssl.create_default_context()


_SSL = _ssl_context()

from dashdown.data.base import register_connector
from dashdown.data.duckdb_connector import DuckDBConnector

log = logging.getLogger(__name__)

DEFAULT_BASE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026"
_FILES = {
    "wc": "worldcup.json",
    "groups": "worldcup.groups.json",
    "teams": "worldcup.teams.json",
    "stadiums": "worldcup.stadiums.json",
}
_KO = {"Round of 32", "Round of 16", "Quarter-final", "Semi-final",
       "Match for third place", "Final"}
_ROUND_SHORT = {"Round of 32": "R32", "Round of 16": "R16", "Quarter-final": "QF",
                "Semi-final": "SF", "Match for third place": "3rd Place", "Final": "Final"}
_CC_COUNTRY = {"us": "United States", "ca": "Canada", "mx": "Mexico"}


# --------------------------------------------------------------------------- #
# Fetch                                                                       #
# --------------------------------------------------------------------------- #
def _fetch_json(url: str, retries: int = 3) -> Any:
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "dashdown-worldcup/1.0"})
            with urllib.request.urlopen(req, timeout=25, context=_SSL) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 — retry any transport/parse error
            last = e
    raise RuntimeError(f"worldcup: could not fetch {url}: {last}")


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #
def _round_order(r: str) -> int:
    if r.startswith("Matchday"):
        return int(r.split()[1])
    return {"Round of 32": 30, "Round of 16": 40, "Quarter-final": 50,
            "Semi-final": 60, "Match for third place": 70, "Final": 80}.get(r, 99)


def _is_ref(name: str) -> bool:
    return bool(name) and bool(re.match(r"^[WL]\d+$", name))


def _team_label(name: str) -> str:
    if not name:
        return "TBD"
    if _is_ref(name):
        kind = "Winner" if name[0] == "W" else "Loser"
        return f"{kind} M{name[1:]}"
    return name


def _parse_one(tok: str) -> float:
    tok = tok.strip()
    hemi, body = tok[-1], tok[:-1]
    if "'" in body or '"' in body:                       # DMS  49°16'36"
        m = re.match(r"""(\d+)°(\d+)'(?:([\d.]+)")?""", body)
        deg, mn, sec = m.group(1), m.group(2), m.group(3) or "0"
        val = float(deg) + float(mn) / 60 + float(sec) / 3600
    else:                                                # decimal  37.403°
        val = float(body.replace("°", ""))
    return round(-val if hemi in ("S", "W") else val, 5)


def _parse_coords(s: str) -> tuple[float, float]:
    lat_tok, lon_tok = s.split()
    return _parse_one(lat_tok), _parse_one(lon_tok)


def _base_minute(mn: Any) -> int:
    s = str(mn).split("+")[0]
    return int(s) if s.isdigit() else 0


def _bucket(b: int) -> str:
    for hi, lab in ((15, "01-15"), (30, "16-30"), (45, "31-45"),
                    (60, "46-60"), (75, "61-75"), (90, "76-90")):
        if b <= hi:
            return lab
    return "90+"


_OFFSET_RE = re.compile(r"UTC([+-])(\d{1,2})(?::?(\d{2}))?$")


def _kickoff_utc(date: str, t: str) -> str:
    """Combine an openfootball date + offset-tagged kickoff ("13:00 UTC-6") into a
    UTC ISO-8601 instant ("2026-06-11T19:00:00Z"), so the browser can re-render it
    in each visitor's local timezone. The feed's explicit offsets already account
    for DST, so no zone guessing is needed. Returns "" when there's no parseable
    offset — the front-end then falls back to the raw venue-local string."""
    if not date or not t:
        return ""
    parts = str(t).split()
    if len(parts) < 2:
        return ""
    mo = _OFFSET_RE.match(parts[1].strip())
    if not mo:
        return ""
    try:
        hh, mm = (int(x) for x in parts[0].split(":")[:2])
        y, mon, d = (int(x) for x in str(date).split("-")[:3])
    except (ValueError, IndexError):
        return ""
    sign = 1 if mo.group(1) == "+" else -1
    tz = _dt.timezone(sign * _dt.timedelta(hours=int(mo.group(2)),
                                           minutes=int(mo.group(3) or 0)))
    try:
        local = _dt.datetime(y, mon, d, hh, mm, tzinfo=tz)
    except ValueError:
        return ""
    return local.astimezone(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# Transform  (nested JSON  ->  five flat tables)                               #
# --------------------------------------------------------------------------- #
def build_frames(base_url: str) -> dict[str, tuple[list[dict], list[str], list[str]]]:
    base = base_url.rstrip("/")
    wc = _fetch_json(f"{base}/{_FILES['wc']}")
    groups = _fetch_json(f"{base}/{_FILES['groups']}")
    teams_raw = _fetch_json(f"{base}/{_FILES['teams']}")
    stad_raw = _fetch_json(f"{base}/{_FILES['stadiums']}")

    teams = {t["name"]: t for t in teams_raw}
    code = lambda n: teams.get(n, {}).get("fifa_code", "")
    flag = lambda n: teams.get(n, {}).get("flag_icon", "")
    confed = lambda n: teams.get(n, {}).get("confed", "")

    stadiums = {}
    for s in stad_raw["stadiums"]:
        lat, lon = _parse_coords(s["coords"])
        stadiums[s["city"]] = {
            "city": s["city"], "stadium": s["name"], "capacity": s["capacity"],
            "cc": s["cc"], "country": _CC_COUNTRY.get(s["cc"], s["cc"]),
            "lat": lat, "lon": lon, "timezone": s["timezone"],
        }

    matches_in = wc["matches"]
    group_matches = sorted([m for m in matches_in if m["round"].startswith("Matchday")],
                           key=lambda m: (m["date"], m.get("time", ""), m.get("group", "")))
    for i, m in enumerate(group_matches, start=1):
        m["_num"] = i
    for m in matches_in:
        m.setdefault("_num", m.get("num"))

    # advanced = appears in any Round of 32 fixture
    advanced = set()
    for m in matches_in:
        if m["round"] == "Round of 32":
            for t in (m.get("team1"), m.get("team2")):
                if t and not _is_ref(t):
                    advanced.add(t)

    # ---- matches ----
    # Two passes. First decide every played tie — penalty- and extra-time-aware, so
    # a knockout match level after 90/120 min is settled by its shootout, not left a
    # draw. Then build the rows, resolving each later round's "W##"/"L##" feeder refs
    # to the real qualifier as soon as that tie has a winner (the upstream feed only
    # fills a slot in once the feeder was won in regulation, so penalty winners would
    # otherwise never reach the next round).
    decided_by_num = {}   # _num -> computed score/decision fields
    winner_of = {}        # _num -> winning team name
    loser_of = {}         # _num -> losing team name
    for m in matches_in:
        score = m.get("score") or {}
        ft, ht, et, pen = score.get("ft"), score.get("ht"), score.get("et"), score.get("p")
        played = 1 if ft else 0
        t1, t2 = m.get("team1", ""), m.get("team2", "")
        fs = et or ft                       # final scoreline (after extra time if any)
        s1, s2 = (fs[0], fs[1]) if fs else (None, None)
        h1, h2 = (ht[0], ht[1]) if ht else (None, None)
        p1, p2 = (pen[0], pen[1]) if pen else (None, None)
        result = winner = decided = ""
        if played:
            if pen and p1 != p2:            # penalty shootout settles a level tie
                result, decided = ("1" if p1 > p2 else "2"), "PENS"
            elif s1 > s2:
                result, decided = "1", ("AET" if et else "FT")
            elif s2 > s1:
                result, decided = "2", ("AET" if et else "FT")
            else:
                result, decided = "X", ("AET" if et else "FT")   # genuine draw (groups)
            winner = t1 if result == "1" else t2 if result == "2" else ""
            if winner:
                winner_of[m["_num"]] = winner
                loser_of[m["_num"]] = t2 if result == "1" else t1
        decided_by_num[m["_num"]] = {
            "played": played, "s1": s1, "s2": s2, "h1": h1, "h2": h2,
            "p1": p1, "p2": p2, "result": result, "winner": winner, "decided": decided,
        }

    def _resolve(name):
        """Turn a "W##"/"L##" feeder ref into the real qualifier once that tie is
        decided; leave it as a ref while the feeder is still unplayed."""
        seen = set()
        while _is_ref(name) and name not in seen:
            seen.add(name)
            n = int(name[1:])
            repl = winner_of.get(n) if name[0] == "W" else loser_of.get(n)
            if not repl:
                break
            name = repl
        return name

    matches = []
    for m in matches_in:
        r = m["round"]
        stage = "Knockout" if r in _KO else "Group"
        c = decided_by_num[m["_num"]]
        played, result, decided = c["played"], c["result"], c["decided"]
        s1, s2, p1, p2, h1, h2 = c["s1"], c["s2"], c["p1"], c["p2"], c["h1"], c["h2"]
        t1, t2 = _resolve(m.get("team1", "")), _resolve(m.get("team2", ""))
        winner = _resolve(c["winner"])
        if played:
            scoreline = f"{s1}–{s2}"
            if decided == "PENS":
                scoreline += f" ({p1}–{p2} pens)"
            elif decided == "AET":
                scoreline += " (a.e.t.)"
        else:
            scoreline = ""
        st = stadiums.get(m.get("ground", ""), {})
        matches.append({
            "num": m["_num"], "stage": stage, "round": r,
            "round_short": _ROUND_SHORT.get(r, r), "round_order": _round_order(r),
            "date": m["date"], "time": m.get("time", ""),
            "kickoff_utc": _kickoff_utc(m["date"], m.get("time", "")),
            "team1": t1, "team2": t2,
            "team1_label": _team_label(t1), "team2_label": _team_label(t2),
            "code1": code(t1), "code2": code(t2), "flag1": flag(t1), "flag2": flag(t2),
            "group": m.get("group", ""),
            "score1": s1, "score2": s2, "ht1": h1, "ht2": h2,
            "pen1": p1, "pen2": p2, "decided": decided,
            "total_goals": (s1 + s2) if played else None,
            "result": result, "winner": winner, "played": played,
            "ground": m.get("ground", ""), "stadium": st.get("stadium", ""),
            "country": st.get("country", ""),
            "scoreline": scoreline,
            "matchup": (f"{t1} vs {t2}" if stage == "Group"
                        else f"{_team_label(t1)} vs {_team_label(t2)}"),
        })

    # ---- goals ---- (all played matches, group + knockout, so live scorer /
    # heatmap stats keep growing as the elimination rounds are played)
    goals = []
    for m in matches_in:
        t1, t2 = m["team1"], m["team2"]
        for side, team, opp in ((1, t1, t2), (2, t2, t1)):
            for g in (m.get(f"goals{side}") or []):
                bm = _base_minute(g.get("minute"))
                goals.append({
                    "match_num": m["_num"], "date": m["date"], "round": m["round"],
                    "group": m.get("group", ""), "ground": m.get("ground", ""),
                    "team": team, "opponent": opp, "code": code(team),
                    "flag": flag(team), "confed": confed(team),
                    "player": g.get("name", ""), "minute": str(g.get("minute")),
                    "minute_num": bm, "bucket": _bucket(bm),
                    "penalty": 1 if g.get("penalty") else 0,
                    "owngoal": 1 if g.get("owngoal") else 0,
                })

    # ---- standings (computed) ----
    stand = {}
    for g in groups["groups"]:
        for t in g["teams"]:
            stand[t] = {"group": g["name"], "team": t, "code": code(t), "flag": flag(t),
                        "confed": confed(t), "played": 0, "won": 0, "drawn": 0,
                        "lost": 0, "gf": 0, "ga": 0, "points": 0}
    for m in matches_in:
        if not m["round"].startswith("Matchday"):
            continue
        ft = (m.get("score") or {}).get("ft")
        if not ft:
            continue
        for team, gf, ga in ((m["team1"], ft[0], ft[1]), (m["team2"], ft[1], ft[0])):
            s = stand[team]
            s["played"] += 1
            s["gf"] += gf
            s["ga"] += ga
            if gf > ga:
                s["won"] += 1
                s["points"] += 3
            elif gf == ga:
                s["drawn"] += 1
                s["points"] += 1
            else:
                s["lost"] += 1
    standings = []
    by_group = defaultdict(list)
    for s in stand.values():
        s["gd"] = s["gf"] - s["ga"]
        by_group[s["group"]].append(s)
    for rows in by_group.values():
        rows.sort(key=lambda s: (-s["points"], -s["gd"], -s["gf"], s["team"]))
        for rank, s in enumerate(rows, start=1):
            s["rank"] = rank
            s["advanced"] = 1 if s["team"] in advanced else 0
            s["status"] = "Advanced" if s["team"] in advanced else "Eliminated"
            standings.append(s)

    # ---- stadiums (+ hosting stats) ----
    host = defaultdict(lambda: {"matches": 0, "goals": 0})
    for mm in matches:
        if mm["ground"]:
            host[mm["ground"]]["matches"] += 1
            if mm["played"]:
                host[mm["ground"]]["goals"] += mm["total_goals"]
    stad_rows = []
    for city, st in stadiums.items():
        hs = host.get(city, {"matches": 0, "goals": 0})
        stad_rows.append({**st, "matches_hosted": hs["matches"], "goals_hosted": hs["goals"]})

    # ---- teams ----
    team_rows = []
    for t in teams_raw:
        nm = t["name"]
        s = stand.get(nm, {})
        team_rows.append({
            "name": nm, "code": t.get("fifa_code", ""), "flag": t.get("flag_icon", ""),
            "continent": t.get("continent", ""), "confed": t.get("confed", ""),
            "group": t.get("group", ""), "group_name": f"Group {t.get('group', '')}",
            "advanced": 1 if nm in advanced else 0,
            "status": "Advanced" if nm in advanced else "Eliminated",
            "gf": s.get("gf", 0), "ga": s.get("ga", 0), "points": s.get("points", 0),
        })

    return {
        "matches": (matches, list(matches[0].keys()),
                    ["num", "round_order", "score1", "score2", "ht1", "ht2",
                     "pen1", "pen2", "total_goals", "played"]),
        "goals": (goals, list(goals[0].keys()) if goals else
                  ["match_num", "date", "round", "group", "ground", "team", "opponent",
                   "code", "flag", "confed", "player", "minute", "minute_num", "bucket",
                   "penalty", "owngoal"],
                  ["match_num", "minute_num", "penalty", "owngoal"]),
        "standings": (standings, ["group", "rank", "team", "code", "flag", "confed",
                      "played", "won", "drawn", "lost", "gf", "ga", "gd", "points",
                      "advanced", "status"],
                      ["rank", "played", "won", "drawn", "lost", "gf", "ga", "gd",
                       "points", "advanced"]),
        "stadiums": (stad_rows, ["city", "stadium", "country", "cc", "capacity", "lat",
                     "lon", "timezone", "matches_hosted", "goals_hosted"],
                     ["capacity", "matches_hosted", "goals_hosted"]),
        "teams": (team_rows, list(team_rows[0].keys()),
                  ["advanced", "gf", "ga", "points"]),
    }


# --------------------------------------------------------------------------- #
# Connector                                                                    #
# --------------------------------------------------------------------------- #
@register_connector("worldcup")
class WorldCupConnector(DuckDBConnector):
    """In-memory DuckDB rebuilt from the live openfootball feed (with a TTL)."""

    def _setup(self) -> None:
        super()._setup()              # no-op unless csv_views are configured
        self._build()
        self._built_at = time.monotonic()

    def _build(self) -> None:
        base = self.config.get("base_url", DEFAULT_BASE)
        frames = build_frames(base)
        for name, (rows, columns, int_cols) in frames.items():
            df = pd.DataFrame(rows, columns=columns)
            for c in int_cols:
                if c in df.columns:
                    df[c] = df[c].astype("Int64")
            src = f"_src_{name}"
            self._con.register(src, df)
            self._con.execute(f'CREATE OR REPLACE TABLE "{name}" AS SELECT * FROM "{src}"')
            self._con.unregister(src)
        log.info("worldcup: built tables from %s", base)

    def _maybe_refresh(self) -> None:
        try:
            ttl = float(self.config.get("refresh_ttl", 180) or 0)
        except (TypeError, ValueError):
            ttl = 180.0
        if ttl <= 0:
            return
        if time.monotonic() - getattr(self, "_built_at", 0) < ttl:
            return
        with self._lock:
            if time.monotonic() - self._built_at < ttl:
                return
            try:
                self._build()
            except Exception as e:  # keep serving cached data if upstream blips
                log.warning("worldcup: refresh failed, keeping cached tables: %s", e)
            self._built_at = time.monotonic()

    def query(self, sql: str):
        self._maybe_refresh()
        return super().query(sql)
