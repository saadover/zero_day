import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { addDays, addMonths, dueLabel, fmtDay, fmtMonth, hhmm, startOfMonth, startOfWeek, today } from '../lib/dates';
import type { DateField, GroupKey } from '../lib/tasks';
import { PRIORITY_RANK, quadrant, STATUS_RANK, TIME_FIELD } from '../lib/tasks';
import type { Profile, Status, Task } from '../lib/types';
import { CATEGORIES, PRIORITIES, STATUSES } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask, useUi, type QuickAddDefaults } from '../store/ui';
import { Avatar, Avatars, firstName, TagChip } from './Atoms';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconUsers, PriorityIcon, StatusIcon } from './Icons';
import { TaskRow } from './TaskRow';
import { useToast } from './Toast';
import { sameTaskHover, taskColor } from '../lib/taskColor';
import { isOverdue } from '../lib/tasks';

// ───────────────────────────── List ─────────────────────────────

interface Group { key: string; label: ReactNode; tasks: Task[]; defaults?: QuickAddDefaults }

export function useGroups(tasks: Task[], group: GroupKey): Group[] {
  const { people, personById, db } = useData();
  return useMemo(() => {
    if (group === 'none') return [{ key: 'all', label: null, tasks }];
    const map = new Map<string, Task[]>();
    const add = (k: string, t: Task) => { if (!map.has(k)) map.set(k, []); map.get(k)!.push(t); };
    for (const t of tasks) {
      if (group === 'status') add(t.status, t);
      else if (group === 'priority') add(t.priority, t);
      else if (group === 'category') add(t.category ?? '—', t);
      else if (group === 'person') (t.assignees.length ? t.assignees : ['—']).forEach((a) => add(a, t));
      else if (group === 'tag') (t.tags.length ? t.tags : ['—']).forEach((a) => add(a, t));
    }
    let order: string[] = [];
    if (group === 'status') order = [...STATUSES];
    if (group === 'priority') order = [...PRIORITIES];
    if (group === 'category') order = [...CATEGORIES, '—'];
    if (group === 'person') order = [...people.map((p) => p.id), '—'];
    if (group === 'tag') order = [...db.tags.map((t) => t.id), '—'];
    return order.filter((k) => map.has(k)).map((k) => {
      let label: ReactNode = k;
      let defaults: QuickAddDefaults | undefined;
      if (group === 'status') { label = <><StatusIcon status={k} /> {k}</>; defaults = { status: k as Status }; }
      if (group === 'priority') { label = <><PriorityIcon priority={k} /> {k}</>; defaults = { priority: k as Task['priority'] }; }
      if (group === 'person') {
        const p = personById.get(k);
        label = p ? <><Avatar person={p} /> {p.full_name || p.email}</> : 'Unassigned';
        defaults = p ? { assignees: [k] } : undefined;
      }
      if (group === 'tag') { const t = db.tags.find((x) => x.id === k); label = t ? <TagChip tag={t} /> : 'No tag'; }
      if (group === 'category' && k === '—') label = 'No category';
      return { key: k, label, tasks: map.get(k)!, defaults };
    });
  }, [tasks, group, people, personById, db.tags]);
}

export function ListView({ tasks, group, dateField = 'deadline', addDefaults, emptyText = 'Nothing here.' }: {
  tasks: Task[]; group: GroupKey; dateField?: DateField; addDefaults?: QuickAddDefaults; emptyText?: string;
}) {
  const groups = useGroups(tasks, group);
  const { openQuickAdd } = useUi();
  return (
    <div className="list">
      {tasks.length === 0 && <div className="empty">{emptyText}</div>}
      {groups.map((g) => (
        <section key={g.key}>
          {g.label !== null && <div className="grp">{g.label}<span className="n">{g.tasks.length}</span></div>}
          {g.tasks.map((t) => <TaskRow key={`${g.key}-${t.id}`} task={t} dateField={dateField} />)}
        </section>
      ))}
      <button className="add-row" onClick={() => openQuickAdd(addDefaults)}><IconPlus size={13} /> Add task</button>
    </div>
  );
}

// ───────────────────────────── Board ─────────────────────────────

function useDrop(onDrop: (taskId: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/task'); if (id) onDrop(id); },
    },
  };
}

