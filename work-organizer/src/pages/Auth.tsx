import { useState } from 'react';
import { logEvent, supabase } from '../lib/supabase';
import { PasswordForm } from './Settings';

const Mark = () => (
  <span className="brand-mark" style={{ width: 32, height: 32, borderRadius: 9 }}>
    <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) logEvent('login', 'Logged in');
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  };

  const forgot = async () => {
    if (!email.trim()) { setErr('Type your email first.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/settings` });
    if (error) setErr(error.message); else setResetSent(true);
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Mark />
        <div>
          <h1>Work Organizer</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Log in with the account your team gave you.</p>
        </div>
        <label className="field">Email<input className="input" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <span className="err-text">{err}</span>}
        {resetSent && <span className="muted" style={{ fontSize: 12.5 }}>If that account exists, a reset link is on its way.</span>}
        <button className="btn primary" style={{ height: 36 }} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <button type="button" className="btn ghost sm" onClick={forgot}>Forgot password?</button>
      </form>
    </div>
  );
}

export function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  return (
    <div className="auth">
      <div className="auth-card" style={{ width: 'min(520px, 100%)' }}>
        <Mark />
        <div>
          <h1>Welcome</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>You logged in with a temporary password. Pick your own to continue.</p>
        </div>
        <PasswordForm requireChange onDone={onDone} />
        <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Log out</button>
      </div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="auth-card">
        <Mark />
        <h1>Almost there</h1>
        <p className="muted">The app can't find its Supabase settings. In Vercel → Settings → Environment Variables, add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then redeploy.</p>
      </div>
    </div>
  );
}
