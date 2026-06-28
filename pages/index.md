---
title: Tournament Pulse
sidebar_label: Overview
sidebar_position: 1
icon: "🏆"
---

<div class="wc-hero">
  <div class="wc-hero-flags">🇨🇦 🇺🇸 🇲🇽</div>
  <h1>FIFA World Cup 2026</h1>
  <p>The first 48-team World Cup — 104 matches across the United States, Canada and Mexico. The group stage is settled; the Round of 32 begins the single-elimination run to the Final at MetLife Stadium.</p>
  <span class="wc-chip">● LIVE — data refreshes from the openfootball feed</span>
</div>

:::query name=kpis connector=main
SELECT
  (SELECT count(*) FROM matches)                          AS matches_total,
  (SELECT sum(played) FROM matches)                       AS matches_played,
  (SELECT count(*) FROM goals)                            AS goals_total,
  (SELECT round(avg(total_goals), 2) FROM matches WHERE played = 1) AS avg_goals,
  (SELECT count(*) FROM teams)                            AS teams_total,
  (SELECT count(*) FROM teams WHERE advanced = 1)         AS teams_remaining,
  (SELECT count(DISTINCT player) FROM goals)              AS scorers
:::

<Grid cols=4>
  <Counter data={kpis} column="matches_played" label="Matches played" suffix=" / 104" color="primary" />
  <Counter data={kpis} column="goals_total" label="Goals scored" color="primary" />
  <Counter data={kpis} column="avg_goals" label="Goals per match" color="primary" />
  <Counter data={kpis} column="teams_remaining" label="Teams still standing" suffix=" / 48" color="primary" />
</Grid>

So far, <Value data={kpis} column="scorers" /> different players have found the net. Here is *when* every one of those <Value data={kpis} column="goals_total" /> goals arrived.

## ⏱️ Goal-timing heatmap

:::query name=goal_minutes connector=main
SELECT minute_num AS minute, count(*) AS goals
FROM goals
WHERE minute_num > 0
GROUP BY minute_num
ORDER BY minute_num
:::

<GoalHeatmap data={goal_minutes} minute="minute" value="goals" title="Goals by match minute — the late-game surge is real" />

## Golden Boot race & where the goals come from

:::query name=top_scorers connector=main
SELECT player, count(*) AS goals, sum(penalty) AS penalties
FROM goals
GROUP BY player
ORDER BY goals DESC, player
LIMIT 12
:::

:::query name=goals_by_confed connector=main
SELECT confed, count(*) AS goals
FROM goals
GROUP BY confed
ORDER BY goals DESC
:::

<Grid cols=2>
  <BarChart data={top_scorers} x="player" y="goals" horizontal sort_by="goals" title="Top scorers — Golden Boot race" col-span=1 height=380 />
  <PieChart data={goals_by_confed} x="confed" y="goals" title="Goals by confederation" col-span=1 height=380 />
</Grid>

## The rhythm of the tournament

:::query name=goals_by_day connector=main
SELECT CAST(date AS DATE) AS date, count(*) AS goals, count(DISTINCT match_num) AS matches
FROM goals
GROUP BY CAST(date AS DATE)
ORDER BY date
:::

<LineChart data={goals_by_day} x="date" y="goals" title="Goals per day — group stage" height=260 />

## ⚔️ Coming up — the elimination rounds

The knockout stage is straight single-elimination: lose once and you're out. The Round of 32 fixtures are set by the final group tables.

:::query name=upcoming connector=main
SELECT * FROM matches
WHERE stage = 'Knockout'
ORDER BY date, "time"
:::

<MatchTimeline data={upcoming} limit=12 empty_message="Knockout fixtures load once the groups conclude." />

[See the full bracket →](/knockout)

## Biggest statements of the group stage

:::query name=biggest_wins connector=main
SELECT
  round_short                              AS round,
  concat(flag1, ' ', team1)                AS home,
  concat(score1, '–', score2)              AS score,
  concat(team2, ' ', flag2)                AS away,
  abs(score1 - score2)                     AS margin,
  ground                                   AS venue
FROM matches
WHERE played = 1
ORDER BY margin DESC, total_goals DESC
LIMIT 8
:::

<Table data={biggest_wins} title="Largest winning margins" sort="margin desc" />
