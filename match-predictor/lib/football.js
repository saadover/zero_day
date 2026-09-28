// Fetches a league's season from football-data.org and turns it into
// per-match facts (form, home/away records, streaks, table situation) that
// the page shows and Jev judges. Two requests per league: all matches of
// the current season, and the standings.

const BASE = process.env.FOOTBALLDATA_URL || "https://api.football-data.org/v4";

const LEAGUES = {
  PL: "Premier League",
  PD: "La Liga",
  FL1: "Ligue 1",
};

async function get(path, key) {
  const res = await fetch(BASE + path, { headers: { "X-Auth-Token": key } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error("football-data.org's per-minute limit was hit. Try again in a minute.");
    throw new Error("football-data.org: " + (body.message || "answered " + res.status + "."));
  }
  return body;
}

function team(t) {
  return { id: t.id, name: t.shortName || t.name, logo: t.crest || null };
}

// Result letter (W/D/L) for one team in a finished match.
function resultFor(teamId, m) {
  const home = m.homeTeam.id === teamId;
  const mine = home ? m.score.fullTime.home : m.score.fullTime.away;
  const theirs = home ? m.score.fullTime.away : m.score.fullTime.home;
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
  games.forEach((m) => {
    const home = m.homeTeam.id === teamId;
    r.scored += home ? m.score.fullTime.home : m.score.fullTime.away;
    r.conceded += home ? m.score.fullTime.away : m.score.fullTime.home;
    const x = resultFor(teamId, m);
    if (x === "W") r.won++;
    else if (x === "D") r.drawn++;
    else r.lost++;
  });
  return r;
}

// Where a team stands: position, points, and the gaps that drive motivation.
function tableSituation(teamId, table) {
  const row = table.find((r) => r.team.id === teamId);
  if (!row) return null;
  const leader = table[0];
  return {
    position: row.position,
    of: table.length,
    points: row.points,
    played: row.playedGames,
    goal_difference: row.goalDifference,
    points_behind_leader: leader.points - row.points,
    points_above_bottom_three: table.length >= 4 ? row.points - table[table.length - 3].points : null,
  };
}

// side is "home" or "away": where this team plays in the upcoming match.
function teamFacts(teamId, side, finished, table) {
  const games = finished
    .filter((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId)
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate));
  const atVenue = games.filter((m) => (side === "home" ? m.homeTeam : m.awayTeam).id === teamId);
  const letters = games.map((m) => resultFor(teamId, m));
  const venueLetters = atVenue.map((m) => resultFor(teamId, m));
  const run = currentRun(letters);
  const venueRun = currentRun(venueLetters);
  return {
    form_last5: letters.slice(0, 5).join(""),
    [side + "_form_last5"]: venueLetters.slice(0, 5).join(""),
    season_record: record(teamId, games),
    [side + "_record"]: record(teamId, atVenue),
    streaks: [run && run + " games", venueRun && venueRun + " " + side + " games"].filter(Boolean),
    table: tableSituation(teamId, table),
  };
}

async function buildLeague(code, key) {
  const all = await get("/competitions/" + code + "/matches", key);
  const standings = await get("/competitions/" + code + "/standings", key);
  const matches = all.matches || [];
  const total = (standings.standings || []).find((s) => s.type === "TOTAL");
  const table = total ? total.table : [];

  const finished = matches.filter((m) => m.status === "FINISHED" && m.score && m.score.fullTime.home != null);
  const upcoming = matches
    .filter((m) => m.status === "SCHEDULED" || m.status === "TIMED")
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(0, 10);
  const startYear = Number(((all.resultSet && all.resultSet.first) || (standings.season && standings.season.startDate) || "").slice(0, 4));

  return {
    league: { id: code, name: LEAGUES[code], season: startYear || null },
    updated: new Date().toISOString(),
    upcoming: upcoming.map((m) => {
      const h = m.homeTeam.id;
      const a = m.awayTeam.id;
      const h2h = finished
        .filter((g) => (g.homeTeam.id === h && g.awayTeam.id === a) || (g.homeTeam.id === a && g.awayTeam.id === h))
        .map((g) => team(g.homeTeam).name + " " + g.score.fullTime.home + "-" + g.score.fullTime.away + " " + team(g.awayTeam).name);
      return {
        id: m.id,
        date: m.utcDate,
        round: m.matchday ? "Matchday " + m.matchday : null,
        venue: m.venue || null,
        home: team(m.homeTeam),
        away: team(m.awayTeam),
        facts: {
          home: teamFacts(h, "home", finished, table),
          away: teamFacts(a, "away", finished, table),
          head_to_head_this_season: h2h,
        },
      };
    }),
    results: finished
      .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
      .slice(0, 30)
      .map((m) => ({
        id: m.id,
        date: m.utcDate,
        home: team(m.homeTeam),
        away: team(m.awayTeam),
        goals: { home: m.score.fullTime.home, away: m.score.fullTime.away },
      })),
    table: table.map((r) => ({
      position: r.position,
      team: team(r.team),
      played: r.playedGames,
      points: r.points,
      goal_difference: r.goalDifference,
      form: recentForm(r.team.id, finished),
    })),
  };
}

function recentForm(teamId, finished) {
  return finished
    .filter((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId)
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 5)
    .map((m) => resultFor(teamId, m))
    .reverse()
    .join("");
}

module.exports = { LEAGUES, buildLeague, currentRun };
