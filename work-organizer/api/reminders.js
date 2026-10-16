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
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = admin();
    const url = appUrl(req);
    const [{ data: profiles }, { data: tasks }, { data: assignees }, { data: subs }, { data: pending }] = await Promise.all([
      db.from('profiles').select('*'),
      db.from('tasks').select('id, number, title, status, priority, do_date, deadline, follow_up_date, follow_up_with, remind_at, given_by, created_by').neq('status', 'Done'),
      db.from('task_assignees').select('task_id, user_id'),
      db.from('push_subscriptions').select('*'),
      db.from('notifications').select('*').is('sent_at', null),
    ]);
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

      if (!quiet && afterDigestTime) {
        for (const t of mine) {
          if (p.remind_overdue && t.deadline && t.deadline < now.date && diffDays(t.deadline, now.date) <= 14) {
            const key = `overdue:${t.id}:${t.deadline}`;
            if (!has(key)) alerts.push({ key, title: `Overdue: ${t.title}`, body: `Was due ${fmtDay(t.deadline)}`, url: taskUrl(t), section: 'Overdue' });
          }
          if (p.remind_due_tomorrow && t.priority === 'High' && t.deadline === addDays(now.date, 1)) {
            const key = `tomorrow:${t.id}:${t.deadline}`;
            if (!has(key)) alerts.push({ key, title: `Due tomorrow: ${t.title}`, body: 'High priority', url: taskUrl(t), section: 'Due tomorrow' });
          }
          if (p.remind_followups && t.follow_up_date && t.follow_up_date <= now.date && diffDays(t.follow_up_date, now.date) <= 3) {
            const key = `follow:${t.id}:${t.follow_up_date}`;
            if (!has(key)) alerts.push({ key, title: `Follow up${t.follow_up_with ? ` with ${t.follow_up_with}` : ''}`, body: t.title, url: taskUrl(t), section: 'Follow-ups' });
          }
        }
      }

      // Morning summary
      let digest = null;
      const digestKey = `digest:${now.date}`;
      if (p.digest_enabled && !quiet && inDigestWindow && !has(digestKey)) {
        const today = mine.filter((t) => t.do_date === now.date || t.deadline === now.date);
        const overdue = mine.filter((t) => t.deadline && t.deadline < now.date);
        const follow = mine.filter((t) => t.follow_up_date && t.follow_up_date <= now.date);
        const toAssign = (tasks ?? []).filter((t) => t.given_by === 'Manager' && !(byTask.get(t.id) ?? []).length);
        const item = (t, meta) => ({ text: t.title, meta, url: taskUrl(t) });
        const sections = [
          { title: 'Overdue', color: '#B4361E', items: overdue.map((t) => item(t, `Was due ${fmtDay(t.deadline)}`)) },
          { title: 'Today', items: today.map((t) => item(t, t.priority === 'High' ? 'High priority' : '')) },
          { title: 'Follow-ups', items: follow.map((t) => item(t, t.follow_up_with ? `Chase ${t.follow_up_with}` : '')) },
          { title: 'Due tomorrow', items: mine.filter((t) => t.deadline === addDays(now.date, 1)).map((t) => item(t, t.priority)) },
          { title: 'New from manager, not assigned', items: toAssign.map((t) => item(t, t.deadline ? `Due ${fmtDay(t.deadline)}` : '')) },
        ];
        const count = sections.reduce((n, s) => n + s.items.length, 0);
        newLog.push({ user_id: p.id, key: digestKey });
        if (count > 0) {
          digest = { sections, overdue: overdue.length, today: today.length, follow: follow.length };
          // Everything in the summary counts as notified; no separate alert for the same thing.
          for (const a of alerts) if (!a.always) a.inDigest = true;
        }
      }

      const sendAlerts = alerts.filter((a) => !a.inDigest);
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
      if (p.email_enabled && emailConfigured()) {
        let msg; let subject;
        if (digest) {
          const bits = [digest.today && `${digest.today} today`, digest.overdue && `${digest.overdue} overdue`, digest.follow && `${digest.follow} to chase`].filter(Boolean);
          subject = `Your day: ${bits.join(', ') || 'summary'}`;
          const extra = [...sendAlerts, ...(quiet ? [] : deliverQueued.map((n) => ({ title: n.title, body: n.body, url: n.task_id ? `${url}/tasks/all?task=${n.task_id}` : url, section: 'Updates' })))];
          msg = { heading: 'Good morning', intro: `Here's what needs you on ${fmtDay(now.date)}.`, sections: [...digest.sections, { title: 'Updates', items: extra.map((a) => ({ text: a.title, meta: a.body, url: a.url })) }], appUrl: url };
        } else {
          const items = [...sendAlerts, ...(quiet ? [] : deliverQueued.map((n) => ({ title: n.title, body: n.body, url: n.task_id ? `${url}/tasks/all?task=${n.task_id}` : url, section: 'Updates' })))];
          if (items.length) {
            subject = items.length === 1 ? items[0].title : `${items.length} updates in Work Organizer`;
            const sections = [...new Set(items.map((i) => i.section))].map((s) => ({ title: s, items: items.filter((i) => i.section === s).map((i) => ({ text: i.title, meta: i.body, url: i.url })) }));
            msg = { heading: subject, sections, appUrl: url };
          }
        }
        if (msg && await sendEmail({ to, subject, html: emailHtml(msg), text: emailText(msg) })) summary.emails++;
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
