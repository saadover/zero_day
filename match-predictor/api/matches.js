// GET /api/matches?league=39 — upcoming fixtures with facts, recent results
// and the table for one league. Vercel's edge cache keeps each answer for
// 6 hours, so visitors share one set of API-Football requests (4 per league).

const { LEAGUES, buildLeague } = require("../lib/football.js");

module.exports = async function handler(req, res) {
  const league = Number(req.query.league);
  if (!LEAGUES[league]) {
    res.status(400).json({ error: "Unknown league. Use one of: " + Object.keys(LEAGUES).join(", ") + "." });
    return;
  }
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) {
    res.status(503).json({ error: "The APIFOOTBALL_KEY setting is missing on the server." });
    return;
  }
  try {
    const data = await buildLeague(league, key);
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: e.message });
  }
};
