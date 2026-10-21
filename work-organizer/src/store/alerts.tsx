// Sticky in-app alerts: stacked on the right, pulsing, until you click Done or snooze them.
// Kept in this browser (per person), so they survive a reload.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { firstName } from '../components/Atoms';
import { IconBell, IconX } from '../components/Icons';
import { useToast } from '../components/Toast';
import { fmtTime, today } from '../lib/dates';
import { showLocal } from '../lib/push';
import { claimRun, finishRun, runOf } from '../lib/routines';
import { useData } from './data';
import { useOpenTask } from './ui';

export interface AppAlert {
  key: string;
  kind: 'task' | 'routine';
  title: string;
  body: string;
  /** when it first rang (ms) */
  firedAt: number;
  /** hidden until this time (ms) */
  snoozeUntil?: number;
  taskId?: string;
  routineId?: string;
  day?: string;
  team?: boolean;
}

interface Ctx {
  alerts: AppAlert[];
  raise: (a: Omit<AppAlert, 'firedAt'>) => void;
}

const AlertCtx = createContext<Ctx | null>(null);
export const useAlerts = () => {
  const c = useContext(AlertCtx);
  if (!c) throw new Error('useAlerts outside AlertsProvider');
  return c;
};

const SNOOZES: [string, number][] = [['15 min', 15], ['30 min', 30], ['1 hour', 60], ['1 day', 1440]];

/** A short two-note chime. Browsers only allow sound after you've clicked somewhere on the page. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.4);
    });
    setTimeout(() => ac.close(), 1200);
  } catch { /* no sound available */ }
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { meId, me, tasks, db, ready } = useData();
  const storeKey = `wo-alerts:${meId}`;
  const [alerts, setAlerts] = useState<AppAlert[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; }
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(alerts)); } catch { /* ignore */ } }, [alerts, storeKey]);
  // Other tabs of the app share the same list.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === storeKey && e.newValue) { try { setAlerts(JSON.parse(e.newValue)); } catch { /* ignore */ } } };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [storeKey]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  // Same moment again (e.g. "due in 1 h" then "due in 15 min") replaces the older card.
  const raise = useCallback((a: Omit<AppAlert, 'firedAt'>) => {
    setAlerts((cur) => [...cur.filter((x) => x.key !== a.key), { ...a, firedAt: Date.now() }]);
  }, []);

  // Gone or already handled elsewhere → remove it.
  useEffect(() => {
    if (!ready) return;
    setAlerts((cur) => {
      const next = cur.filter((a) => {
        if (a.kind === 'task') { const t = tasks.find((x) => x.id === a.taskId); return !!t && t.status !== 'Done'; }
        const r = db.routines.find((x) => x.id === a.routineId);
        if (!r || !r.active) return false;
        const run = runOf(db.routine_runs, r.id, a.day ?? today());
        return !run?.done_by && !(run?.claimed_by && run.claimed_by !== meId);
      });
      return next.length === cur.length ? cur : next;
    });
  }, [ready, tasks, db.routines, db.routine_runs, meId]);

  // Chime + desktop pop-up whenever an alert (re)appears.
  const visible = useMemo(() => alerts.filter((a) => !a.snoozeUntil || a.snoozeUntil <= now), [alerts, now]);
  const shown = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(visible.map((a) => `${a.key}@${a.snoozeUntil ?? 0}`));
    if (shown.current) {
      const fresh = visible.filter((a) => !shown.current!.has(`${a.key}@${a.snoozeUntil ?? 0}`));
      if (fresh.length) {
        chime();
        if (me?.push_enabled) for (const a of fresh.filter((x) => x.snoozeUntil)) showLocal(a.title, a.body || 'Snoozed reminder', '/', a.key);
      }
    }
    shown.current = keys;
  }, [visible, me?.push_enabled]);

  // "(2) Work Organizer" in the browser tab while something waits for you.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = visible.length ? `(${visible.length}) ${base}` : base;
  }, [visible.length]);

  const value = useMemo(() => ({ alerts, raise }), [alerts, raise]);
  return (
    <AlertCtx.Provider value={value}>
      {children}
      <AlertStack visible={visible} snoozedCount={alerts.length - visible.length}
        done={(key) => setAlerts((cur) => cur.filter((a) => a.key !== key))}
        snooze={(key, min) => setAlerts((cur) => cur.map((a) => (a.key === key ? { ...a, snoozeUntil: Date.now() + min * 60_000 } : a)))} />
    </AlertCtx.Provider>
  );
}

