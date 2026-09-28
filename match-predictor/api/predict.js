// POST /api/predict — asks Jev for a home win / draw / away win call on one
// match, from the facts /api/matches computed, and how much each side has to
// play for. Reads the key from TYPESAFE_API_KEY.

const API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

const MOTIVATION = [
  "Little at stake: safely mid-table with nothing left to win or lose.",
  "Normal league motivation: points matter but no pressing target.",
  "High stakes: chasing the title, a European place, or fighting relegation.",
];

function questions() {
  const q = {
    outcome: {
      type: "choice",
      instructions: {
        question:
          "Considering form, home and away records, streaks, table positions and head-to-head results " +
          "in `home` and `away`, what is the most likely full-time result of `match`? Injury and " +
          "suspension news is not included.",
      },
      criteria: {
        home_win: "The home team, `match.home`, wins.",
        draw: "The match ends level.",
        away_win: "The away team, `match.away`, wins.",
      },
    },
    home_motivation: {
      type: "score",
      instructions:
        "Given `home.table` (position, points behind the leader, points above the bottom three) and how far " +
        "the season has gone, how much does `match.home` have to play for?",
      criteria: MOTIVATION,
    },
    away_motivation: {
      type: "score",
      instructions:
        "Given `away.table` (position, points behind the leader, points above the bottom three) and how far " +
        "the season has gone, how much does `match.away` have to play for?",
      criteria: MOTIVATION,
    },
  };
  return q;
}

function level(answer) {
  const levels = Object.keys(answer.legend).map(Number).sort((a, b) => a - b);
  const nearest = String(levels.reduce((a, b) => (Math.abs(b - answer.score) < Math.abs(a - answer.score) ? b : a)));
  return answer.legend[nearest];
}

async function askJev(state, qs, key) {
  const body = JSON.stringify({ state, model: MODEL, questions: qs });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body,
    });
    if ((res.status === 429 || res.status === 529) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 401) throw new Error("TypeSafe rejected the API key. Check TYPESAFE_API_KEY.");
    if (!res.ok) throw new Error("TypeSafe answered " + res.status + ": " + (await res.text()).slice(0, 300));
    return (await res.json()).answers;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    res.status(503).json({ error: "The TYPESAFE_API_KEY setting is missing on the server." });
    return;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const m = body.match;
  if (!m || !m.home || !m.away || !m.facts || !m.facts.home || !m.facts.away) {
    res.status(400).json({ error: "Send the match as returned by /api/matches." });
    return;
  }

  const state = {
    match: { home: m.home.name, away: m.away.name, league: body.league, round: m.round, date: m.date, venue: m.venue },
    home: m.facts.home,
    away: m.facts.away,
    head_to_head_this_season: m.facts.head_to_head_this_season,
  };
  try {
    const a = await askJev(state, questions(), key);
    res.status(200).json({
      model: MODEL,
      outcome: { pick: a.outcome.choice, probabilities: a.outcome.probabilities, confidence: a.outcome.confidence },
      motivation: { home: level(a.home_motivation), away: level(a.away_motivation) },
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