const dragProps = (id: string) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => { e.dataTransfer.setData('text/task', id); e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging'); },
  onDragEnd: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('dragging'),
});

/** First ~18 words of the notes, for previews. */
const snippet = (text: string, words = 18) => {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, words).join(' ') + (w.length > words ? '…' : '') : '';
};

export function TaskCard({ task, expandAll = false }: { task: Task; expandAll?: boolean }) {
  const { personById, db } = useData();
  const { open } = useOpenTask();
  const [own, setOwn] = useState<boolean | null>(null);
  const expanded = own ?? expandAll;
  const d = dueLabel(task.deadline, task.status === 'Done', task.deadline_time);
  const subsDone = task.subtasks.filter((s) => s.done).length;
  const color = taskColor(task.id);
  const files = db.attachments.filter((a) => a.task_id === task.id).length;
  const late = isOverdue(task);
  const dateLine = (label: string, date: string | null, time: string | null) => date && (
    <div className="pv-row"><span className="pv-k">{label}</span><span className="mono">{fmtDay(date)}{time ? ` · ${hhmm(time)}` : ''}</span></div>
  );

  return (
    <article className={`card ${late ? 'card-late' : ''}`} {...dragProps(task.id)} {...sameTaskHover(task.id)} onClick={() => open(task.id)} tabIndex={0}
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}
      onKeyDown={(e) => { if (e.key === 'Enter') open(task.id); }}>
      <div className="ct">{task.title}</div>
      {(task.tags.length > 0 || task.blocked || late) && (
        <div className="cm">
          {late && <span className="badge-late">OVERDUE</span>}
          {task.blocked && <span className="badge-block">BLOCKED</span>}
          {task.tags.slice(0, 3).map((id) => { const t = db.tags.find((x) => x.id === id); return t ? <TagChip key={id} tag={t} /> : null; })}
        </div>
      )}
      {expanded && (
        <div className="preview" onClick={(e) => e.stopPropagation()}>
          {dateLine('Deadline', task.deadline, task.deadline_time)}
          {dateLine('Do', task.do_date, task.do_time)}
          {task.follow_up_date && (
            <div className="pv-row"><span className="pv-k">Follow up</span><span>{fmtDay(task.follow_up_date)}{task.follow_up_with ? ` · ${task.follow_up_with}` : ''}</span></div>
          )}
          {task.notes.trim() && <p className="pv-notes">{snippet(task.notes)}</p>}
          {task.subtasks.length > 0 && (
            <div className="pv-subs">
              {task.subtasks.slice(0, 4).map((s) => (
                <div key={s.id} className={s.done ? 'done' : ''}><span className={`pv-box ${s.done ? 'on' : ''}`} />{s.title}</div>
              ))}
              {task.subtasks.length > 4 && <div className="muted">+{task.subtasks.length - 4} more</div>}
            </div>
          )}
          <div className="pv-row muted">
            {task.assignees.length ? task.assignees.map((id) => firstName(personById.get(id))).join(', ') : 'Nobody assigned'}
            {task.given_by ? ` · from ${task.given_by}` : ''}{files ? ` · ${files} file${files > 1 ? 's' : ''}` : ''}
          </div>
        </div>
      )}
      <div className="cm">
        <PriorityIcon priority={task.priority} />
        <span className="mono" style={{ fontSize: 11.5 }}>#{task.number}</span>
        {task.subtasks.length > 0 && <span className="mono" style={{ fontSize: 11.5 }}>{subsDone}/{task.subtasks.length}</span>}
        {task.assignees.length > 1 && <span title="Shared by several people" style={{ display: 'inline-flex' }}><IconUsers size={12} /></span>}
        <span className={`due ${d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'soon' : ''}`}>{d.text}</span>
        <Avatars ids={task.assignees} byId={personById} />
        <button className="card-toggle" aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'} title={expanded ? 'Hide details' : 'Show details'}
          onClick={(e) => { e.stopPropagation(); setOwn(!expanded); }}>
          <IconChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        </button>
      </div>
    </article>
  );
}

