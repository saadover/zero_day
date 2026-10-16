import { appUrl, emailConfigured, emailHtml, emailText, handler, HttpError, pushConfigured, requireUser, sendEmail, sendPush } from './_lib.js';

// "Send me a test notification" from Settings.
export default handler(async (req) => {
  const { db, profile } = await requireUser(req);
  const url = appUrl(req);
  if (!emailConfigured() && !pushConfigured()) {
    throw new HttpError(400, 'Neither email nor desktop notifications are set up on the server yet. See the setup guide.');
  }
  const to = profile.notify_email || profile.email;
  let emailed = '';
  if (profile.email_enabled && emailConfigured()) {
    const msg = {
      heading: 'Test notification',
      intro: 'If you can read this, email reminders work. You can change what you receive in Settings.',
      sections: [], appUrl: url,
    };
    if (await sendEmail({ to, subject: 'Work Organizer — test notification', html: emailHtml(msg), text: emailText(msg) })) emailed = to;
  }
  let pushed = 0;
  if (profile.push_enabled) {
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', profile.id);
    pushed = await sendPush(db, subs ?? [], { title: 'Test notification', body: 'Desktop notifications work.', url: '/settings', tag: 'test' });
  }
  if (!emailed && !pushed) throw new HttpError(400, 'Nothing was sent — check that email or desktop notifications are switched on.');
  return { email: emailed, push: pushed };
});
