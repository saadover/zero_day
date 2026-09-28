# Pick For Me

Can't choose between two things? Write both options and the app asks only the
questions that matter for that choice. Pizza or burger gets asked about diet
and mood, not religion. Beer or juice does get asked about religion. Then it
picks one, with bullet points saying why and what the other option had going
for it. Jev is never named in the app.

Answers about the person (age, diet, religion, work…) are saved on the phone
and not asked again; answers about one decision (mood, timing, who's coming)
are asked each time. **Forget** on the first screen clears them.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository again.
2. Set **Root Directory** to `pick-for-me`.
3. Under **Environment Variables**, add `TYPESAFE_API_KEY` with your TypeSafe key.
4. Click **Deploy**.

The key stays on the server (`api/decide.js`) and is never sent to the phone.

## Put it on your iPhone

Open the Vercel link in Safari, tap **Share**, then **Add to Home Screen**. It
opens full screen with its own icon, like an App Store app.

## How it works

Every question the app can ask lives in `lib/questions.js`, with a note on when
it matters and the Jev question that compares the options on its answer.

1. `api/questions.js`: one Jev request (Score questions) rating how much each
   question would help with these two options. The most useful ones are asked,
   up to 6 and at least 2. Religion is asked only when Jev rates it essential.
2. `api/decide.js`: one Jev request (Choice questions): `pick`, plus one
   comparison per answered question and three general ones (long run,
   happiness, regret). Comparisons that favour the pick become the **Why**
   bullets; the rest are listed under what the other option had going for it.

Both use `lib/jev.js` (`POST https://api.typesafe.ai/v1/systemone`, model
`jev-latest`). Jev errors go to the Vercel logs; the app shows a plain message.
