import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, firstName } from '../components/Atoms';
import { fmtDay, fmtTime, toDateStr, today } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { PERMS, ROLE_INFO, type Role } from '../lib/types';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';

interface Entry {
  id: number;
  at: string;
  actor: string | null;
  actor_name: string | null;
  kind: string;
  action: 'insert' | 'update' | 'delete' | 'export' | 'login';
  record_id: string | null;
  title: string | null;
  parent: string | null;
  changes: Record<string, [unknown, unknown]> | null;
  details: string | null;
}

const PAGE = 100;

const AREAS: { id: string; label: string; kinds: string[] }[] = [
  { id: '', label: 'Everything', kinds: [] },
  { id: 'tasks', label: 'Tasks', kinds: ['tasks', 'subtasks', 'task_assignees', 'task_tags', 'task_blockers', 'attachments'] },
  { id: 'processes', label: 'Processes', kinds: ['processes'] },
  { id: 'meetings', label: 'Meetings', kinds: ['meetings', 'meeting_actions', 'meeting_tasks'] },
  { id: 'checklist', label: 'Checklist', kinds: ['checklist_items', 'checklist_checks'] },
  { id: 'reminders', label: 'Reminders', kinds: ['routines', 'routine_runs'] },
  { id: 'people', label: 'People & access', kinds: ['profiles', 'role_permissions', 'tags'] },
  { id: 'export', label: 'Exports', kinds: ['export'] },
  { id: 'login', label: 'Logins', kinds: ['login'] },
];

