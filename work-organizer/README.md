# Work Organizer

A shared workspace for a small team: tasks, views, board, calendar, an Urgent/Important grid,
a daily checklist, meeting notes, PDF attachments, live sync between everyone, and email +
desktop reminders. Runs free on **Supabase** (database, logins, live sync, files) and
**Vercel** (hosting).

## What's inside

| Area | Highlights |
|---|---|
| Tasks | Status, priority, assignees (several people), given by, category, colour tags, do date, deadline, follow-up date/person, notes, subtasks, "blocked by", PDFs, "remind me" |
| Views | Today · Overdue · This week · Follow-ups · To assign · My tasks · Everyone · Done · All — each with a filter bar (pick the date field and any range: today, this/next week, next 7 days, this/next month, before today, custom) |
| Layouts | List (group by status/priority/person/category/tag), Board (drag between columns), Calendar (drag to reschedule), Urgent/Important grid |
| Sorting | Automatic **urgency score** (priority + how close/late the deadline is + blocked/waiting) |
| Speed | Type tasks in plain English: `Send budget to Karim fri !high #finance @lina` · `N` new task · `Ctrl K` search everything · `g d` / `g t` / `g b` / `g c` jump around |
| Team | Everyone has equal rights. Any member can create logins for new people (temporary password → they pick their own) |
| Live | Changes appear instantly for everyone; see who's online and who else is looking at the same task |
| Checklist | Shared team items (shows who ticked what, when) + private personal items, fresh every day, history kept |
| Meetings | Agenda · Notes · Decisions · Action items (→ one click makes a task) · linked tasks · PDFs |
| Reminders | Morning summary, high-priority-due-tomorrow, overdue, follow-up day, assigned to you, "remind me" times — by email (to any address you choose) and desktop pop-ups, with quiet hours |
| Backup | Export tasks as CSV (opens in Excel) or everything as JSON |

---

## Setup (about 20 minutes, one time)

### 1. Supabase — database

1. Open your project at [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should say *Success*.
3. **Authentication → Sign In / Providers**: make sure **Allow new users to sign up** is **off**
   (only team members create logins). Keep **Email** enabled.

### 2. Supabase — your first login

1. **Authentication → Users → Add user → Create new user**.
2. Enter your email and password, tick **Auto Confirm User**, click **Create user**.
3. Change this password from **Settings** in the app after your first login.

### 3. Keys for desktop notifications

Run this once on any computer with Node.js (or ask Claude to generate them for you):

```bash
npx web-push generate-vapid-keys
```

Keep the **public** and **private** keys for the next step. The private key is a secret.

### 4. Email sending (Brevo, free: ~300 emails/day)

1. Create a free account at [brevo.com](https://www.brevo.com).
2. **Senders, domains & dedicated IPs → Senders → Add a sender**: add the email address reminders
   will come *from* (e.g. your work or Gmail address) and confirm it from your inbox.
3. **SMTP & API → API keys → Generate a new API key**. Copy it.

### 5. Vercel — hosting

1. At [vercel.com](https://vercel.com) → **Add New → Project** → import the `zero_day` GitHub repository.
2. **Root Directory**: click *Edit* and choose **`work-organizer`**. Framework preset: **Vite**.
3. **Environment Variables** — add all of these:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://zkanryltxtxtegoueqoi.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | your publishable key (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | Supabase → **Project Settings → API Keys → Secret keys** (`sb_secret_…`). **Never share this.** |
   | `VITE_VAPID_PUBLIC_KEY` | public key from step 3 |
   | `VAPID_PRIVATE_KEY` | private key from step 3 |
   | `BREVO_API_KEY` | API key from step 4 |
   | `MAIL_FROM_EMAIL` | the sender address you confirmed in Brevo |
   | `MAIL_FROM_NAME` | `Work Organizer` |
   | `CRON_SECRET` | any long random text, e.g. from a password generator |
   | `APP_URL` | your Vercel address, e.g. `https://work-organizer.vercel.app` (add after the first deploy, then redeploy) |

4. Click **Deploy**.

### 6. Supabase — point logins at your app

**Authentication → URL Configuration**: set **Site URL** to your Vercel address. This makes
"Forgot password?" emails link back to the app.

### 7. Turn on the reminder schedule

1. Open [`supabase/cron.sql`](supabase/cron.sql), replace `YOUR-APP-URL` and `YOUR-CRON-SECRET`.
2. Paste it into Supabase → **SQL Editor** → **Run**.

The reminder job now runs every 15 minutes (Vercel also runs it once a day as a backup).

### 8. Done

Log in, open **Settings → Notifications**, switch on **Desktop notifications on this device**, and
press **Send me a test notification**. Then go to **Team** to add your colleagues.

---

## Free-plan limits

- **Database**: 500 MB — years of tasks and notes.
- **PDF storage**: ~1 GB (10 MB per file). The meter on the **Team** page shows usage.
- **Pausing**: a Supabase project with no activity for 7 days is paused. Your data is safe; click
  **Restore** in the Supabase dashboard. Daily use (and the reminder job) keeps it awake.
- **Backups**: none automatic on the free plan — use **Team → Storage & backup → Export** now and then.

## Developing locally

```bash
cd work-organizer
cp .env.example .env.local   # fill in the VITE_ values
npm install
npm run dev
```

The `/api` functions run on Vercel; use `vercel dev` to run them locally.