function BoardColumn({ status, tasks, expandAll }: { status: Status; tasks: Task[]; expandAll: boolean }) {
  const { updateTask } = useActions();
  const { taskById } = useData();
  const toast = useToast();
  const { openQuickAdd } = useUi();
  const drop = useDrop((id) => {
    const t = taskById.get(id);
    if (!t || t.status === status) return;
    const before = t.status;
    updateTask(id, { status });
    toast.show(`#${t.number} → ${status}`, { label: 'Undo', run: () => updateTask(id, { status: before }) });
  });
  return (
    <section className={`col ${drop.over ? 'over' : ''}`} {...drop.props} aria-label={status}>
      <div className="col-h"><StatusIcon status={status} />{status}<span className="n">{tasks.length}</span></div>
      {tasks.map((t) => <TaskCard key={t.id} task={t} expandAll={expandAll} />)}
      <button className="add-row" style={{ borderRadius: 8, height: 34 }} onClick={() => openQuickAdd({ status })}>
        <IconPlus size={13} /> Add
      </button>
    </section>
  );
}

export function BoardView({ tasks, doneLimit = 15 }: { tasks: Task[]; doneLimit?: number }) {
  const [expandAll, setExpandAllState] = useState(() => { try { return localStorage.getItem('board-details') === '1'; } catch { return false; } });
  const setExpandAll = (v: boolean) => { setExpandAllState(v); try { localStorage.setItem('board-details', v ? '1' : '0'); } catch { /* ignore */ } };
  return (
    <>
    <div className="row-gap" style={{ marginBottom: 10 }}>
      <label className="check" style={{ fontSize: 12.5 }}>
        <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.target.checked)} /> Show details on all cards
      </label>
      <span className="muted" style={{ fontSize: 12 }}>Or use the ▾ on a card · hover a task to see it highlighted everywhere</span>
    </div>
    <div className="board">
      {STATUSES.map((s) => {
        let list = tasks.filter((t) => t.status === s);
        if (s === 'Done') list = list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, doneLimit);
        return <BoardColumn key={s} status={s} tasks={list} expandAll={expandAll} />;
      })}
    </div>
    </>
  );
}

// ───────────────────────────── Calendar ─────────────────────────────

export type ColorBy = 'priority' | 'person';

function chipStyle(t: Task, colorBy: ColorBy, personById: Map<string, Profile>): CSSProperties | undefined {
  if (colorBy !== 'person') return undefined;
  const c = personById.get(t.assignees[0] ?? '')?.color ?? '#8E8E89';
  return { borderLeftColor: c, background: `color-mix(in srgb, ${c} 14%, var(--surface))` };
}

function Chip({ t, field, colorBy }: { t: Task; field: DateField; colorBy: ColorBy }) {
  const { open } = useOpenTask();
  const { personById } = useData();
  const tm = hhmm(t[TIME_FIELD[field]]);
  const who = t.assignees.map((id) => firstName(personById.get(id))).join(', ');
  return (
    <div className={`chip ${colorBy === 'priority' ? t.priority : ''} ${t.status === 'Done' ? 'done' : ''}`} style={chipStyle(t, colorBy, personById)}
      {...dragProps(t.id)} {...sameTaskHover(t.id)} onClick={() => open(t.id)} title={`${t.title}${who ? ` — ${who}` : ''}`}>
      <span className="chip-dot" style={{ background: taskColor(t.id) }} />
      {tm && <span className="mono" style={{ fontSize: 10.5, marginRight: 4, opacity: 0.8 }}>{tm}</span>}
      {colorBy === 'person' && t.assignees.length > 1 && <span className="mono" style={{ fontSize: 10.5, marginRight: 4 }}>+{t.assignees.length - 1}</span>}
      {t.title}
    </div>
  );
}

const byTime = (field: DateField) => (a: Task, b: Task) =>
  (STATUS_RANK[a.status] === 3 ? 1 : 0) - (STATUS_RANK[b.status] === 3 ? 1 : 0)
  || (a[TIME_FIELD[field]] ?? '99').localeCompare(b[TIME_FIELD[field]] ?? '99')
  || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

function useDayDrop(day: string, field: DateField) {
  const { updateTask } = useActions();
  const toast = useToast();
  const { taskById } = useData();
  return useDrop((id) => {
    const t = taskById.get(id);
    if (!t || t[field] === day) return;
    const before = t[field];
    updateTask(id, { [field]: day });
    toast.show(`#${t.number} moved to ${fmtDay(day)}`, { label: 'Undo', run: () => updateTask(id, { [field]: before }) });
  });
}

