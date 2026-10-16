import { appUrl, emailConfigured, emailHtml, emailText, handler, HttpError, pushConfigured, requireUser, sendEmail, sendPush } from './_lib.js';
void emailConfigured;

// "Send me a test notification" from Settings.
export default handler(async (req) => {
  const { db, profile } = await requireUser(req);
  const url = appUrl(req);
  if (!emailConfigured() && !pushConfigured()) {
    throw new HttpError(400, 'Neither email nor desktop notifications are set up on the server yet. See the setup guide.');
  }
  const to = profile.notify_email || profile.email;
  let emailed = '';
  let emailError = '';
  if (!profile.email_enabled) emailError = 'Email is switched off in your Settings.';
  else {
    const msg = {
      heading: 'Test notification',
      intro: 'If you can read this, email reminders work. You can change what you receive in Settings.',
      sections: [], appUrl: url,
    };
    const r = await sendEmail({ to, subject: 'Work Organizer — test notification', html: emailHtml(msg), text: emailText(msg) });
    if (r === true) emailed = to; else emailError = r;
  }
  let pushed = 0;
  if (profile.push_enabled) {
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', profile.id);
    pushed = await sendPush(db, subs ?? [], { title: 'Test notification', body: 'Desktop notifications work.', url: '/settings', tag: 'test' });
  }
  if (emailError) throw new HttpError(400, `Email NOT sent: ${emailError}${pushed ? ` (desktop test sent to ${pushed} device(s))` : ''}`);
  if (!pushed && !emailed) throw new HttpError(400, 'Nothing was sent — check that email or desktop notifications are switched on.');
  return { email: emailed, push: pushed };
});
