# Domain Scout

Paste a list of domain names and get a **Buy / Maybe / Skip** call for each one,
with the reasons behind it.

Open `index.html` in any web browser. Nothing to install.

## How it scores a name

- **Brandability**: short, clean, memorable names score higher.
- **Easy to say**: passes the radio test (no long consonant runs, hyphens or numbers).
- **Extension**: .com is strongest, then .ai, .io, .co and others.
- **Real words**: one or two dictionary words beat coined names.

Sliders set how much each factor counts. A name that contains a famous brand is
always a Skip because of trademark risk.

## Demo scoring

The judgments currently come from simple built-in rules. They are meant to be
replaced by TypeSafe's Jev model once an API key and network access are set up.
Jev calls must run on a server so the API key stays private.
