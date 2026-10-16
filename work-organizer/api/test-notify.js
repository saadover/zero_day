import { handler, HttpError, pushConfigured, requireUser, sendPush } from './_lib.js';

// "Send me a test notification" from Settings — desktop only.
export default handler(async (req) => {
  const { db, profile } = await requireUser(req);
  if (!pushConfigured()) throw new HttpError(400, 'Desktop notifications are not set up on the server (VAPID keys missing in Vercel).');
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', profile.id);
  if (!subs?.length) throw new HttpError(400, 'No device is set up yet — click “Turn on for this device” first.');
  const pushed = await sendPush(db, subs, { title: 'Test notification', body: 'Desktop notifications work.', url: '/settings', tag: 'test' });
  if (!pushed) throw new HttpError(400, 'The browser refused the notification. Turn it off and on again for this device.');
  return { push: pushed };
});
