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

type ProfileDraft = Pick<Profile, 'full_name' | 'color' | 'theme' | 'notify_email' | 'email_enabled' | 'push_enabled' | 'digest_enabled'
  | 'digest_time' | 'remind_due_tomorrow' | 'remind_due_today' | 'remind_due_soon' | 'remind_start' | 'alarm_email' | 'remind_overdue' | 'remind_followups' | 'remind_assigned'
  | 'quiet_start' | 'quiet_end' | 'quiet_weekends'>;
const DRAFT_KEYS: (keyof ProfileDraft)[] = ['full_name', 'color', 'theme', 'notify_email', 'email_enabled', 'push_enabled', 'digest_enabled', 'digest_time',
  'remind_due_tomorrow', 'remind_due_today', 'remind_due_soon', 'remind_start', 'alarm_email', 'remind_overdue', 'remind_followups', 'remind_assigned', 'quiet_start', 'quiet_end', 'quiet_weekends'];
const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
const pick = (p: Profile): ProfileDraft => {
  const o = Object.fromEntries(DRAFT_KEYS.map((k) => [k, p[k]])) as ProfileDraft;
  o.digest_time = hm(o.digest_time) ?? '08:00'; o.quiet_start = hm(o.quiet_start); o.quiet_end = hm(o.quiet_end);
  o.remind_due_today = o.remind_due_today ?? true; o.remind_due_soon = o.remind_due_soon ?? true; o.remind_start = o.remind_start ?? true; o.alarm_email = o.alarm_email ?? false;
  return o;
};

