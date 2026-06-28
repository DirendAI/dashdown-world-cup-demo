---
title: Knockout Bracket
sidebar_label: Knockout
sidebar_position: 3
icon: "⚔️"
---

# Elimination Rounds

From here it is straight knockout football: **lose once and you are out.** Thirty-two
nations enter the Round of 32 and a single one lifts the trophy at MetLife Stadium on
July 19. The bracket below is reconstructed live from the draw — later rounds show the
winner-of-match feeders until their ties are decided.

:::query name=ko_kpis connector=main
SELECT
  (SELECT count(*) FROM teams WHERE advanced = 1)                          AS in_the_hat,
  (SELECT count(*) FROM matches WHERE stage = 'Knockout')                  AS ko_matches,
  (SELECT count(*) FROM matches WHERE stage = 'Knockout' AND played = 1)   AS ko_played,
  (SELECT count(*) FROM teams WHERE status = 'Eliminated')                 AS already_out
:::

<Grid cols=4>
  <Counter data={ko_kpis} column="in_the_hat" label="Teams in the knockouts" color="primary" />
  <Counter data={ko_kpis} column="ko_matches" label="Elimination matches" color="primary" />
  <Counter data={ko_kpis} column="ko_played" label="…played so far" color="primary" />
  <Counter data={ko_kpis} column="already_out" label="Out after the group stage" color="primary" />
</Grid>

## 🏆 The bracket

:::query name=knockout connector=main
SELECT num, round, round_short, round_order, date, "time",
       team1, team2, team1_label, team2_label, flag1, flag2,
       score1, score2, played, ground, stadium
FROM matches
WHERE stage = 'Knockout'
ORDER BY round_order, num
:::

<Bracket data={knockout} title="Road to the Final — 32 nations, 31 matches, one survivor" />

## Who's still standing — and who's gone

Sixteen nations were eliminated in the group stage; thirty-two march on. As the
elimination rounds play out, every match halves the field again.

:::query name=cull connector=main
SELECT status, count(*) AS teams FROM teams GROUP BY status ORDER BY teams DESC
:::

:::query name=advanced_by_confed connector=main
SELECT confed,
       count(*) FILTER (WHERE advanced = 1) AS advanced,
       count(*) FILTER (WHERE advanced = 0) AS eliminated
FROM teams
GROUP BY confed
ORDER BY advanced DESC, confed
:::

<Grid cols=2>
  <PieChart data={cull} x="status" y="teams" color="#159A52,#E4002B" title="Field after the group stage" col-span=1 height=320 />
  <BarChart data={advanced_by_confed} x="confed" y="advanced,eliminated" stacked title="Advanced vs eliminated, by confederation" col-span=1 height=320 />
</Grid>

## 💔 Eliminated in the group stage

:::query name=eliminated connector=main
SELECT
  "group"                  AS "Group",
  concat(flag, '  ', team) AS "Nation",
  played                   AS "P",
  points                   AS "Pts",
  gf                       AS "GF",
  ga                       AS "GA",
  gd                       AS "GD"
FROM standings
WHERE status = 'Eliminated'
ORDER BY points DESC, gd DESC, gf DESC
:::

<Table data={eliminated} title="The sixteen nations heading home" sort="Pts desc" search />

## Knockout schedule

:::query name=ko_schedule connector=main
SELECT * FROM matches WHERE stage = 'Knockout' ORDER BY date, "time"
:::

<MatchTimeline data={ko_schedule} empty_message="Knockout fixtures are set once the groups conclude." />
