import { handler, HttpError, requireUser } from './_lib.js';

const COLORS = ['#2F5FD0', '#0F766E', '#9A3412', '#7C3AED', '#BE185D', '#4D7C0F', '#0369A1', '#A16207'];

// Any team member can create a login for a new teammate.
export default handler(async (req) => {
  const { db } = await requireUser(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const fullName = String(req.body?.full_name || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'That email doesn’t look right.');
  if (password.length < 8) throw new HttpError(400, 'The temporary password needs at least 8 characters.');

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split('@')[0], must_change_password: true },
  });
  if (error) {
    if (/already/i.test(error.message)) throw new HttpError(409, 'Someone with that email already has a login.');
    throw new HttpError(400, error.message);
  }

  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
  await db.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: fullName || email.split('@')[0],
    must_change_password: true,
    color: COLORS[(count ?? 0) % COLORS.length],
  });
  return { id: data.user.id };
});
