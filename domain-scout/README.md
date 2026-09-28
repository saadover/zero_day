# Domain Scout

Paste a list of names or domains. Domain Scout first checks which ones are still
unregistered, hides the taken ones, and only then asks TypeSafe's Jev model to
rate the available ones, so taken names cost no Jev usage. Each available name
gets a **Buy / Maybe / Skip** call with the reasons behind it.

A plain name like `zenpay` is checked as `zenpay.com` and `zenpay.ai`.

Availability comes from the registries' free RDAP lookups (via IANA's list of
RDAP servers), with whois as a fallback for .com and .ai. "Available" means
nobody has registered the name; a registry can still price it as premium.

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
  (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) after the
  availability check. It asks four questions per available domain: brand (Score),
  say (Score), trademark (Noul) and industry (Choice).
