---
title: Teams & Nations
sidebar_label: Teams
sidebar_position: 4
icon: "🌍"
---

# 48 Nations

The expanded field spans every confederation. Filter by confederation, then click any
row to open that nation's profile, results and scorers.

:::query name=confed_list connector=main
SELECT DISTINCT confed FROM teams ORDER BY confed
:::

<Dropdown name="confed" data={confed_list} column="confed" label="Confederation" />
<Search name="q" label="Find a nation" placeholder="Type a country…" />

:::query name=teams_view connector=main
SELECT
  code,
  concat(flag, '  ', name) AS "Nation",
  group_name               AS "Group",
  confed                   AS "Confed",
  gf                       AS "GF",
  ga                       AS "GA",
  points                   AS "Pts",
  status                   AS "Status"
FROM teams
WHERE ('${confed}' = '' OR confed = '${confed}')
  AND ('${q}' = '' OR name ILIKE '%' || '${q}' || '%')
ORDER BY points DESC, gf DESC, name
:::

<Table data={teams_view} title="All teams (click a row for the profile)" row_link="/teams/{code}" sort="Pts desc" page-size="16" />

## How the field breaks down

:::query name=by_confed connector=main
SELECT confed,
       count(*)            AS teams,
       sum(advanced)       AS advanced
FROM teams
GROUP BY confed
ORDER BY teams DESC
:::

:::query name=by_continent connector=main
SELECT continent, count(*) AS teams FROM teams GROUP BY continent ORDER BY teams DESC
:::

<Grid cols=2>
  <BarChart data={by_confed} x="confed" y="teams,advanced" title="Qualified vs still advancing, by confederation" col-span=1 height=320 />
  <TreemapChart data={by_continent} x="continent" y="teams" title="Nations by continent" col-span=1 height=320 />
</Grid>

## Attack vs defence — the group stage

Each dot is a nation: goals scored (up) against goals conceded (right). Teams in the
top-left scored freely and kept it tight; the survivors are coloured apart from the
eliminated.

:::query name=team_scatter connector=main
SELECT name, gf, ga, status, confed FROM teams ORDER BY name
:::

<ScatterChart data={team_scatter} x="ga" y="gf" series="status" title="Goals for vs goals against (group stage)" color="#159A52,#E4002B" height=380 />