export function SettingsPage() {
  const { me, update } = useData();
  const toast = useToast();
  const [push, setPush] = useState<'on' | 'off' | 'denied' | 'unsupported' | '…'>('…');
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);

  useEffect(() => { currentPushState().then(setPush); }, []);

  if (!me) return null;
  const saved = pick(me);
  const d = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<ProfileDraft>) => setDraft({ ...d, ...patch });

  const save = async () => {
    if (!d.full_name.trim()) { toast.error('Your name can’t be empty.'); return; }
        setBusy(true);
    const patch = Object.fromEntries(DRAFT_KEYS.filter((k) => d[k] !== saved[k]).map((k) => [k, k === 'full_name' ? d.full_name.trim() : d[k]]));
    await update('profiles', { id: me.id }, patch as Partial<Profile>);
    if (patch.theme) applyTheme(d.theme as Theme);
    setDraft(null);
    setBusy(false);
    toast.show('Settings saved');
  };
  const cancel = () => { setDraft(null); applyTheme(saved.theme as Theme); };

  // Turning this device's notifications on/off is a browser permission, so it happens straight away.
  const togglePush = async () => {
    try {
      if (push === 'on') { await disablePush(); setPush('off'); toast.show('Desktop notifications off on this device'); return; }
      const r = await enablePush(me.id);
      if (r === 'ok') { setPush('on'); showLocal('Desktop notifications are on', 'Reminders will appear here, even when the app is closed.'); }
      else if (r === 'denied') { setPush('denied'); toast.error('Notifications are blocked for this site. Allow them in your browser’s site settings.'); }
      else if (r === 'unconfigured') toast.error('Desktop notifications aren’t set up on the server yet (VITE_VAPID_PUBLIC_KEY missing).');
      else toast.error('This browser doesn’t support desktop notifications. On iPhone, add the app to your home screen first.');
    } catch (e) { toast.error((e as Error).message); }
  };

  const sendTest = async () => {
    if (dirty) { toast.error('Save your changes first, then send the test.'); return; }
    setTesting(true);
    try {
      const r = await callApi<{ push: number }>('/api/test-notify', {});
      toast.show(`Test sent to ${r.push} device(s).`);
    } catch (e) { toast.error((e as Error).message); }
    setTesting(false);
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>Settings</h1></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card-box">
          <h2>Profile</h2>
          <div className="grid-2">
            <label className="field">Name<input className="input" value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} /></label>
            <label className="field">Login email<input className="input" value={me.email} disabled /></label>
          </div>
          <div className="row-gap">
            <span className="muted" style={{ fontSize: 12.5 }}>Your colour <span style={{ fontSize: 11.5 }}>(used on the team calendar)</span></span>
            {PERSON_COLORS.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} onClick={() => set({ color: c })}
                style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: d.color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
            <Avatar person={{ ...me, ...d }} size="lg" />
          </div>
          <div className="row-gap">
            <span className="muted" style={{ fontSize: 12.5 }}>Theme</span>
            <div className="seg">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} className={d.theme === t ? 'on' : ''} onClick={() => { set({ theme: t }); applyTheme(t); }}>
                  {t === 'light' && <IconSun size={13} />}{t === 'dark' && <IconMoon size={13} />}{t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card-box">
          <h2>Notifications</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 13, fontWeight: 500 }}>Desktop notifications</strong>
            <Toggle label="Desktop notifications (all my devices)" hint="Turn off to pause pop-ups everywhere." checked={d.push_enabled} onChange={(v) => set({ push_enabled: v })} />
            <div className="row-gap" style={{ marginLeft: 23 }}>
              <span style={{ fontSize: 13 }}>This device: <b style={{ fontWeight: 500 }}>{push === 'on' ? 'on' : push === 'denied' ? 'blocked by the browser' : push === 'unsupported' ? 'not supported' : 'off'}</b></span>
              {push !== 'unsupported' && push !== 'denied' && (
                <button className="btn sm" onClick={togglePush}>{push === 'on' ? 'Turn off on this device' : 'Turn on for this device'}</button>
              )}
              {!pushConfigured() && <span className="muted" style={{ fontSize: 12 }}>Not set up on the server yet.</span>}
            </div>

            <strong style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>What</strong>
            <div className="row-gap">
              <Toggle label="Morning summary" hint="Today's tasks, overdue items and follow-ups due." checked={d.digest_enabled} onChange={(v) => set({ digest_enabled: v })} />
              <input type="time" className="input" style={{ width: 110 }} value={d.digest_time} aria-label="Summary time" onChange={(e) => e.target.value && set({ digest_time: e.target.value })} />
            </div>
            <Toggle label="Due today" hint="When a task is due today and wasn't in the morning summary (e.g. added later)." checked={d.remind_due_today} onChange={(v) => set({ remind_due_today: v })} />
            <Toggle label="Start alarms" hint="When a task's do date has a time: “Time to start” at that time, plus any early alarms you tick on the task (15 min, 30 min, 1 h, 1 day before)." checked={d.remind_start} onChange={(v) => set({ remind_start: v })} />
            <Toggle label="Deadline alarms" hint="Before a deadline that has a time — 1 h before unless you choose other times on the task." checked={d.remind_due_soon} onChange={(v) => set({ remind_due_soon: v })} />
            <Toggle label="High-priority deadline tomorrow" checked={d.remind_due_tomorrow} onChange={(v) => set({ remind_due_tomorrow: v })} />
            <Toggle label="Task became overdue" hint="Once per task." checked={d.remind_overdue} onChange={(v) => set({ remind_overdue: v })} />
            <Toggle label="Follow-up day" hint="“Today, chase Sarah about the contract.”" checked={d.remind_followups} onChange={(v) => set({ remind_followups: v })} />
            <Toggle label="Someone assigned me a task" checked={d.remind_assigned} onChange={(v) => set({ remind_assigned: v })} />
            <span className="muted" style={{ fontSize: 12 }}>“Remind me” times set on a task are always sent.</span>

            <strong style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>Quiet hours</strong>
            <div className="row-gap">
              <span style={{ fontSize: 13 }}>No notifications from</span>
              <input type="time" className="input" style={{ width: 110 }} value={d.quiet_start ?? ''} aria-label="Quiet from" onChange={(e) => set({ quiet_start: e.target.value || null })} />
              <span style={{ fontSize: 13 }}>to</span>
              <input type="time" className="input" style={{ width: 110 }} value={d.quiet_end ?? ''} aria-label="Quiet until" onChange={(e) => set({ quiet_end: e.target.value || null })} />
            </div>
            <Toggle label="Quiet at weekends" checked={d.quiet_weekends} onChange={(v) => set({ quiet_weekends: v })} />
            <span className="muted" style={{ fontSize: 12 }}>Times use your time zone: {me.timezone}. Anything held back during quiet hours is sent when they end.</span>
            <div><button className="btn" disabled={testing} onClick={sendTest}>{testing ? 'Sending…' : 'Send me a test notification'}</button></div>
          </div>
        </div>

        <div className="save-bar" style={{ marginTop: 0 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" disabled={!dirty || busy} onClick={cancel}>Cancel</button>
            <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </span>
        </div>

        <PasswordForm />
      </div>
    </div>
  );
}
