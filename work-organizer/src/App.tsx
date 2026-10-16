import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Shell } from './components/Shell';
import { applyTheme, type Theme } from './components/theme';
import { configured, supabase } from './lib/supabase';
import { registerServiceWorker, showLocal } from './lib/push';
import { lateTitle, taskAlarms } from './lib/alarms';
import { useToast } from './components/Toast';
import { DataProvider, useData } from './store/data';
import { UiProvider, useOpenTask } from './store/ui';
import { ForcePasswordChange, Login, NotConfigured } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { BoardPage, CalendarPage, MatrixPage, TasksPage, TeamListPage, WorkloadPage } from './pages/TaskPages';
import { ChecklistPage } from './pages/Checklist';
import { MeetingPage, MeetingsPage } from './pages/Meetings';
import { TeamPage } from './pages/Team';
import { SettingsPage } from './pages/Settings';

const FIRED_KEY = 'fired-alarms';
const readFired = (): string[] => { try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'); } catch { return []; } };
const markFired = (keys: string[]) => {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...readFired(), ...keys].slice(-300))); } catch { /* ignore */ }
};

/**
 * While the app is open, fire this person's alarms on the exact minute. An alarm whose time
 * already passed (e.g. a task created 10 min before its deadline) fires right away instead of
 * being skipped — once, and only the latest one for that moment.
 */
function useLocalAlarms() {
  const { tasks, me, meId } = useData();
  const toast = useToast();
  const { open } = useOpenTask();
  useEffect(() => {
    if (!me || !me.push_enabled) return;
    const now = Date.now();
    const fired = new Set(readFired());
    const mine = tasks.filter((t) => t.assignees.includes(meId) || (!t.assignees.length && t.created_by === meId));
    const all = mine.flatMap(taskAlarms)
      .filter((a) => (a.key.startsWith('start:') ? me.remind_start !== false : a.key.startsWith('due:') ? me.remind_due_soon !== false : true))
      .filter((a) => !fired.has(a.key));
    const ring = (a: (typeof all)[number], title: string) => {
      markFired([a.key]);
      showLocal(title, a.body, `/tasks/all?task=${a.taskId}`, a.key);
      toast.show(title, { label: 'Open', run: () => open(a.taskId) });
    };

    // Missed alarms (up to 30 min late): ring the latest one per moment now, mark the rest as done.
    const late = all.filter((a) => a.at <= now && now - a.at < 30 * 60_000);
    const byMoment = new Map<string, typeof late>();
    for (const a of late) byMoment.set(a.moment, [...(byMoment.get(a.moment) ?? []), a]);
    for (const list of byMoment.values()) {
      const [pick, ...rest] = list.sort((x, y) => x.minutes - y.minutes);
      markFired(rest.map((r) => r.key));
      const t = mine.find((x) => x.id === pick.taskId);
      ring(pick, lateTitle(pick, now, t?.title ?? ''));
    }

    const timers = all
      .filter((a) => a.at > now && a.at - now < 24 * 3600_000)
      .map((a) => setTimeout(() => ring(a, a.title), a.at - now));
    return () => timers.forEach(clearTimeout);
  }, [tasks, me, meId, toast, open]);
}

function Workspace() {
  const { ready, me, update } = useData();
  const [pwDone, setPwDone] = useState(false);
  useLocalAlarms();

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
        <Route path="/board" element={<BoardPage key="me" />} />
        <Route path="/calendar" element={<CalendarPage key="me" />} />
        <Route path="/team/list" element={<TeamListPage />} />
        <Route path="/team/calendar" element={<CalendarPage key="team" scope="team" />} />
        <Route path="/team/board" element={<BoardPage key="team" scope="team" />} />
        <Route path="/team/workload" element={<WorkloadPage />} />
        <Route path="/matrix" element={<MatrixPage />} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingPage />} />
        <Route path="/people" element={<TeamPage />} />
        <Route path="/team" element={<Navigate to="/team/list" replace />} />
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
