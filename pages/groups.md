---
title: Group Stage
sidebar_label: Group Stage
sidebar_position: 2
icon: "🅰️"
---

# Group Stage

Twelve groups of four. The top two of every group plus the eight best third-placed
teams advance to the Round of 32 — **32 of 48** nations survive. Pick a group to
focus the standings and fixtures below.

:::query name=group_list connector=main
SELECT DISTINCT "group" FROM standings ORDER BY "group"
:::

<Dropdown name="grp" data={group_list} column="group" label="Group" />

:::query name=standings_view connector=main
SELECT
  "group"                       AS "Group",
  rank                          AS "#",
  concat(flag, '  ', team)      AS "Team",
  played                        AS "P",
  won                           AS "W",
  drawn                         AS "D",
  lost                          AS "L",
  gf                            AS "GF",
  ga                            AS "GA",
  gd                            AS "GD",
  points                        AS "Pts",
  status                        AS "Status"
FROM standings
WHERE ('${grp}' = '' OR "group" = '${grp}')
ORDER BY "group", rank
:::

<Table data={standings_view} title="Standings" heatmap="GD" heatmap_scheme="diverging" sort="Group" page-size="24" />

## Goals & fixtures

:::query name=goals_by_group connector=main
SELECT "group" AS grp, count(*) AS goals,
       round(count(*) * 1.0 / count(DISTINCT match_num), 2) AS per_match
FROM goals
WHERE "group" <> ''
GROUP BY "group"
ORDER BY "group"
:::

<Grid cols=2>
  <BarChart data={goals_by_group} x="grp" y="goals" title="Goals scored by group" sort_by="grp" col-span=1 height=320 />
  <BarChart data={goals_by_group} x="grp" y="per_match" title="Goals per match by group" sort_by="grp" color="#FFC72C" col-span=1 height=320 />
</Grid>

## Match-by-match

:::query name=group_matches connector=main
SELECT * FROM matches
WHERE stage = 'Group' AND ('${grp}' = '' OR "group" = '${grp}')
ORDER BY date, "time"
:::

Select a single group above to see just its six fixtures; otherwise this is the
full 72-match group stage in chronological order.

<MatchTimeline data={group_matches} empty_message="No fixtures for this group." />
