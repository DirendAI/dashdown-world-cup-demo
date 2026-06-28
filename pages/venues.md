---
title: Host Cities & Venues
sidebar_label: Host Cities
sidebar_position: 5
icon: "📍"
---

# 16 Stadiums, 3 Nations

The tournament is staged across sixteen venues in the United States, Canada and Mexico —
from Estadio Azteca's altitude to the 94,000-seat AT&T Stadium in Arlington.

:::query name=venue_kpis connector=main
SELECT
  count(*)             AS venues,
  sum(capacity)        AS total_capacity,
  max(capacity)        AS biggest,
  sum(matches_hosted)  AS matches
FROM stadiums
:::

<Grid cols=4>
  <Counter data={venue_kpis} column="venues" label="Stadiums" color="primary" />
  <Counter data={venue_kpis} column="total_capacity" label="Total seats" format="number" color="primary" />
  <Counter data={venue_kpis} column="biggest" label="Largest venue" format="number" color="primary" />
  <Counter data={venue_kpis} column="matches" label="Matches staged" color="primary" />
</Grid>

## Where the games are played

:::query name=country_matches connector=main
SELECT country, count(*) AS matches
FROM matches
WHERE country <> ''
GROUP BY country
ORDER BY matches DESC
:::

:::query name=venue_points connector=main
SELECT stadium, city, country, capacity, lat, lon, matches_hosted, goals_hosted
FROM stadiums
ORDER BY capacity DESC
:::

<Grid cols=2>
  <MapChart data={country_matches} location="country" value="matches" map="world" title="Matches by host nation" col-span=1 height=360 />
  <ScatterChart data={venue_points} x="lon" y="lat" series="country" title="Venue map (longitude × latitude)" col-span=1 height=360 />
</Grid>

## Capacity & usage

:::query name=venue_capacity connector=main
SELECT stadium AS venue, city, capacity, matches_hosted, goals_hosted
FROM stadiums
ORDER BY capacity DESC
:::

<BarChart data={venue_capacity} x="venue" y="capacity" horizontal sort_by="capacity" title="Seating capacity by venue" format="number" height=460 />

<Grid cols=2>
  <BarChart data={venue_capacity} x="venue" y="matches_hosted" horizontal sort_by="matches_hosted" title="Matches hosted" col-span=1 height=460 />
  <BarChart data={venue_capacity} x="venue" y="goals_hosted" horizontal sort_by="goals_hosted" color="#FFC72C" title="Goals witnessed (group stage)" col-span=1 height=460 />
</Grid>

## Every venue

:::query name=venue_table connector=main
SELECT
  stadium        AS "Stadium",
  city           AS "City",
  country        AS "Country",
  capacity       AS "Capacity",
  matches_hosted AS "Matches",
  goals_hosted   AS "Goals"
FROM stadiums
ORDER BY capacity DESC
:::

<Table data={venue_table} title="Host venues" sort="Capacity desc" format="Capacity=number" search />
