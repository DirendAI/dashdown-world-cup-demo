---
title: Team profile
sidebar_label: Team profile
---

:::query name=team connector=main
SELECT * FROM teams WHERE code = '${code}'
:::

# <Value data={team} column="flag" /> <Value data={team} column="name" />

**<Value data={team} column="group_name" />** · <Value data={team} column="confed" /> · <Value data={team} column="continent" /> · status: **<Value data={team} column="status" />**

<Grid cols=3>
  <Counter data={team} column="points" label="Group points" color="primary" />
  <Counter data={team} column="gf" label="Goals for" color="primary" />
  <Counter data={team} column="ga" label="Goals against" color="primary" />
</Grid>

## Group table

:::query name=team_group connector=main
SELECT
  rank                      AS "#",
  concat(flag, '  ', team)  AS "Team",
  played                    AS "P",
  won                       AS "W",
  drawn                     AS "D",
  lost                      AS "L",
  gf                        AS "GF",
  ga                        AS "GA",
  gd                        AS "GD",
  points                    AS "Pts"
FROM standings
WHERE "group" = (SELECT group_name FROM teams WHERE code = '${code}')
ORDER BY rank
:::

<Table data={team_group} title="" />

## Results & fixtures

:::query name=team_matches connector=main
SELECT * FROM matches
WHERE code1 = '${code}' OR code2 = '${code}'
ORDER BY date, "time"
:::

<MatchTimeline data={team_matches} empty_message="No matches found for this nation." />

## Scorers

:::query name=team_goals connector=main
SELECT
  player        AS "Player",
  count(*)      AS "Goals",
  sum(penalty)  AS "Penalties"
FROM goals
WHERE code = '${code}'
GROUP BY player
ORDER BY count(*) DESC, player
:::

<Table data={team_goals} title="" empty_message="No group-stage goals recorded." />

[← Back to all teams](/teams)