function AlertStack({ visible, snoozedCount, done, snooze }: {
  visible: AppAlert[]; snoozedCount: number; done: (key: string) => void; snooze: (key: string, min: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!visible.length) return null;
  const MAX = 4;
  const list = [...visible].sort((a, b) => b.firedAt - a.firedAt);
  const shownList = expanded ? list : list.slice(0, MAX);
  return (
    <div className={`alerts ${expanded ? 'expanded' : ''}`} role="region" aria-label="Alerts" aria-live="assertive">
      {shownList.map((a) => <AlertCard key={a.key} a={a} done={done} snooze={snooze} />)}
      {list.length > MAX && (
        <button className="alerts-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `+ ${list.length - MAX} more waiting`}
        </button>
      )}
      {snoozedCount > 0 && <span className="alerts-snoozed">{snoozedCount} snoozed</span>}
    </div>
  );
}

function AlertCard({ a, done, snooze }: { a: AppAlert; done: (key: string) => void; snooze: (key: string, min: number) => void }) {
  const { meId, can, update, reload, db, personById, taskById } = useData();
  const task = a.taskId ? taskById.get(a.taskId) : undefined;
  const canStatus = can('task_status') || can('task_edit');
  // A task that isn't started yet gets "Start task"; one already in progress just "Got it".
  const canStart = a.kind === 'task' && canStatus && !!task && task.status !== 'In progress';
  const { open } = useOpenTask();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = a.routineId ? runOf(db.routine_runs, a.routineId, a.day ?? today()) : undefined;
  const mineNow = run?.claimed_by === meId;

  const finish = async () => {
    setBusy(true);
    try {
      if (a.kind === 'routine' && a.routineId && can('routine_do')) {
        const res = await finishRun(a.routineId, a.day ?? today(), meId);
        if (res.error) { toast.error(res.error.message); return; }
        await reload('routine_runs');
      }
      done(a.key);
    } finally { setBusy(false); }
  };
  const claim = async () => {
    setBusy(true);
    try {
      const other = await claimRun(a.routineId!, a.day ?? today(), meId);
      await reload('routine_runs');
      if (other) { toast.error(`${firstName(personById.get(other))} is already on it.`); done(a.key); }
    } finally { setBusy(false); }
  };
  const startTask = async () => {
    setBusy(true);
    try { await update('tasks', { id: a.taskId! }, { status: 'In progress' }); done(a.key); toast.show(`“${task?.title}” is now In progress`); }
    finally { setBusy(false); }
  };
  const taskDone = async () => {
    setBusy(true);
    try { await update('tasks', { id: a.taskId! }, { status: 'Done' }); done(a.key); } finally { setBusy(false); }
  };

  return (
    <div className={`alert-card ${a.kind}`} role="alertdialog" aria-label={a.title}>
      <span className="alert-icon" aria-hidden><IconBell size={15} /></span>
      <div className="alert-main">
        <div className="alert-title">{a.title}</div>
        {a.body && <div className="alert-body">{a.body}</div>}
        <div className="alert-meta">
          {a.kind === 'routine' ? (a.team ? 'Team reminder' : 'Reminder') : 'Task'} · rang at {fmtTime(new Date(a.firedAt).toISOString())}
          {a.snoozeUntil && ' · snoozed before'}
          {mineNow && ' · you’re on it'}
        </div>
        {menu ? (
          <div className="alert-actions">
            <span className="muted" style={{ fontSize: 12 }}>Remind me again in</span>
            {SNOOZES.map(([label, min]) => (
              <button key={min} className="btn sm" onClick={() => { snooze(a.key, min); setMenu(false); }}>{label}</button>
            ))}
            <button className="btn ghost sm icon" aria-label="Back" onClick={() => setMenu(false)}><IconX size={12} /></button>
          </div>
        ) : (
          <div className="alert-actions">
            {a.kind === 'routine' ? (
              <button className="btn primary sm" disabled={busy} onClick={finish} title="Mark this reminder done (also ticks it on the checklist)">Done</button>
            ) : canStart ? (
              <button className="btn primary sm" disabled={busy} onClick={startTask} title="Move the task to In progress and close this alert">Start task</button>
            ) : (
              <button className="btn primary sm" disabled={busy} onClick={finish} title="Close this alert">Got it</button>
            )}
            <button className="btn sm" disabled={busy} onClick={() => setMenu(true)}>Snooze…</button>
            {a.kind === 'routine' && a.team && !run?.claimed_by && can('routine_do') && <button className="btn sm" disabled={busy} onClick={claim}>I’m on it</button>}
            {a.kind === 'task' && <button className="btn ghost sm" onClick={() => open(a.taskId!)}>Open</button>}
            {a.kind === 'task' && canStatus && <button className="btn ghost sm" disabled={busy} onClick={taskDone}>Mark task done</button>}
          </div>
        )}
      </div>
    </div>
  );
}
