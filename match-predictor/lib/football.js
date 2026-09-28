// Fetches fixtures, results, standings and injuries from API-Football and
// turns them into per-match facts (form, home/away records, streaks,
// absences) that the page shows and Jev judges.

const BASE = process.env.APIFOOTBALL_URL || "https://v3.football.api-sports.io";

const LEAGUES = {
  39: "Premier League",
  140: "La Liga",
  61: "Ligue 1",
};

// API-Football names seasons by their starting year (2026-27 is 2026).
function currentSeason(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function get(path, params, key) {
  const res = await fetch(BASE + path + "?" + new URLSearchParams(params), {
    headers: { "x-apisports-key": key },
  });
  if (!res.ok) throw new Error("API-Football answered " + res.status + ".");
  const body = await res.json();
  const errors = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
  if (errors && errors.length) throw new Error("API-Football: " + errors.join(" "));
  return body.response || [];
}

function team(t) {
  return { id: t.id, name: t.name, logo: t.logo };
}

// Result letter (W/D/L) for one team in a finished fixture.
function resultFor(teamId, f) {
  const home = f.teams.home.id === teamId;
  const mine = home ? f.goals.home : f.goals.away;
  const theirs = home ? f.goals.away : f.goals.home;
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}

// Describes the run a team is currently on, e.g. "Lost the last 3".
function currentRun(letters) {
  if (!letters.length) return null;
  const first = letters[0];
  let same = 0;
  while (same < letters.length && letters[same] === first) same++;
  let unbeaten = 0;
  while (unbeaten < letters.length && letters[unbeaten] !== "L") unbeaten++;
  let winless = 0;
  while (winless < letters.length && letters[winless] !== "W") winless++;
  if (same >= 3) return (first === "W" ? "Won" : first === "L" ? "Lost" : "Drew") + " the last " + same;
  if (unbeaten >= 4) return "Unbeaten in the last " + unbeaten;
  if (winless >= 4) return "Without a win in the last " + winless;
  return null;
}

function record(teamId, games) {
  const r = { played: games.length, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };
  games.forEach((f) => {
    const home = f.teams.home.id === teamId;
    r.scored += home ? f.goals.home : f.goals.away;
    r.conceded += home ? f.goals.away : f.goals.home;
    const x = resultFor(teamId, f);
    if (x === "W") r.won++;
    else if (x === "D") r.drawn++;
    else r.lost++;
  });
  return r;
}

// side is "home" or "away": the venue this team plays at in the upcoming match.
function teamFacts(teamId, side, finished, table, absent) {
  const games = finished
    .filter((f) => f.teams.home.id === teamId || f.teams.away.id === teamId)
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);
  const atVenue = games.filter((f) => f.teams[side].id === teamId);
  const letters = games.map((f) => resultFor(teamId, f));
  const venueLetters = atVenue.map((f) => resultFor(teamId, f));
  const row = table.find((r) => r.team.id === teamId);
  const run = currentRun(letters);
  const venueRun = currentRun(venueLetters);
  return {
    form_last5: letters.slice(0, 5).join(""),
    [side + "_form_last5"]: venueLetters.slice(0, 5).join(""),
    season_record: record(teamId, games),
    [side + "_record"]: record(teamId, atVenue),
    streaks: [run && run + " games", venueRun && venueRun + " " + side + " games"].filter(Boolean),
    table: row
      ? {
          position: row.rank,
          of: table.length,
          points: row.points,
          played: row.all.played,
          goal_difference: row.goalsDiff,
          zone: row.description || null,
        }
      : null,
    absent,
  };
}

async function buildLeague(leagueId, key) {
  const season = currentSeason();
  const finished = await get("/fixtures", { league: leagueId, season, status: "FT-AET-PEN" }, key);
  const upcoming = await get("/fixtures", { league: leagueId, season, next: 10 }, key);
  const standings = await get("/standings", { league: leagueId, season }, key);
  const table = standings.length ? [].concat(...standings[0].league.standings) : [];
  const ids = upcoming.slice(0, 20).map((f) => f.fixture.id);
  const injuries = ids.length ? await get("/injuries", { ids: ids.join("-") }, key) : [];

  const absentFor = (fixtureId, teamId) =>
    injuries
      .filter((i) => i.fixture.id === fixtureId && i.team.id === teamId)
      .map((i) => ({ player: i.player.name, status: i.player.type, reason: i.player.reason }));

  return {
    league: { id: leagueId, name: LEAGUES[leagueId], season },
    updated: new Date().toISOString(),
    upcoming: upcoming.map((f) => {
      const h = f.teams.home.id;
      const a = f.teams.away.id;
      const h2h = finished
        .filter((g) => [g.teams.home.id, g.teams.away.id].sort().join() === [h, a].sort().join())
        .map((g) => g.teams.home.name + " " + g.goals.home + "-" + g.goals.away + " " + g.teams.away.name);
      return {
        id: f.fixture.id,
        date: f.fixture.date,
        round: f.league.round,
        venue: f.fixture.venue && f.fixture.venue.name,
        home: team(f.teams.home),
        away: team(f.teams.away),
        facts: {
          home: teamFacts(h, "home", finished, table, absentFor(f.fixture.id, h)),
          away: teamFacts(a, "away", finished, table, absentFor(f.fixture.id, a)),
          head_to_head_this_season: h2h,
        },
      };
    }),
    results: finished
      .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
      .slice(0, 30)
      .map((f) => ({
        id: f.fixture.id,
        date: f.fixture.date,
        home: team(f.teams.home),
        away: team(f.teams.away),
        goals: f.goals,
      })),
    table: table.map((r) => ({
      position: r.rank,
      team: team(r.team),
      played: r.all.played,
      points: r.points,
      goal_difference: r.goalsDiff,
      form: r.form,
      zone: r.description || null,
    })),
  };
}

module.exports = { LEAGUES, currentSeason, buildLeague, resultFor, currentRun };
