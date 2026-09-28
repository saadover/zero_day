# Kickoff Call

Upcoming Premier League, La Liga and Ligue 1 matches with form, home and away
records, streaks and table situation, from football-data.org's free plan
(which has no injury data). Press **Predict** on a
match and TypeSafe's Jev model calls home win, draw or away win, with a
percentage for each.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository again.
2. Set **Root Directory** to `match-predictor`.
3. Add two **Environment Variables**:
   - `FOOTBALLDATA_KEY`: your football-data.org key
   - `TYPESAFE_API_KEY`: your TypeSafe key
4. Click **Deploy**.

## Request budget

- `api/matches.js` makes 2 football-data.org requests per league (all of the
  season's matches, and the standings). Vercel's edge cache keeps each
  league's answer for 6 hours, so everyone who opens the site shares them.
- `api/predict.js` makes one Jev request per press of Predict. Predictions are
  saved in the browser, and finished matches are checked against them to show
  Jev's hit rate.
