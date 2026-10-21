import { handler, HttpError, requireUser } from './_lib.js';

const nameFromEmail = (e) => e.split('@')[0].replace(/\d+/g, '').split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || e.split('@')[0];

const COLORS = ['#2F5FD0', '#0F766E', '#9A3412', '#7C3AED', '#BE185D', '#4D7C0F', '#0369A1', '#A16207'];

// An admin creates a login for a new teammate, with a role: admin, user, basic or visitor.
export default handler(async (req) => {
  const { db, profile: me } = await requireUser(req);
  if (me.role && me.role !== 'admin') throw new HttpError(403, 'Only an admin can add people.');
  const role = ['admin', 'user', 'basic', 'visitor'].includes(req.body?.role) ? req.body.role : 'user';
  const email = String(req.body?.email || '').trim().toLowerCase();
  const fullName = String(req.body?.full_name || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'That email doesn’t look right.');
  if (password.length < 8) throw new HttpError(400, 'The temporary password needs at least 8 characters.');

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || nameFromEmail(email), must_change_password: true, role },
  });
  if (error) {
    if (/already/i.test(error.message)) throw new HttpError(409, 'Someone with that email already has a login.');
    throw new HttpError(400, error.message);
  }

  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
  await db.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: fullName || nameFromEmail(email),
    must_change_password: true,
    role,
    color: COLORS[(count ?? 0) % COLORS.length],
  });
  // History: the database sees this as the server, so record which admin did it.
  await db.from('activity_log').insert({
    actor: me.id, actor_name: me.full_name, kind: 'profiles', action: 'insert',
    record_id: data.user.id, title: fullName || nameFromEmail(email), details: role,
  }).then(() => undefined, () => undefined);
  return { id: data.user.id };
});
