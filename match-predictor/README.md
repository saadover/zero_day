# Kickoff Call

Upcoming Premier League, La Liga and Ligue 1 matches with form, home and away
records, streaks, table positions and missing players. Press **Predict** on a
match and TypeSafe's Jev model calls home win, draw or away win, with a
percentage for each.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository again.
2. Set **Root Directory** to `match-predictor`.
3. Add two **Environment Variables**:
   - `APIFOOTBALL_KEY`: your API-Football key
   - `TYPESAFE_API_KEY`: your TypeSafe key
4. Click **Deploy**.

## Request budget

- `api/matches.js` makes 4 API-Football requests per league (finished
  fixtures, next 10 fixtures, standings, injuries). Vercel's edge cache keeps
  each league's answer for 6 hours, so viewing all three leagues costs at most
  about 48 of the free plan's 100 daily requests.
- `api/predict.js` makes one Jev request per press of Predict. Predictions are
  saved in the browser, and finished matches are checked against them to show
  Jev's hit rate.
