import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Shell } from './components/Shell';
import { applyTheme, type Theme } from './components/theme';
import { configured, supabase } from './lib/supabase';
import { registerServiceWorker } from './lib/push';
import { DataProvider, useData } from './store/data';
import { UiProvider } from './store/ui';
import { ForcePasswordChange, Login, NotConfigured } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { BoardPage, CalendarPage, MatrixPage, TasksPage } from './pages/TaskPages';
import { ChecklistPage } from './pages/Checklist';
import { MeetingPage, MeetingsPage } from './pages/Meetings';
import { TeamPage } from './pages/Team';
import { SettingsPage } from './pages/Settings';

function Workspace() {
  const { ready, me, update } = useData();
  const [pwDone, setPwDone] = useState(false);

  // Keep profile time zone + theme in sync with this browser.
  useEffect(() => {
    if (!me) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && me.timezone !== tz) update('profiles', { id: me.id }, { timezone: tz });
    applyTheme((me.theme ?? 'system') as Theme);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  if (!ready) return <div className="auth"><span className="muted">Loading…</span></div>;
  if (me?.must_change_password && !pwDone) return <ForcePasswordChange onDone={() => setPwDone(true)} />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<Navigate to="/tasks/all" replace />} />
        <Route path="/tasks/:viewId" element={<TasksPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/matrix" element={<MatrixPage />} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    registerServiceWorker();
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <NotConfigured />;
  if (session === undefined) return null;
  if (!session) return <Login />;
  return (
    <UiProvider>
      <DataProvider key={session.user.id} session={session}>
        <Workspace />
      </DataProvider>
    </UiProvider>
  );
}