function CalCell({ day, month, tasks, field, colorBy }: { day: string; month: string; tasks: Task[]; field: DateField; colorBy: ColorBy }) {
  const { openQuickAdd } = useUi();
  const drop = useDayDrop(day, field);
  const out = day.slice(0, 7) !== month.slice(0, 7);
  const sorted = [...tasks].sort(byTime(field));
  return (
    <div className={`cell ${out ? 'out' : ''} ${day === today() ? 'today' : ''} ${drop.over ? 'over' : ''}`} {...drop.props}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) openQuickAdd({ [field]: day }); }}>
      <div className="dn"><b>{Number(day.slice(8))}</b></div>
      {sorted.slice(0, 5).map((t) => <Chip key={t.id} t={t} field={field} colorBy={colorBy} />)}
      {sorted.length > 5 && <span className="muted" style={{ fontSize: 11.5, padding: '0 4px' }}>+{sorted.length - 5} more</span>}
    </div>
  );
}

function WeekCol({ day, tasks, field, colorBy }: { day: string; tasks: Task[]; field: DateField; colorBy: ColorBy }) {
  const { openQuickAdd } = useUi();
  const drop = useDayDrop(day, field);
  return (
    <div className={`wcol ${day === today() ? 'today' : ''} ${drop.over ? 'over' : ''}`} {...drop.props}>
      <div className="wh"><span>{fmtDay(day).split(' ')[0]}</span><b>{Number(day.slice(8))}</b></div>
      {[...tasks].sort(byTime(field)).map((t) => <Chip key={t.id} t={t} field={field} colorBy={colorBy} />)}
      <button className="add-row" style={{ height: 30, padding: '0 6px', fontSize: 12 }} onClick={() => openQuickAdd({ [field]: day })}><IconPlus size={12} /> Add</button>
    </div>
  );
}