const FIELD: Record<string, string> = {
  title: 'Title', status: 'Status', priority: 'Priority', given_by: 'Given by', category: 'Category',
  do_date: 'Do date', do_time: 'Do time', deadline: 'Deadline', deadline_time: 'Deadline time',
  follow_up_date: 'Follow-up date', follow_up_time: 'Follow-up time', follow_up_with: 'Follow up with',
  start_alerts: 'Start alarms', deadline_alerts: 'Deadline alarms', notes: 'Notes', remind_at: 'Reminder',
  done: 'Done', label: 'Label', active: 'Active', only_day: 'Only on', scope: 'For', name: 'Name', color: 'Colour',
  starts_at: 'Date', attendees: 'Attendees', agenda: 'Agenda', decisions: 'Decisions', text: 'Text',
  at_time: 'Time', days: 'Days', outline: 'Steps', scene: 'Drawing', view: 'View', visibility: 'Visibility',
  owner_id: 'Owner', full_name: 'Name', email: 'Email', role: 'Access', allowed: 'Allowed',
  claimed_by: 'Picked up by', done_by: 'Done by', task_id: 'Task',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERM_LABEL = Object.fromEntries(PERMS.flatMap((g) => g.items.map((i) => [i.id, `${g.group} · ${i.label}`])));

export function HistoryPage() {
  const { me, people, personById, db } = useData();
  const isAdmin = me?.role === 'admin';
  const nav = useNavigate();
  const { open } = useOpenTask();
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [who, setWho] = useState('');
  const [area, setArea] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // applied search (debounced)

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    let req = supabase.from('activity_log').select('*').order('id', { ascending: false }).limit(PAGE);
    if (before) req = req.lt('id', before);
    if (who === 'system') req = req.is('actor', null); else if (who) req = req.eq('actor', who);
    const kinds = AREAS.find((a) => a.id === area)?.kinds ?? [];
    if (kinds.length) req = req.in('kind', kinds);
    if (from) req = req.gte('at', new Date(`${from}T00:00:00`).toISOString());
    if (to) req = req.lt('at', new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString());
    if (query) req = req.or(`title.ilike.%${query.replace(/[%,()]/g, ' ')}%,parent.ilike.%${query.replace(/[%,()]/g, ' ')}%`);
    const { data, error } = await req;
    setLoading(false);
    if (error) { if (/activity_log/.test(error.message)) setMissing(true); return; }
    const list = (data ?? []) as Entry[];
    setRows((cur) => (before ? [...cur, ...list] : list));
    setMore(list.length === PAGE);
  }, [who, area, from, to, query]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // New entries appear live (only when not looking at a filtered/older slice).
  const live = !who && !area && !from && !to && !query;
  useEffect(() => {
    if (!isAdmin || !live) return;
    const ch = supabase.channel('history')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (p) => {
        setRows((cur) => (cur.some((r) => r.id === (p.new as Entry).id) ? cur : [p.new as Entry, ...cur]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, live]);

  const groups = useMemo(() => {
    const out: { day: string; items: Entry[] }[] = [];
    for (const r of rows) {
      const day = toDateStr(new Date(r.at));
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(r);
    }
    return out;
  }, [rows]);

  if (!isAdmin) return <div className="page"><div className="empty">Only admins can see the history.</div></div>;

  const name = (id: unknown) => (typeof id === 'string' ? firstName(personById.get(id)) || 'someone' : '—');
  const fmt = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'claimed_by' || field === 'done_by' || field === 'owner_id') return name(v);
    if (field === 'role') return ROLE_INFO[v as Role]?.label ?? String(v);
    if (typeof v === 'boolean') return field === 'allowed' ? (v ? 'on' : 'off') : v ? 'yes' : 'no';
    if (field === 'days' && Array.isArray(v)) return v.map((d) => DAYS[d as number]).join(' ');
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDay(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return `${fmtDay(toDateStr(new Date(v)))} ${fmtTime(v)}`;
    if (typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0, 5);
    if (field === 'scene') return 'changed';
    return String(v);
  };

  /** "Lina moved task #7 Send contract to Done" */
  const describe = (r: Entry): { text: ReactNode; showChanges: boolean } => {
    const c = r.changes ?? {};
    const keys = Object.keys(c);
    const T = (s: string | null) => <b className="hist-obj">{s || 'something'}</b>;
    const on = r.parent ? <> on {T(r.parent)}</> : null;
    const verb = { insert: 'created', update: 'edited', delete: 'deleted' }[r.action as 'insert'] ?? r.action;
    switch (r.kind) {
      case 'tasks':
        if (r.action === 'update' && keys.length === 1 && keys[0] === 'status') return { text: <>moved task {T(r.title)} to <b>{String(c.status[1])}</b></>, showChanges: false };
        return { text: <>{verb} task {T(r.title)}</>, showChanges: true };
      case 'subtasks':
        if (r.action === 'update' && keys.length === 1 && keys[0] === 'done') return { text: <>{c.done[1] ? 'ticked' : 'unticked'} sub-task {T(r.title)}{on}</>, showChanges: false };
        return { text: <>{{ insert: 'added', update: 'edited', delete: 'removed' }[r.action as 'insert']} sub-task {T(r.title)}{on}</>, showChanges: r.action === 'update' };
      case 'task_assignees': return { text: r.action === 'insert' ? <>assigned {T(r.title)} to {T(r.parent)}</> : <>unassigned {T(r.title)} from {T(r.parent)}</>, showChanges: false };
      case 'task_tags': return { text: r.action === 'insert' ? <>tagged {T(r.parent)} with {T(r.title)}</> : <>removed tag {T(r.title)} from {T(r.parent)}</>, showChanges: false };
      case 'task_blockers': return { text: r.action === 'insert' ? <>marked {T(r.parent)} as waiting on {T(r.title)}</> : <>removed blocker {T(r.title)} from {T(r.parent)}</>, showChanges: false };
      case 'attachments': return { text: r.action === 'delete' ? <>removed file {T(r.title)}{on}</> : <>attached {T(r.title)}{on}</>, showChanges: false };
      case 'meetings': return { text: <>{verb} meeting {T(r.title)}</>, showChanges: true };
      case 'meeting_actions': return { text: <>{{ insert: 'added', update: 'edited', delete: 'removed' }[r.action as 'insert']} action item {T(r.title)} in meeting {T(r.parent)}</>, showChanges: r.action === 'update' };
      case 'meeting_tasks': return { text: r.action === 'insert' ? <>linked {T(r.title)} to meeting {T(r.parent)}</> : <>unlinked {T(r.title)} from meeting {T(r.parent)}</>, showChanges: false };
      case 'checklist_items':
        if (r.action === 'update' && c.active && c.active[1] === false) return { text: <>removed checklist item {T(r.title)}</>, showChanges: false };
        return { text: <>{{ insert: 'added', update: 'edited', delete: 'deleted' }[r.action as 'insert']} {r.details === 'personal' ? 'personal ' : ''}checklist item {T(r.title)}</>, showChanges: r.action === 'update' };
      case 'checklist_checks': return { text: <>{r.action === 'delete' ? 'unticked' : 'ticked'} {T(r.title)} on the checklist{r.details ? ` for ${fmtDay(r.details)}` : ''}</>, showChanges: false };
      case 'routines':
        if (r.action === 'update' && keys.length === 1 && keys[0] === 'active') return { text: <>{c.active[1] ? 'resumed' : 'paused'} reminder {T(r.title)}</>, showChanges: false };
        return { text: <>{verb} reminder {T(r.title)}</>, showChanges: r.action === 'update' };
      case 'routine_runs': {
        const done = c.done_by && (r.action === 'insert' ? c.done_by : (c.done_by as unknown[])[1]);
        const claimed = c.claimed_by && (r.action === 'insert' ? c.claimed_by : (c.claimed_by as unknown[])[1]);
        const day = r.details ? ` (${fmtDay(r.details)})` : '';
        if (r.action === 'delete') return { text: <>reset reminder {T(r.title)}{day}</>, showChanges: false };
        if (done) return { text: <>marked reminder {T(r.title)} as done{day}</>, showChanges: false };
        if (claimed) return { text: <>picked up reminder {T(r.title)}{day}</>, showChanges: false };
        return { text: <>let go of reminder {T(r.title)}{day}</>, showChanges: false };
      }
      case 'processes':
        if (r.action === 'update' && keys.length === 1 && keys[0] === 'scene') return { text: <>edited the drawing of process {T(r.title)}</>, showChanges: false };
        return { text: <>{verb} {r.details === 'private' ? 'private ' : ''}process {T(r.title)}</>, showChanges: true };
      case 'tags': return { text: <>{verb} tag {T(r.title)}</>, showChanges: true };
      case 'profiles':
        if (r.action === 'insert') return { text: <>added {T(r.title)} to the team</>, showChanges: false };
        if (r.action === 'delete') return { text: <>removed {T(r.title)} from the team</>, showChanges: false };
        if (keys.length === 1 && keys[0] === 'role') return { text: <>changed {T(r.title)}’s access from <b>{fmt('role', c.role[0])}</b> to <b>{fmt('role', c.role[1])}</b></>, showChanges: false };
        return { text: <>updated {T(r.title)}’s details</>, showChanges: true };
      case 'role_permissions': {
        const [role, perm] = (r.title ?? ':').split(': ');
        const allowed = r.action === 'update' ? (c.allowed as unknown[])?.[1] : undefined;
        return { text: <>{allowed === undefined ? 'set' : allowed ? 'allowed' : 'took away'} <b className="hist-obj">{PERM_LABEL[perm] ?? perm}</b> for <b>{ROLE_INFO[role as Role]?.label ?? role}</b></>, showChanges: false };
      }
      case 'export': return { text: <>exported {T(r.title)}</>, showChanges: false };
      case 'login': return { text: <>logged in</>, showChanges: false };
      default: return { text: <>{verb} {r.kind} {T(r.title)}</>, showChanges: true };
    }
  };

  const target = (r: Entry): (() => void) | null => {
    if (r.action === 'delete' || !r.record_id) return null;
    if (['tasks', 'subtasks', 'task_assignees', 'task_tags', 'task_blockers'].includes(r.kind) || (r.kind === 'attachments' && r.parent?.startsWith('#'))) {
      return db.tasks.some((t) => t.id === r.record_id) ? () => open(r.record_id!) : null;
    }
    if (['meetings', 'meeting_actions', 'meeting_tasks'].includes(r.kind) || r.kind === 'attachments') {
      return db.meetings.some((m) => m.id === r.record_id) ? () => nav(`/meetings/${r.record_id}`) : null;
    }
    if (r.kind === 'processes') return db.processes.some((p) => p.id === r.record_id) ? () => nav(`/processes/${r.record_id}`) : null;
    return null;
  };

  const filtered = !live;
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <h1>History</h1>
        <span className="muted" style={{ fontSize: 13 }}>Every change made in the app, newest first · only admins see this page</span>
      </div>

      <div className="exp-filters">
        <label className="exp-field">
          <span className="exp-label">Who</span>
          <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            <option value="system">System (automatic)</option>
          </select>
        </label>
        <label className="exp-field">
          <span className="exp-label">What</span>
          <select className="input" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <div className="exp-field">
          <span className="exp-label">Dates</span>
          <span className="row-gap" style={{ gap: 6 }}>
            <input type="date" className="input exp-date" value={from} max={to || undefined} aria-label="From" onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">to</span>
            <input type="date" className="input exp-date" value={to} min={from || undefined} aria-label="To" onChange={(e) => setTo(e.target.value)} />
            <button className="btn ghost sm" onClick={() => { setFrom(today()); setTo(today()); }}>Today</button>
          </span>
        </div>
        <label className="exp-field" style={{ flex: 1, minWidth: 180 }}>
          <span className="exp-label">Search</span>
          <input className="input" placeholder="Task, process, person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {filtered && <button className="btn ghost sm" onClick={() => { setWho(''); setArea(''); setFrom(''); setTo(''); setQ(''); }}>Clear filters</button>}
      </div>

      {missing ? (
        <div className="empty">History isn’t switched on yet — run <b>upgrade-7.sql</b> in Supabase.</div>
      ) : rows.length === 0 && !loading ? (
        <div className="empty">{filtered ? 'Nothing matches these filters.' : 'Nothing recorded yet. Changes will appear here from now on.'}</div>
      ) : (
        <div className="hist">
          {groups.map((g) => (
            <section key={g.day}>
              <div className="hist-day">{g.day === today() ? 'Today' : fmtDay(g.day)}</div>
              {g.items.map((r) => {
                const person = r.actor ? personById.get(r.actor) : undefined;
                const { text, showChanges } = describe(r);
                const go = target(r);
                const changes = showChanges && r.changes ? Object.entries(r.changes) : [];
                return (
                  <div key={r.id} className={`hist-row ${go ? 'link' : ''}`} onClick={go ?? undefined} role={go ? 'button' : undefined} tabIndex={go ? 0 : undefined}
                    onKeyDown={(e) => { if (go && e.key === 'Enter') go(); }}>
                    <span className="hist-time mono">{fmtTime(r.at)}</span>
                    <span className="hist-av">{r.actor ? <Avatar person={person ?? { id: r.actor, full_name: r.actor_name ?? '?', email: '', color: '#888' } as never} /> : <span className="hist-sys">⚙</span>}</span>
                    <span className="hist-body">
                      <span><b>{r.actor ? (person?.full_name || r.actor_name || 'Removed person') : 'System'}</b> {text}</span>
                      {changes.length > 0 && (
                        <span className="hist-changes">
                          {changes.map(([f, [a, b]]) => (
                            <span key={f} className="hist-chg">
                              <span className="muted">{FIELD[f] ?? f}:</span> <s>{fmt(f, a)}</s> → <span>{fmt(f, b)}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
          {loading && <div className="empty">Loading…</div>}
          {more && !loading && <button className="btn" style={{ alignSelf: 'center', margin: '12px 0' }} onClick={() => load(rows[rows.length - 1]?.id)}>Load older</button>}
        </div>
      )}
    </div>
  );
}
