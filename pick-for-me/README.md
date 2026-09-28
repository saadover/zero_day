# Pick For Me

Can't choose between two things? Write both options, answer a few questions
(age, religion, what matters most, money situation, appetite for risk,
anything else), and TypeSafe's Jev model picks one for you, with bullet points
saying why and what the other option had going for it.

Your answers about yourself are saved on your phone, so the next decision only
asks for the two options.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository again.
2. Set **Root Directory** to `pick-for-me`.
3. Under **Environment Variables**, add `TYPESAFE_API_KEY` with your TypeSafe key.
4. Click **Deploy**.

The key stays on the server (`api/decide.js`) and is never sent to the phone.

## Put it on your iPhone

Open the Vercel link in Safari, tap **Share**, then **Add to Home Screen**. It
opens full screen with its own icon, like an App Store app.

## How Jev decides

`api/decide.js` makes one Jev request per decision
(`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) with nine
Choice questions:

- `pick`: which option the person should choose. Its probability is the
  "% sure" on the result screen.
- Eight factors, each answered "option 1", "option 2" or "even": what matters
  most to them, faith and values, age, money, risk, five years from now,
  day-to-day happiness, and regret. Factors where Jev's pick wins become the
  **Why** bullets; factors where the other option wins are listed under what
  it had going for it. Factors the person skipped are left out.
