import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { addDays, addMonths, dueLabel, fmtMonth, startOfMonth, startOfWeek, today } from '../lib/dates';
import type { DateField, GroupKey } from '../lib/tasks';
import { PRIORITY_RANK, quadrant, STATUS_RANK } from '../lib/tasks';
import type { Status, Task } from '../lib/types';
import { CATEGORIES, PRIORITIES, STATUSES } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask, useUi, type QuickAddDefaults } from '../store/ui';
import { Avatar, Avatars, firstName, TagChip } from './Atoms';
import { IconChevronLeft, IconChevronRight, IconPlus, PriorityIcon, StatusIcon } from './Icons';
import { TaskRow } from './TaskRow';

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

export function TaskCard({ task }: { task: Task }) {
  const { personById, db } = useData();
  const { open } = useOpenTask();
  const d = dueLabel(task.deadline, task.status === 'Done');
  const subsDone = task.subtasks.filter((s) => s.done).length;
  return (
    <article className="card" {...dragProps(task.id)} onClick={() => open(task.id)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(task.id); }}>
      <div className="ct">{task.title}</div>
      {(task.tags.length > 0 || task.blocked) && (
        <div className="cm">
          {task.blocked && <span className="badge-block">BLOCKED</span>}
          {task.tags.slice(0, 3).map((id) => { const t = db.tags.find((x) => x.id === id); return t ? <TagChip key={id} tag={t} /> : null; })}
        </div>
      )}
      <div className="cm">
        <PriorityIcon priority={task.priority} />
        <span className="mono" style={{ fontSize: 11.5 }}>#{task.number}</span>
        {task.subtasks.length > 0 && <span className="mono" style={{ fontSize: 11.5 }}>{subsDone}/{task.subtasks.length}</span>}
        <span className={`due ${d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'soon' : ''}`}>{d.text}</span>
        <Avatars ids={task.assignees} byId={personById} />
      </div>
    </article>
  );
}

function BoardColumn({ status, tasks }: { status: Status; tasks: Task[] }) {
  const { updateTask } = useActions();
  const { openQuickAdd } = useUi();
  const drop = useDrop((id) => updateTask(id, { status }));
  return (
    <section className={`col ${drop.over ? 'over' : ''}`} {...drop.props} aria-label={status}>
      <div className="col-h"><StatusIcon status={status} />{status}<span className="n">{tasks.length}</span></div>
      {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
      <button className="add-row" style={{ borderRadius: 8, height: 34 }} onClick={() => openQuickAdd({ status })}>
        <IconPlus size={13} /> Add
      </button>
    </section>
  );
}

export function BoardView({ tasks, doneLimit = 15 }: { tasks: Task[]; doneLimit?: number }) {
  return (
    <div className="board">
      {STATUSES.map((s) => {
        let list = tasks.filter((t) => t.status === s);
        if (s === 'Done') list = list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, doneLimit);
        return <BoardColumn key={s} status={s} tasks={list} />;
      })}
    </div>
  );
}

// ───────────────────────────── Calendar ─────────────────────────────

function CalCell({ day, month, tasks, field }: { day: string; month: string; tasks: Task[]; field: DateField }) {
  const { updateTask } = useActions();
  const { open } = useOpenTask();
  const { openQuickAdd } = useUi();
  const drop = useDrop((id) => updateTask(id, { [field]: day }));
  const out = day.slice(0, 7) !== month.slice(0, 7);
  const sorted = [...tasks].sort((a, b) => (STATUS_RANK[a.status] === 3 ? 1 : 0) - (STATUS_RANK[b.status] === 3 ? 1 : 0) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return (
    <div className={`cell ${out ? 'out' : ''} ${day === today() ? 'today' : ''} ${drop.over ? 'over' : ''}`} {...drop.props}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) openQuickAdd({ [field]: day }); }}>
      <div className="dn"><b>{Number(day.slice(8))}</b></div>
      {sorted.slice(0, 5).map((t) => (
        <div key={t.id} className={`chip ${t.priority} ${t.status === 'Done' ? 'done' : ''}`} {...dragProps(t.id)}
          onClick={() => open(t.id)} title={t.title}>{t.title}</div>
      ))}
      {sorted.length > 5 && <span className="muted" style={{ fontSize: 11.5, padding: '0 4px' }}>+{sorted.length - 5} more</span>}
    </div>
  );
}

export function CalendarView({ tasks, field }: { tasks: Task[]; field: DateField }) {
  const [month, setMonth] = useState(startOfMonth(today()));
  const start = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const lastNeeded = days.findIndex((d, i) => i % 7 === 0 && d.slice(0, 7) > month.slice(0, 7));
  const shown = lastNeeded > 0 ? days.slice(0, lastNeeded) : days;
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) { const d = t[field]; if (d) { if (!m.has(d)) m.set(d, []); m.get(d)!.push(t); } }
    return m;
  }, [tasks, field]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row-gap">
        <button className="btn sm icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><IconChevronLeft /></button>
        <button className="btn sm" onClick={() => setMonth(startOfMonth(today()))}>Today</button>
        <button className="btn sm icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><IconChevronRight /></button>
        <strong style={{ fontSize: 15, fontWeight: 600 }}>{fmtMonth(month)}</strong>
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>Drag a task to another day · double-click a day to add</span>
      </div>
      <div className="scroll-x">
        <div className="cal" style={{ minWidth: 640 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
          {shown.map((d) => <CalCell key={d} day={d} month={month} tasks={byDay.get(d) ?? []} field={field} />)}
        </div>
      </div>
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
