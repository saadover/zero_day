import { useEffect, useState } from 'react';
import { Avatar } from '../components/Atoms';
import { IconMoon, IconSun } from '../components/Icons';
import { applyTheme, type Theme } from '../components/theme';
import { useToast } from '../components/Toast';
import { currentPushState, disablePush, enablePush, pushConfigured, showLocal } from '../lib/push';
import { callApi, supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { PERSON_COLORS } from '../lib/types';
import { useData } from '../store/data';

export function PasswordForm({ onDone, requireChange }: { onDone?: () => void; requireChange?: boolean }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords don’t match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await supabase.from('profiles').update({ must_change_password: false }).eq('id', data.user.id);
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setPw(''); setPw2('');
    toast.show('Password changed');
    onDone?.();
  };

  return (
    <form className="card-box" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2>{requireChange ? 'Choose your own password' : 'Change password'}</h2>
      <div className="grid-2">
        <label className="field">New password<input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="field">Repeat it<input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>
      {err && <span className="err-text">{err}</span>}
      <div><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button></div>
    </form>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check" style={{ alignItems: 'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span><span>{label}</span>{hint && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{hint}</span>}</span>
    </label>
  );
}

export function SettingsPage() {
  const { me, update } = useData();
  const toast = useToast();
  const [push, setPush] = useState<'on' | 'off' | 'denied' | 'unsupported' | '…'>('…');
  const [name, setName] = useState(me?.full_name ?? '');
  const [notifyEmail, setNotifyEmail] = useState(me?.notify_email ?? '');
  const [testing, setTesting] = useState(false);

  useEffect(() => { currentPushState().then(setPush); }, []);
  useEffect(() => { setName(me?.full_name ?? ''); setNotifyEmail(me?.notify_email ?? ''); }, [me?.full_name, me?.notify_email]);

  if (!me) return null;
  const set = (patch: Partial<Profile>) => update('profiles', { id: me.id }, patch);

  const togglePush = async () => {
    try {
      if (push === 'on') { await disablePush(); setPush('off'); return; }
      const r = await enablePush(me.id);
      if (r === 'ok') { setPush('on'); showLocal('Desktop notifications are on', 'Reminders will appear here, even when the app is closed.'); }
      else if (r === 'denied') { setPush('denied'); toast.error('Notifications are blocked for this site. Allow them in your browser’s site settings.'); }
      else if (r === 'unconfigured') toast.error('Desktop notifications aren’t set up on the server yet (VITE_VAPID_PUBLIC_KEY missing).');
      else toast.error('This browser doesn’t support desktop notifications. On iPhone, add the app to your home screen first.');
    } catch (e) { toast.error((e as Error).message); }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await callApi<{ email: string; push: number }>('/api/test-notify', {});
      toast.show(`Test sent${r.email ? ` to ${r.email}` : ''}${r.push ? ` and ${r.push} device(s)` : ''}.`);
    } catch (e) { toast.error((e as Error).message); }
    setTesting(false);
  };

  const theme = (me.theme ?? 'system') as Theme;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>Settings</h1></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card-box">
          <h2>Profile</h2>
          <div className="grid-2">
            <label className="field">Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== me.full_name && set({ full_name: name.trim() })} />
            </label>
            <label className="field">Login email<input className="input" value={me.email} disabled /></label>
          </div>
          <div className="row-gap">
            <span className="muted" style={{ fontSize: 12.5 }}>Colour</span>
            {PERSON_COLORS.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} onClick={() => set({ color: c })}
                style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: me.color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
            <Avatar person={me} size="lg" />
          </div>
          <div className="row-gap">
            <span className="muted" style={{ fontSize: 12.5 }}>Theme</span>
            <div className="seg">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => { applyTheme(t); set({ theme: t }); }}>
                  {t === 'light' && <IconSun size={13} />}{t === 'dark' && <IconMoon size={13} />}{t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <PasswordForm />

        <div className="card-box">
          <h2>Notifications</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 13, fontWeight: 500 }}>Where</strong>
            <Toggle label="Email" checked={me.email_enabled} onChange={(v) => set({ email_enabled: v })} />
            <label className="field" style={{ marginLeft: 23 }}>Send emails to
              <input className="input" type="email" placeholder={`${me.email} (your login email)`} value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                onBlur={() => notifyEmail.trim() !== (me.notify_email ?? '') && set({ notify_email: notifyEmail.trim() || null })} />
            </label>
            <div className="row-gap">
              <Toggle label="Desktop notifications on this device"
                hint={push === 'denied' ? 'Blocked in this browser — allow notifications in the site settings.' : push === 'unsupported' ? 'Not supported in this browser.' : !pushConfigured() ? 'Not set up on the server yet.' : 'Pop-ups on this computer or phone, even when the app is closed.'}
                checked={push === 'on'} onChange={togglePush} />
            </div>
            <Toggle label="Desktop notifications (all my devices)" hint="Turn off to pause pop-ups everywhere without unsubscribing." checked={me.push_enabled} onChange={(v) => set({ push_enabled: v })} />

            <strong style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>What</strong>
            <div className="row-gap">
              <Toggle label="Morning summary" hint="Today's tasks, overdue items and follow-ups due." checked={me.digest_enabled} onChange={(v) => set({ digest_enabled: v })} />
              <input type="time" className="input" style={{ width: 110 }} value={me.digest_time.slice(0, 5)} aria-label="Summary time" onChange={(e) => e.target.value && set({ digest_time: e.target.value })} />
            </div>
            <Toggle label="High-priority deadline tomorrow" checked={me.remind_due_tomorrow} onChange={(v) => set({ remind_due_tomorrow: v })} />
            <Toggle label="Task became overdue" hint="Once per task." checked={me.remind_overdue} onChange={(v) => set({ remind_overdue: v })} />
            <Toggle label="Follow-up day" hint="“Today, chase Sarah about the contract.”" checked={me.remind_followups} onChange={(v) => set({ remind_followups: v })} />
            <Toggle label="Someone assigned me a task" checked={me.remind_assigned} onChange={(v) => set({ remind_assigned: v })} />
            <span className="muted" style={{ fontSize: 12 }}>“Remind me” times set on a task are always sent.</span>

            <strong style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>Quiet hours</strong>
            <div className="row-gap">
              <span style={{ fontSize: 13 }}>No notifications from</span>
              <input type="time" className="input" style={{ width: 110 }} value={me.quiet_start?.slice(0, 5) ?? ''} aria-label="Quiet from" onChange={(e) => set({ quiet_start: e.target.value || null })} />
              <span style={{ fontSize: 13 }}>to</span>
              <input type="time" className="input" style={{ width: 110 }} value={me.quiet_end?.slice(0, 5) ?? ''} aria-label="Quiet until" onChange={(e) => set({ quiet_end: e.target.value || null })} />
            </div>
            <Toggle label="Quiet at weekends" checked={me.quiet_weekends} onChange={(v) => set({ quiet_weekends: v })} />
            <span className="muted" style={{ fontSize: 12 }}>Times use your time zone: {me.timezone}. Anything held back during quiet hours is sent when they end.</span>
            <div><button className="btn" disabled={testing} onClick={sendTest}>{testing ? 'Sending…' : 'Send me a test notification'}</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}
