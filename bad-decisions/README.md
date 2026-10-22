# BadDecisions

An Android app for Google Play. You write two options, and it picks one for you
with how sure it is, the reasons why, and what the other option had going for it.
You can share the verdict as a story picture, ask your friends, and later mark
whether it was a good call.

| Folder | What it is |
|---|---|
| `app/` | The Android app (Capacitor 8). The screens are in `app/www/`; `app/android/` is the Android Studio project. |
| `server/` | A tiny server on Vercel that keeps your TypeSafe key secret and asks the AI. The app calls it. |
| `store-listing/` | Icon, feature graphic, screenshots and text for the Play Store page. |

Why a server at all: the AI needs your secret `TYPESAFE_API_KEY`. Anything inside
an app can be pulled out of the download, so the key lives on the server and the
app only ever talks to the server. Users never see it.

## 1. Put the server online (Vercel, free)

1. In Vercel: **Add New → Project** → import the `zero_day` repository.
2. Set **Root Directory** to `bad-decisions/server`.
3. Under **Environment Variables**, add `TYPESAFE_API_KEY` with your TypeSafe key.
4. Click **Deploy** and copy the address, e.g. `https://bad-decisions-xyz.vercel.app`.

Check it: opening the address shows the BadDecisions page, and `/privacy` shows the
privacy policy (Google Play asks for that link).

## 2. Point the app at the server

Put the address in `app/www/config.js` (`apiBase` and `privacyLink`), then rebuild
the Play file (step 4). This step matters: the app can't decide anything until it
knows where the server is.

## 3. Publish on Google Play

1. Create a developer account at [play.google.com/console](https://play.google.com/console) ($25 once).
2. **Create app** → name *BadDecisions*, App, Free.
3. **Test and release**: upload `app-release.aab`. Keep **Play App Signing** on
   (the default): Google holds the final signing key, and your upload key
   (`baddecisions-upload.jks`) only proves uploads come from you.
4. Personal developer accounts created after November 2023 must first run a
   **closed test with at least 12 testers for 14 days** before they can publish
   to everyone. Organisation accounts can go straight to production.
5. Fill in **Store listing** from `store-listing/listing.md` and its images.
6. **App content**:
   - Privacy policy: `https://<your-server>/privacy`
   - Ads: **No ads**
   - App access: **All functionality is available without special access**
   - Target audience: **13 and over** (the privacy policy says it isn't made for children)
   - Content rating questionnaire: Category **Utility/Productivity/Other**, answer
     **No** to violence, sexual content, gambling, user-to-user chat etc.
   - Data safety, see below.

### Data safety answers

- Does the app collect or share user data? **Yes** (it sends what you type to the server).
- Is all data encrypted in transit? **Yes** (HTTPS).
- Can users request deletion? The server keeps nothing; answers stay on the
  phone and **Settings → Delete my data** removes them.
- Data types, each **Collected**, **not shared**, **processed ephemerally**,
  purpose **App functionality**:
  - *Personal info → Political or religious beliefs* (optional)
  - *Personal info → Other info*: age (optional)
  - *Financial info → Other financial info*: the "money situation" answer (optional)
  - *App activity → Other user-generated content*: the options and notes typed in (required)

The AI service (TypeSafe) processes the request for you as a service provider,
which Play does not count as sharing.

## 4. Rebuild the Play file

Needs Node 20+, JDK 21 and the Android SDK (or Android Studio).

```
cd bad-decisions/app
npm install
npm run bundle
```

The signed file lands in `app/android/app/build/outputs/bundle/release/app-release.aab`.
Signing reads `app/android/keystore.properties`, which is not in git:

```
storeFile=/full/path/to/baddecisions-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

For every new upload, raise `versionCode` (and `versionName`) in
`app/android/app/build.gradle`. Play rejects a versionCode it has seen before.

**Keep `baddecisions-upload.jks` and its password safe and out of git.** If you
lose it, you can ask Google to reset the upload key in Play Console, but that
takes a few days.