export function CalendarView({ tasks, field, colorBy = 'priority', setColorBy }: {
  tasks: Task[]; field: DateField; colorBy?: ColorBy; setColorBy?: (c: ColorBy) => void;
}) {
  const { people } = useData();
  const [mode, setMode] = useState<'month' | 'week'>(() => (sessionStorage.getItem('cal-mode') as 'month' | 'week') || 'month');
  const [anchor, setAnchor] = useState(today());
  const [hidden, setHidden] = useState<string[]>([]);
  const setM = (m: 'month' | 'week') => { setMode(m); try { sessionStorage.setItem('cal-mode', m); } catch { /* ignore */ } };

  const month = startOfMonth(anchor);
  const weekStart = startOfWeek(anchor);
  const shownTasks = colorBy === 'person' && hidden.length
    ? tasks.filter((t) => !(t.assignees.length ? t.assignees : ['—']).every((a) => hidden.includes(a)))
    : tasks;
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of shownTasks) { const d = t[field]; if (d) { if (!m.has(d)) m.set(d, []); m.get(d)!.push(t); } }
    return m;
  }, [shownTasks, field]);

  const start = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const lastNeeded = days.findIndex((d, i) => i % 7 === 0 && d.slice(0, 7) > month.slice(0, 7));
  const monthDays = lastNeeded > 0 ? days.slice(0, lastNeeded) : days;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const step = (dir: -1 | 1) => setAnchor(mode === 'month' ? addMonths(month, dir) : addDays(weekStart, dir * 7));
  const title = mode === 'month' ? fmtMonth(month) : `${fmtDay(weekDays[0])} – ${fmtDay(weekDays[6])}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row-gap">
        <button className="btn sm icon" aria-label="Previous" onClick={() => step(-1)}><IconChevronLeft /></button>
        <button className="btn sm" onClick={() => setAnchor(today())}>Today</button>
        <button className="btn sm icon" aria-label="Next" onClick={() => step(1)}><IconChevronRight /></button>
        <strong style={{ fontSize: 15, fontWeight: 600 }}>{title}</strong>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {setColorBy && (
            <div className="seg" aria-label="Colour by">
              <button className={colorBy === 'priority' ? 'on' : ''} onClick={() => setColorBy('priority')}>By priority</button>
              <button className={colorBy === 'person' ? 'on' : ''} onClick={() => setColorBy('person')}>By person</button>
            </div>
          )}
          <div className="seg" aria-label="Calendar range">
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setM('month')}>Month</button>
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setM('week')}>Week</button>
          </div>
        </span>
      </div>
      {colorBy === 'person' && (
        <div className="legend">
          {people.map((p) => {
            const off = hidden.includes(p.id);
            return (
              <button key={p.id} className={`legend-item ${off ? 'off' : ''}`} onClick={() => setHidden(off ? hidden.filter((x) => x !== p.id) : [...hidden, p.id])}
                aria-pressed={!off} title={off ? 'Show' : 'Hide'}>
                <span className="dot" style={{ background: p.color, width: 10, height: 10 }} />{p.full_name || p.email}
              </button>
            );
          })}
          <span className="muted" style={{ fontSize: 12 }}>Click a name to hide or show their tasks</span>
        </div>
      )}
      <div className="scroll-x">
        {mode === 'month' ? (
          <div className="cal" style={{ minWidth: 640 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
            {monthDays.map((d) => <CalCell key={d} day={d} month={month} tasks={byDay.get(d) ?? []} field={field} colorBy={colorBy} />)}
          </div>
        ) : (
          <div className="week" style={{ minWidth: 760 }}>
            {weekDays.map((d) => <WeekCol key={d} day={d} tasks={byDay.get(d) ?? []} field={field} colorBy={colorBy} />)}
          </div>
        )}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>Drag a task to another day to move it · double-click a day to add</span>
    </div>
  );
}

// ───────────────────────────── Urgent / Important ─────────────────────────────

const QUADS = [
  { id: 'do', title: 'Do now', sub: 'Urgent and important', priority: 'High' as const },
  { id: 'plan', title: 'Plan', sub: 'Important, not urgent — schedule it', priority: 'High' as const },
  { id: 'delegate', title: 'Delegate or squeeze in', sub: 'Urgent, less important', priority: 'Medium' as const },
  { id: 'drop', title: 'Later', sub: 'Neither — batch it or drop it', priority: 'Low' as const },
];

function Quad({ q, tasks }: { q: (typeof QUADS)[number]; tasks: Task[] }) {
  const { updateTask } = useActions();
  const { taskById, personById } = useData();
  const drop = useDrop((id) => {
    const t = taskById.get(id);
    if (!t) return;
    const patch: Partial<Task> = {};
    const important = q.id === 'do' || q.id === 'plan';
    if (important && t.priority !== 'High') patch.priority = 'High';
    if (!important && t.priority === 'High') patch.priority = q.priority;
    const urgent = q.id === 'do' || q.id === 'delegate';
    const isUrgent = quadrant(t) === 'do' || quadrant(t) === 'delegate';
    if (urgent && !isUrgent) patch.deadline = addDays(today(), 1);
    if (!urgent && isUrgent) patch.deadline = addDays(today(), 7);
    if (Object.keys(patch).length) updateTask(id, patch);
  });
  return (
    <section className={`quad ${drop.over ? 'over' : ''}`} {...drop.props}>
      <h2>{q.title}<span className="mono muted" style={{ fontWeight: 400, fontSize: 12 }}>{tasks.length}</span></h2>
      <div className="qs">{q.sub}</div>
      <div className="list flat">
        {tasks.map((t) => (
          <div key={t.id} {...dragProps(t.id)}><TaskRow task={t} showCategory={false} /></div>
        ))}
        {tasks.length === 0 && <div className="empty" style={{ padding: 16 }}>Drop tasks here</div>}
      </div>
      {q.id === 'delegate' && tasks.length > 0 && (
        <span className="muted" style={{ fontSize: 12 }}>
          Least loaded: {(() => {
            const counts = [...personById.values()].map((p) => ({ p, n: [...taskById.values()].filter((t) => t.status !== 'Done' && t.assignees.includes(p.id)).length }));
            counts.sort((a, b) => a.n - b.n);
            return counts.slice(0, 2).map((c) => `${firstName(c.p)} (${c.n})`).join(', ');
          })()}
        </span>
      )}
    </section>
  );
}

export function MatrixView({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'Done');
  return (
    <div className="matrix">
      {QUADS.map((q) => <Quad key={q.id} q={q} tasks={open.filter((t) => quadrant(t) === q.id).sort((a, b) => b.urgency - a.urgency)} />)}
    </div>
  );
}
