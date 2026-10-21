// Reminder job. Called every 15 minutes by Supabase (pg_cron → pg_net), and once a day by
// Vercel Cron as a backup. Protected by CRON_SECRET.
import { admin, appUrl, emailConfigured, emailHtml, emailText, sendEmail, sendPush } from './_lib.js';

const DAY = 86_400_000;

/** Local calendar date / time / weekday for a time zone. */
function localNow(tz) {
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  } catch {
    return localNow('UTC');
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday };
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const hm = (t) => (t ? String(t).slice(0, 5) : null);
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function isQuiet(p, now) {
  if (p.quiet_weekends && (now.weekday === 'Sat' || now.weekday === 'Sun')) return true;
  const s = hm(p.quiet_start); const e = hm(p.quiet_end);
  if (!s || !e || s === e) return false;
  return s < e ? now.time >= s && now.time < e : now.time >= s || now.time < e;
}

function fmtDay(d) {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default async function handlerFn(req, res) {
  // The job's password: stored in the database by supabase/cron.sql (no Vercel variable needed).
  // CRON_SECRET in Vercel, if set, also works (used by Vercel's own daily backup run).
  const auth = (req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');
  if (!auth) return res.status(401).json({ error: 'unauthorized' });
  let ok = false;
  const envSecret = (process.env.CRON_SECRET || '').trim();
  if (envSecret && auth === envSecret) ok = true;
  if (!ok) {
    try {
      const { data } = await admin().from('app_settings').select('value').eq('key', 'cron_secret').maybeSingle();
      ok = !!data?.value && data.value === auth;
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (!ok) return res.status(401).json({ error: 'unauthorized: run supabase/cron.sql again in Supabase' });

  try {
    const db = admin();
    const url = appUrl(req);
    const [{ data: profiles }, { data: tasks }, { data: assignees }, { data: subs }, { data: pending }] = await Promise.all([
      db.from('profiles').select('*'),
      db.from('tasks').select('id, number, title, status, priority, do_date, do_time, deadline, deadline_time, follow_up_date, follow_up_time, follow_up_with, remind_at, given_by, created_by, start_alerts, deadline_alerts').neq('status', 'Done'),
      db.from('task_assignees').select('task_id, user_id'),
      db.from('push_subscriptions').select('*'),
      db.from('notifications').select('*').is('sent_at', null),
    ]);
    // Repeating reminders (table may not exist before upgrade-4).
    const rq = await db.from('routines').select('*').eq('active', true);
    const routines = rq.error ? [] : rq.data ?? [];
    const runq = routines.length ? await db.from('routine_runs').select('*').gte('day', new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10)) : { data: [] };
    const runs = runq.data ?? [];
    const { data: logRows } = await db.from('reminder_log').select('user_id, key').gte('sent_at', new Date(Date.now() - 45 * DAY).toISOString());
    const logged = new Set((logRows ?? []).map((r) => `${r.user_id}|${r.key}`));

    const byTask = new Map();
    for (const a of assignees ?? []) {
      if (!byTask.has(a.task_id)) byTask.set(a.task_id, []);
      byTask.get(a.task_id).push(a.user_id);
    }
    const taskUrl = (t) => `${url}/tasks/all?task=${t.id}`;
    const summary = { users: 0, emails: 0, pushes: 0 };
    const newLog = [];
    const inbox = [];

    for (const p of profiles ?? []) {
      const now = localNow(p.timezone || 'UTC');
      const quiet = isQuiet(p, now);
      const digestAt = hm(p.digest_time) || '08:00';
      const afterDigestTime = now.time >= digestAt;
      // The summary is only worth sending in the morning window, not at 11 pm.
      const inDigestWindow = afterDigestTime && mins(now.time) - mins(digestAt) <= 6 * 60;
      const mine = (tasks ?? []).filter((t) => {
        const who = byTask.get(t.id) ?? [];
        return who.includes(p.id) || (who.length === 0 && t.created_by === p.id);
      });
      const has = (key) => logged.has(`${p.id}|${key}`);
      const alerts = []; // { key, title, body, url, section }

      // Explicit "remind me" times are always sent, even in quiet hours.
      for (const t of mine) {
        if (t.remind_at && Date.parse(t.remind_at) <= Date.now() && Date.now() - Date.parse(t.remind_at) < 2 * DAY) {
          const key = `remind:${t.id}:${t.remind_at}`;
          if (!has(key)) alerts.push({ key, title: `Reminder: ${t.title}`, body: t.deadline ? `Deadline ${fmtDay(t.deadline)}` : '', url: taskUrl(t), section: 'Reminders', always: true });
        }
      }

      // Assignments and other queued notifications for this person.
      const queued = (pending ?? []).filter((n) => n.user_id === p.id);

      const at = (t) => (hm(t.deadline_time) ? ` at ${hm(t.deadline_time)}` : '');
      const overdueNow = (t) => t.deadline && (t.deadline < now.date || (t.deadline === now.date && hm(t.deadline_time) && hm(t.deadline_time) <= now.time));

      // Alarms the person set on a task: at the start time / before it, and before a timed deadline.
      // They ignore quiet hours (you asked for them) and fire within a few minutes of the moment.
      const nowMin = mins(now.time);
      const minutesUntil = (date, time) => diffDays(now.date, date) * 1440 + mins(time) - nowMin;
      const inWords = (left) => (left <= 0 ? 'now' : left < 60 ? `in ${left} min` : left < 1440 ? `in ${Math.round(left / 60)} h` : 'tomorrow');
      // For one moment (start or deadline): of the alarms that are due, send only the latest one,
      // with the real time left, and mark the others as handled.
      const fire = (kind, t, date, time, offsets, label) => {
        const left = minutesUntil(date, time);
        const due = (offsets ?? []).filter((m) => left - m <= 0 && left - m > -30)
          .map((m) => ({ m, key: `${kind}:${t.id}:${date}:${time}:${m}` })).filter((x) => !has(x.key));
        if (!due.length) return false;
        for (const x of due) { logged.add(`${p.id}|${x.key}`); newLog.push({ user_id: p.id, key: x.key }); }
        const pick = due.sort((x, y) => x.m - y.m)[0];
        alerts.push({ key: pick.key, alarm: true, always: true, logged: true, url: taskUrl(t), section: 'Alarms', ...label(left) });
        return true;
      };
      for (const t of mine) {
        // "Time to start" only while it isn't started yet
        if (p.remind_start !== false && t.do_date && hm(t.do_time) && (t.status === 'To do' || t.status === 'Waiting on someone')) {
          fire('start', t, t.do_date, hm(t.do_time), t.start_alerts ?? [0], (left) => ({
            title: left <= 0 ? `Time to start: ${t.title}` : `Starts ${inWords(left)}: ${t.title}`, body: `Planned for ${hm(t.do_time)}`,
          }));
        }
        if (p.remind_due_soon !== false && t.deadline && hm(t.deadline_time)) {
          const sent = fire('due', t, t.deadline, hm(t.deadline_time), t.deadline_alerts ?? [60], (left) => ({
            title: left <= 0 ? `Due now: ${t.title}` : `Due ${inWords(left)}: ${t.title}`, body: `Deadline ${hm(t.deadline_time)}`,
          }));
          if (sent) {
            // Already warned with an alarm — skip the generic "due today" for it.
            const todayKey = `today:${t.id}:${t.deadline}`;
            logged.add(`${p.id}|${todayKey}`);
            newLog.push({ user_id: p.id, key: todayKey });
          }
        }
      }

      // Repeating reminders: at their time on their days. Team ones skip if someone already has it.
      const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(now.weekday);
      for (const r of routines) {
        if (!(r.scope === 'team' || r.owner_id === p.id) || !(r.days ?? []).includes(dow)) continue;
        const key = `routine:${r.id}:${now.date}`;
        const left = mins(hm(r.at_time)) - nowMin;
        if (left > 0 || left <= -30 || has(key)) continue;
        const run = runs.find((x) => x.routine_id === r.id && x.day === now.date);
        logged.add(`${p.id}|${key}`); newLog.push({ user_id: p.id, key });
        if (run?.done_by || (run?.claimed_by && run.claimed_by !== p.id)) continue;
        alerts.push({ key, alarm: true, always: true, logged: true, url: `${url}/reminders`, section: 'Reminders',
          title: r.scope === 'team' ? `Team reminder: ${r.title}` : `Reminder: ${r.title}`,
          body: r.scope === 'team' ? 'Open the app and click “I’m on it” so nobody does it twice.' : r.notes || '' });
      }

      if (!quiet) {
        for (const t of mine) {
          if (p.remind_followups && t.follow_up_date === now.date && hm(t.follow_up_time) && hm(t.follow_up_time) <= now.time) {
            const key = `follow:${t.id}:${t.follow_up_date}`;
            if (!has(key)) alerts.push({ key, title: `Follow up${t.follow_up_with ? ` with ${t.follow_up_with}` : ''} now`, body: t.title, url: taskUrl(t), section: 'Follow-ups' });
          }
        }
      }

      if (!quiet && afterDigestTime) {
        for (const t of mine) {
          if (p.remind_overdue && overdueNow(t) && diffDays(t.deadline, now.date) <= 14) {
            const key = `overdue:${t.id}:${t.deadline}:${hm(t.deadline_time) || ''}`;
            if (!has(key)) alerts.push({ key, title: `Overdue: ${t.title}`, body: `Was due ${t.deadline === now.date ? 'today' : fmtDay(t.deadline)}${at(t)}`, url: taskUrl(t), section: 'Overdue' });
          }
          if (p.remind_due_today !== false && t.deadline === now.date && !overdueNow(t)) {
            const key = `today:${t.id}:${t.deadline}`;
            if (!has(key)) alerts.push({ key, title: `Due today${at(t)}: ${t.title}`, body: t.priority === 'High' ? 'High priority' : '', url: taskUrl(t), section: 'Due today' });
          }
          if (p.remind_due_tomorrow && t.priority === 'High' && t.deadline === addDays(now.date, 1)) {
            const key = `tomorrow:${t.id}:${t.deadline}`;
            if (!has(key)) alerts.push({ key, title: `Due tomorrow${at(t)}: ${t.title}`, body: 'High priority', url: taskUrl(t), section: 'Due tomorrow' });
          }
          if (p.remind_followups && t.follow_up_date && !hm(t.follow_up_time) && t.follow_up_date <= now.date && diffDays(t.follow_up_date, now.date) <= 3) {
            const key = `follow:${t.id}:${t.follow_up_date}`;
            if (!has(key)) alerts.push({ key, title: `Follow up${t.follow_up_with ? ` with ${t.follow_up_with}` : ''}`, body: t.title, url: taskUrl(t), section: 'Follow-ups' });
          }
        }
      }

      // Morning summary
      let digest = null;
      const digestKey = `digest:${now.date}`;
      if (p.digest_enabled && !quiet && inDigestWindow && !has(digestKey)) {
        const today = mine.filter((t) => (t.do_date === now.date || t.deadline === now.date) && !overdueNow(t));
        const overdue = mine.filter((t) => overdueNow(t));
        const follow = mine.filter((t) => t.follow_up_date && t.follow_up_date <= now.date);
        const toAssign = (tasks ?? []).filter((t) => t.given_by === 'Manager' && !(byTask.get(t.id) ?? []).length);
        const item = (t, meta) => ({ text: t.title, meta, url: taskUrl(t) });
        const sections = [
          { title: 'Overdue', color: '#B4361E', items: overdue.map((t) => item(t, `Was due ${fmtDay(t.deadline)}`)) },
          { title: 'Today', items: today.map((t) => item(t, [hm(t.deadline_time) && t.deadline === now.date ? `Due ${hm(t.deadline_time)}` : '', t.priority === 'High' ? 'High priority' : ''].filter(Boolean).join(' · '))) },
          { title: 'Follow-ups', items: follow.map((t) => item(t, t.follow_up_with ? `Chase ${t.follow_up_with}` : '')) },
          { title: 'Due tomorrow', items: mine.filter((t) => t.deadline === addDays(now.date, 1)).map((t) => item(t, t.priority)) },
          { title: 'New from manager, not assigned', items: toAssign.map((t) => item(t, t.deadline ? `Due ${fmtDay(t.deadline)}` : '')) },
        ];
        const count = sections.reduce((n, s) => n + s.items.length, 0);
        newLog.push({ user_id: p.id, key: digestKey });
        if (count > 0) {
          digest = { sections, overdue: overdue.length, today: today.length, follow: follow.length };
          // Everything in the summary counts as notified; no separate alert for the same thing.
          for (const a of alerts) if (!a.always && !a.key.startsWith('soon:')) a.inDigest = true;
        }
      }

      const sendAlerts = alerts.filter((a) => !a.inDigest);
      const emailAlerts = sendAlerts.filter((a) => !a.alarm || p.alarm_email);
      for (const a of alerts) newLog.push({ user_id: p.id, key: a.key });
      const deliverQueued = queued.filter((n) => p.remind_assigned || n.kind !== 'assigned');
      if (!digest && !sendAlerts.length && !deliverQueued.length) continue;
      if (quiet && !sendAlerts.some((a) => a.always) && !digest) {
        // Hold assignments until quiet hours end (they stay unsent).
        if (!sendAlerts.length) continue;
      }
      summary.users++;
      const mySubs = (subs ?? []).filter((s) => s.user_id === p.id);
      const to = p.notify_email || p.email;

      // Email: one message per run per person.
      if (false) { // email removed — desktop notifications only
        let msg; let subject;
        if (digest) {
          const bits = [digest.today && `${digest.today} today`, digest.overdue && `${digest.overdue} overdue`, digest.follow && `${digest.follow} to chase`].filter(Boolean);
          subject = `Your day: ${bits.join(', ') || 'summary'}`;
          const extra = [...emailAlerts, ...(quiet ? [] : deliverQueued.map((n) => ({ title: n.title, body: n.body, url: n.task_id ? `${url}/tasks/all?task=${n.task_id}` : url, section: 'Updates' })))];
          msg = { heading: 'Good morning', intro: `Here's what needs you on ${fmtDay(now.date)}.`, sections: [...digest.sections, { title: 'Updates', items: extra.map((a) => ({ text: a.title, meta: a.body, url: a.url })) }], appUrl: url };
        } else {
          const items = [...emailAlerts, ...(quiet ? [] : deliverQueued.map((n) => ({ title: n.title, body: n.body, url: n.task_id ? `${url}/tasks/all?task=${n.task_id}` : url, section: 'Updates' })))];
          if (items.length) {
            subject = items.length === 1 ? items[0].title : `${items.length} updates in Work Organizer`;
            const sections = [...new Set(items.map((i) => i.section))].map((s) => ({ title: s, items: items.filter((i) => i.section === s).map((i) => ({ text: i.title, meta: i.body, url: i.url })) }));
            msg = { heading: subject, sections, appUrl: url };
          }
        }
        if (msg) { const r = await sendEmail({ to, subject, html: emailHtml(msg), text: emailText(msg) }); if (r === true) summary.emails++; else summary.emailError = r; }
      }

      // Desktop: a few individual pop-ups, then one summary.
      if (p.push_enabled && mySubs.length) {
        const pops = [];
        if (digest) {
          const bits = [digest.today && `${digest.today} today`, digest.overdue && `${digest.overdue} overdue`, digest.follow && `${digest.follow} to chase`].filter(Boolean);
          pops.push({ title: 'Your day', body: bits.join(' · ') || 'Open your dashboard', url: '/', tag: digestKey });
        }
        const rest = [...sendAlerts.map((a) => ({ title: a.title, body: a.body, url: a.url.replace(url, ''), tag: a.key })),
          ...(quiet ? [] : deliverQueued.map((n) => ({ title: n.title, body: n.body, url: n.task_id ? `/tasks/all?task=${n.task_id}` : '/', tag: n.id })))];
        pops.push(...rest.slice(0, 3));
        if (rest.length > 3) pops.push({ title: `${rest.length - 3} more updates`, body: 'Open Work Organizer to see them all', url: '/', tag: 'more' });
        for (const pop of pops) summary.pushes += await sendPush(db, mySubs, pop);
      }

      // In-app inbox entries for reminders (assignment notifications already exist).
      for (const a of sendAlerts) inbox.push({ user_id: p.id, kind: 'reminder', title: a.title, body: a.body, task_id: a.url.split('task=')[1] || null, sent_at: new Date().toISOString() });
      if (!quiet && deliverQueued.length) {
        await db.from('notifications').update({ sent_at: new Date().toISOString() }).in('id', deliverQueued.map((n) => n.id));
      }
      // Assignments the person opted out of: mark handled so they don't wait forever.
      const skipped = queued.filter((n) => !deliverQueued.includes(n));
      if (skipped.length) await db.from('notifications').update({ sent_at: new Date().toISOString() }).in('id', skipped.map((n) => n.id));
    }

    if (newLog.length) await db.from('reminder_log').upsert(newLog, { onConflict: 'user_id,key', ignoreDuplicates: true });
    if (inbox.length) await db.from('notifications').insert(inbox);
    // Tidy up: forget log rows older than 60 days.
    await db.from('reminder_log').delete().lt('sent_at', new Date(Date.now() - 60 * DAY).toISOString());

    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
