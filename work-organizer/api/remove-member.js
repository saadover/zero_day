import { handler, HttpError, requireUser } from './_lib.js';

// Deletes a teammate's login. Tasks they created stay (creator shows as unknown).
export default handler(async (req) => {
  const { db, user, profile: me } = await requireUser(req);
  if (me.role && me.role !== 'admin') throw new HttpError(403, 'Only an admin can remove people.');
  const id = String(req.body?.user_id || '');
  if (!id) throw new HttpError(400, 'Missing user_id');
  if (id === user.id) throw new HttpError(400, 'You can’t remove yourself.');
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) throw new HttpError(400, 'The last member can’t be removed.');
  const { data: gone } = await db.from('profiles').select('full_name, email').eq('id', id).maybeSingle();
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) throw new HttpError(400, error.message);
  await db.from('activity_log').insert({
    actor: user.id, actor_name: me.full_name, kind: 'profiles', action: 'delete',
    record_id: id, title: gone?.full_name || gone?.email || 'a teammate',
  }).then(() => undefined, () => undefined);
  return { ok: true };
});
