import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Shell } from './components/Shell';
import { applyTheme, type Theme } from './components/theme';
import { configured, supabase } from './lib/supabase';
import { registerServiceWorker, showLocal } from './lib/push';
import { lateTitle, taskAlarms } from './lib/alarms';
import { today } from './lib/dates';
import { atToday, happensOn, runOf, visibleTo } from './lib/routines';
import type { Routine } from './lib/types';
import { firstName } from './components/Atoms';
import { RoutinesPage } from './pages/Routines';
import { ProcessesPage, ProcessPage } from './pages/Processes';
const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })));
const ExportPage = lazy(() => import('./pages/Export').then((m) => ({ default: m.ExportPage })));
import { useToast } from './components/Toast';
import { AlertsProvider, useAlerts } from './store/alerts';
import { DataProvider, useData } from './store/data';
import { UiProvider } from './store/ui';
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
  const { raise } = useAlerts();
  useEffect(() => {
    if (!me) return;
    const now = Date.now();
    const fired = new Set(readFired());
    const mine = tasks.filter((t) => t.assignees.includes(meId) || (!t.assignees.length && t.created_by === meId));
    const all = mine.flatMap(taskAlarms)
      .filter((a) => (a.key.startsWith('start:') ? me.remind_start !== false : a.key.startsWith('due:') ? me.remind_due_soon !== false : true))
      .filter((a) => !fired.has(a.key));
    const ring = (a: (typeof all)[number], title: string, popUp = true) => {
      markFired([a.key]);
      if (me.push_enabled && popUp) showLocal(title, a.body, `/tasks/all?task=${a.taskId}`, a.key);
      raise({ key: a.moment, kind: 'task', title, body: a.body, taskId: a.taskId });
    };

    // Missed alarms (up to 12 h late, e.g. the app was closed): show the latest one per moment now,
    // mark the rest as done. The desktop pop-up is only for ones less than 30 min late.
    const late = all.filter((a) => a.at <= now && now - a.at < 12 * 3600_000);
    const byMoment = new Map<string, typeof late>();
    for (const a of late) byMoment.set(a.moment, [...(byMoment.get(a.moment) ?? []), a]);
    for (const list of byMoment.values()) {
      const [pick, ...rest] = list.sort((x, y) => x.minutes - y.minutes);
      markFired(rest.map((r) => r.key));
      const t = mine.find((x) => x.id === pick.taskId);
      ring(pick, lateTitle(pick, now, t?.title ?? ''), now - pick.at < 30 * 60_000);
    }

    const timers = all
      .filter((a) => a.at > now && a.at - now < 24 * 3600_000)
      .map((a) => setTimeout(() => ring(a, a.title), a.at - now));
    return () => timers.forEach(clearTimeout);
  }, [tasks, me, meId, raise]);
}

/**
 * Repeating reminders: ring at their time on their days. A team reminder that someone
 * already picked up (or finished) stays quiet; the toast offers "I'm on it".
 */
function useRoutineAlarms() {
  const { db, me, meId, personById } = useData();
  const toast = useToast();
  const { raise } = useAlerts();
  const latest = useRef(db.routine_runs);
  latest.current = db.routine_runs;
  useEffect(() => {
    if (!me) return;
    const now = Date.now();
    const day = today();
    const fired = new Set(readFired());
    const list = visibleTo(db.routines, meId).filter((r) => happensOn(r, day));
    const ring = (r: Routine, popUp = true) => {
      const key = `routine:${r.id}:${day}`;
      if (readFired().includes(key)) return;
      markFired([key]);
      const run = runOf(latest.current, r.id, day);
      if (run?.done_by || (run?.claimed_by && run.claimed_by !== meId)) return; // someone has it
      const title = r.scope === 'team' ? `Team reminder: ${r.title}` : `Reminder: ${r.title}`;
      const firstNote = (r.note_list?.[0] ?? r.notes ?? '').split('\n')[0];
      if (me.push_enabled && popUp) showLocal(title, r.scope === 'team' ? 'Click “I’m on it” in the app so nobody does it twice.' : firstNote, '/reminders', key);
      raise({ key, kind: 'routine', title, body: firstNote, routineId: r.id, day, team: r.scope === 'team' });
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const r of list) {
      const at = atToday(r, day);
      const key = `routine:${r.id}:${day}`;
      if (fired.has(key)) continue;
      // Earlier today and still not done (e.g. the app was closed): show it now.
      if (at <= now) ring(r, now - at < 30 * 60_000);
      else if (at > now) timers.push(setTimeout(() => ring(r), at - now));
    }
    return () => timers.forEach(clearTimeout);
  }, [db.routines, me, meId, raise]);

  // Tell everyone when a teammate picks up or finishes a team reminder.
  const prev = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const day = today();
    const state = new Map(db.routine_runs.filter((x) => x.day === day)
      .map((x) => [x.routine_id, `${x.claimed_by ?? ''}|${x.done_by ?? ''}`]));
    if (prev.current) {
      for (const [id, st] of state) {
        if (prev.current.get(id) === st) continue;
        const r = db.routines.find((x) => x.id === id);
        const [claimed, done] = st.split('|');
        if (!r || r.scope !== 'team') continue;
        if (done && done !== meId) toast.show(`${firstName(personById.get(done))} finished “${r.title}”`);
        else if (claimed && !done && claimed !== meId) toast.show(`${firstName(personById.get(claimed))} is on “${r.title}”`);
      }
    }
    prev.current = state;
  }, [db.routine_runs, db.routines, meId, personById, toast]);
}

/** Rings task and reminder alarms into the alert stack (and desktop pop-ups when switched on). */
function Alarms() {
  useLocalAlarms();
  useRoutineAlarms();
  return null;
}

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
    <AlertsProvider>
    <Alarms />
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
        <Route path="/reminders" element={<RoutinesPage />} />
        <Route path="/processes" element={<ProcessesPage />} />
        <Route path="/history" element={<Suspense fallback={<div className="page"><div className="empty">Loading…</div></div>}><HistoryPage /></Suspense>} />
        <Route path="/export" element={<Suspense fallback={<div className="page"><div className="empty">Loading…</div></div>}><ExportPage /></Suspense>} />
        <Route path="/processes/:id" element={<ProcessPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingPage />} />
        <Route path="/people" element={<TeamPage />} />
        <Route path="/team" element={<Navigate to="/team/list" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
    </AlertsProvider>
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
