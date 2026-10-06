# .si Checker

Paste a list of words and see which ones are available as `.si` domains.
Each word is looked up live with Arnes, the official .si registry: through
its RDAP service if IANA lists one for .si, otherwise through its WHOIS
service (`whois.register.si`, port 43). No API key is needed.

A name is marked **Available** only when the registry clearly says it has no
record of it. Unclear replies (for example a rate-limit message) show as
**Couldn't check** with the registry's message, and can be retried.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository.
2. Set **Root Directory** to `si-checker`.
3. Click **Deploy**. No environment variables are needed.

The page sends 25 words per request, and the server checks 3 at a time.
