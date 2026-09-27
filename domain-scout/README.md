# Domain Scout

Paste a list of domain names and get a **Buy / Maybe / Skip** call for each one,
with the reasons behind it. Brandability, the radio test, trademark risk and the
likely buyer come from TypeSafe's Jev model. Extension and real words are worked
out by the page itself.

## Put it online with Vercel

1. Sign up at vercel.com with your GitHub account.
2. Add New → Project → import the `zero_day` repository.
3. Set **Root Directory** to `domain-scout`.
4. Under **Environment Variables**, add `TYPESAFE_API_KEY` with your TypeSafe key.
5. Click **Deploy**.

The key stays on the server (`api/evaluate.js`) and is never sent to the browser.

## Files

- `index.html`: the page. If Jev can't be reached, it falls back to built-in rules
  and says so in the badge at the top right.
- `api/evaluate.js`: the server function that asks Jev
  (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`). It asks four
  questions per domain: brand (Score), say (Score), trademark (Noul) and industry
  (Choice).
