// Shared helpers for the serverless functions. Files starting with "_" are not routes on Vercel.
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function admin() {
  if (!SUPABASE_URL || !SECRET) throw new HttpError(500, 'Server is missing SUPABASE_SECRET_KEY. Add it in Vercel → Settings → Environment Variables.');
  if (SECRET.startsWith('sb_publishable_') || SECRET === process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new HttpError(500, 'SUPABASE_SECRET_KEY in Vercel is the publishable key. Use the secret key (starts with sb_secret_) from Supabase → Project Settings → API Keys, then redeploy.');
  }
  return createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Wrap a handler: JSON in/out, POST only, errors → { error }. */
export function handler(fn, { methods = ['POST'] } = {}) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'Method not allowed');
      const out = await fn(req, res);
      res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e.message || 'Something went wrong' });
    }
  };
}

/** The logged-in team member calling this function (checked against Supabase). */
export async function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not logged in');
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired — log in again');
  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) throw new HttpError(403, 'Not a team member');
  return { db, user: data.user, profile };
}

// ───────────── Email (Brevo) ─────────────

export const emailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);

export async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) return false;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || 'Work Organizer' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    console.error('Brevo error', res.status, await res.text());
    return false;
  }
  return true;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A plain, well-behaved HTML email. sections: [{ title, items: [{ text, meta, url }] }] */
export function emailHtml({ heading, intro, sections, appUrl }) {
  const list = sections.filter((s) => s.items.length).map((s) => `
    <tr><td style="padding:18px 0 6px;font:600 12px/1.4 -apple-system,Segoe UI,sans-serif;color:${s.color || '#6B6B67'};text-transform:uppercase;letter-spacing:.05em">${esc(s.title)} · ${s.items.length}</td></tr>
    ${s.items.map((i) => `
    <tr><td style="padding:9px 0;border-bottom:1px solid #EFEFEC;font:14px/1.45 -apple-system,Segoe UI,sans-serif;color:#1A1A19">
      <a href="${esc(i.url)}" style="color:#1A1A19;text-decoration:none">${esc(i.text)}</a>
      ${i.meta ? `<div style="font-size:12.5px;color:#6B6B67;margin-top:2px">${esc(i.meta)}</div>` : ''}
    </td></tr>`).join('')}`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F4F4F2;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E6E6E3;border-radius:10px">
    <tr><td style="padding:24px 28px 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font:600 18px/1.3 -apple-system,Segoe UI,sans-serif;color:#1A1A19">${esc(heading)}</td></tr>
        ${intro ? `<tr><td style="padding-top:6px;font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#4A4A47">${esc(intro)}</td></tr>` : ''}
        ${list}
        <tr><td style="padding-top:22px"><a href="${esc(appUrl)}" style="display:inline-block;background:#1A1A19;color:#fff;text-decoration:none;font:500 13px -apple-system,Segoe UI,sans-serif;padding:9px 14px;border-radius:6px">Open Work Organizer</a></td></tr>
        <tr><td style="padding-top:18px;font:12px/1.5 -apple-system,Segoe UI,sans-serif;color:#8E8E89">Change what you receive in Settings → Notifications.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function emailText({ heading, intro, sections, appUrl }) {
  return [heading, intro, '', ...sections.filter((s) => s.items.length).flatMap((s) => [
    `${s.title.toUpperCase()} (${s.items.length})`, ...s.items.map((i) => `- ${i.text}${i.meta ? ` — ${i.meta}` : ''}`), '',
  ]), appUrl].filter((x) => x !== undefined).join('\n');
}

// ───────────── Desktop push ─────────────

export const pushConfigured = () => Boolean(process.env.VAPID_PRIVATE_KEY && (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY));

let vapidSet = false;
export async function sendPush(db, subs, payload) {
  if (!pushConfigured() || !subs.length) return 0;
  if (!vapidSet) {
    webpush.setVapidDetails(
      `mailto:${process.env.MAIL_FROM_EMAIL || 'admin@example.com'}`,
      process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    vapidSet = true;
  }
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      // The browser unsubscribed or the subscription expired → forget it.
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push error', e.statusCode, e.body);
    }
  }));
  return sent;
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `https://${host}` : '';
}
