import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Avatar } from '../components/Atoms';
import { IconBoard, IconCalendar, IconChevronLeft, IconChevronRight, IconList, IconPlus } from '../components/Icons';
import { BoardView, CalendarView, ListView, MatrixView, type ColorBy } from '../components/TaskViews';
import type { DateField, Filters } from '../lib/tasks';
import { DATE_FIELD_LABELS, DEFAULT_FILTERS, runView, viewById, viewFilters, type ViewDef } from '../lib/tasks';
import { addDays, fmtDay, startOfWeek, today } from '../lib/dates';
import { useData } from '../store/data';
import { useOpenTask, useUi } from '../store/ui';

type Layout = 'list' | 'board' | 'calendar';

/** Filters for a view, remembered for this browser tab. */
function useViewFilters(key: string, defaults: Filters): [Filters, (f: Filters) => void] {
  const read = () => {
    try {
      const s = sessionStorage.getItem(`filters:${key}`);
      if (s) return { ...defaults, ...JSON.parse(s) } as Filters;
    } catch { /* ignore */ }
    return defaults;
  };
  const [f, setF] = useState<Filters>(read);
  useEffect(() => { setF(read()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (n: Filters) => {
    setF(n);
    try { sessionStorage.setItem(`filters:${key}`, JSON.stringify(n)); } catch { /* ignore */ }
  };
  return [f, set];
}

function LayoutSwitch({ value, set }: { value: Layout; set: (l: Layout) => void }) {
  return (
    <div className="seg" role="tablist" aria-label="Layout">
      {([['list', 'List', <IconList key="l" size={14} />], ['board', 'Board', <IconBoard key="b" size={14} />], ['calendar', 'Calendar', <IconCalendar key="c" size={14} />]] as const)
        .map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => set(k)}>{icon}{label}</button>
        ))}
    </div>
  );
}

function addDefaultsFor(v: ViewDef, f: Filters, meId: string) {
  const d: Record<string, unknown> = {};
  if (v.id === 'today') d.do_date = today();
  if (v.id === 'assign' || f.givenBy === 'Manager') d.given_by = 'Manager';
  if (f.person === 'me') d.assignees = [meId];
  else if (!['any', 'none', 'me'].includes(f.person)) d.assignees = [f.person];
  if (f.priority !== 'any') d.priority = f.priority;
  if (f.category !== 'any') d.category = f.category;
  return d;
}

export function TasksPage() {
  const { viewId = 'all' } = useParams();
  const view = viewById(viewId);
  const defaults = useMemo(() => viewFilters(view), [view]);
  const [f, setF] = useViewFilters(view.id, defaults);
  const [layout, setLayoutState] = useState<Layout>(() => (sessionStorage.getItem(`layout:${view.id}`) as Layout) || 'list');
  const setLayout = (l: Layout) => { setLayoutState(l); try { sessionStorage.setItem(`layout:${view.id}`, l); } catch { /* ignore */ } };
  useEffect(() => { setLayoutState((sessionStorage.getItem(`layout:${view.id}`) as Layout) || 'list'); }, [view.id]);
  const { tasks, meId } = useData();
  const { openQuickAdd } = useUi();

  const list = useMemo(() => runView(tasks, view, f, meId), [tasks, view, f, meId]);
  const boardList = useMemo(() => runView(tasks, view, { ...f, status: 'all' }, meId), [tasks, view, f, meId]);

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>{view.name}</h1>
        <span className="sub">{list.length} {list.length === 1 ? 'task' : 'tasks'}</span>
        <div className="actions">
          <LayoutSwitch value={layout} set={setLayout} />
          <button className="btn primary" onClick={() => openQuickAdd(addDefaultsFor(view, f, meId))}><IconPlus size={14} /> New</button>
        </div>
      </div>
      <p className="view-hint">{view.hint}</p>
      <FilterBar f={f} set={setF} defaults={defaults} hide={layout === 'board' ? ['status', 'group'] : layout === 'calendar' ? ['group', 'range'] : []} />
      {layout === 'list' && <ListView tasks={list} group={f.group} dateField={f.range !== 'any' ? f.dateField : f.sort === 'follow_up_date' ? 'follow_up_date' : 'deadline'} addDefaults={addDefaultsFor(view, f, meId)} emptyText="No tasks match. Try another range or reset the filters." />}
      {layout === 'board' && <BoardView tasks={f.status === 'open' ? boardList : list} />}
      {layout === 'calendar' && <CalendarView tasks={runView(tasks, view, { ...f, range: 'any' }, meId)} field={f.dateField} />}
    </div>
  );
}

type Scope = 'me' | 'team';

export function BoardPage({ scope = 'me' }: { scope?: Scope }) {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, status: 'all', person: scope === 'me' ? 'me' : 'any' };
  const [f, setF] = useViewFilters(`board-${scope}`, defaults);
  const list = useMemo(() => runView(tasks, viewById('all'), { ...f, status: 'all' }, meId), [tasks, f, meId]);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>{scope === 'me' ? 'My board' : 'Team board'}</h1>
        <span className="sub">Drag cards between columns to change status</span>
      </div>
      <FilterBar f={f} set={setF} defaults={defaults} hide={['status', 'group', 'sort']} />
      <BoardView tasks={list} />
    </div>
  );
}

export function CalendarPage({ scope = 'me' }: { scope?: Scope }) {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, status: 'all', person: scope === 'me' ? 'me' : 'any' };
  const [f, setF] = useViewFilters(`calendar-${scope}`, defaults);
  const [colorBy, setColorByState] = useState<ColorBy>(() => (sessionStorage.getItem(`colorby-${scope}`) as ColorBy) || (scope === 'team' ? 'person' : 'priority'));
  const setColorBy = (c: ColorBy) => { setColorByState(c); try { sessionStorage.setItem(`colorby-${scope}`, c); } catch { /* ignore */ } };
  const list = useMemo(() => runView(tasks, viewById('all'), { ...f, range: 'any' }, meId), [tasks, f, meId]);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>{scope === 'me' ? 'My calendar' : 'Team calendar'}</h1>
        <div className="actions">
          <div className="seg" role="tablist" aria-label="Date shown">
            {(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((k) => (
              <button key={k} className={f.dateField === k ? 'on' : ''} onClick={() => setF({ ...f, dateField: k })}>{DATE_FIELD_LABELS[k]}</button>
            ))}
          </div>
        </div>
      </div>
      <FilterBar f={f} set={setF} defaults={defaults} hide={['range', 'group', 'sort']} />
      <CalendarView tasks={list} field={f.dateField} colorBy={colorBy} setColorBy={setColorBy} />
    </div>
  );
}

export function MatrixPage() {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, person: 'me' };
  const [f, setF] = useViewFilters('matrix', defaults);
  const list = useMemo(() => runView(tasks, viewById('all'), { ...f, status: 'open' }, meId), [tasks, f, meId]);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Urgent / Important</h1>
        <span className="sub">Urgent = due within 2 days · Important = High priority</span>
      </div>
      <p className="view-hint">Drag a task to another box and its priority or deadline is adjusted to match.</p>
      <FilterBar f={f} set={setF} defaults={defaults} hide={['status', 'group', 'sort', 'range']} />
      <MatrixView tasks={list} />
    </div>
  );
}

/** Everyone's open tasks, grouped by person. */
export function TeamListPage() {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, group: 'person', sort: 'deadline' };
  const [f, setF] = useViewFilters('team-list', defaults);
  const list = useMemo(() => runView(tasks, viewById('all'), f, meId), [tasks, f, meId]);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Team tasks</h1>
        <span className="sub">{list.length} tasks · grouped by person</span>
      </div>
      <FilterBar f={f} set={setF} defaults={defaults} />
      <ListView tasks={list} group={f.group} dateField={f.dateField} emptyText="No tasks match." />
    </div>
  );
}

/** How busy everyone is over the next two weeks. */
export function WorkloadPage() {
  const { tasks, people } = useData();
  const { open } = useOpenTask();
  const [field, setField] = useState<DateField>('deadline');
  const [start, setStart] = useState(startOfWeek(today()));
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const openTasks = tasks.filter((t) => t.status !== 'Done');
  const cell = (pid: string, day: string) => openTasks.filter((t) => t[field] === day && t.assignees.includes(pid));
  const max = Math.max(1, ...people.flatMap((p) => days.map((d) => cell(p.id, d).length)));
  const unassigned = openTasks.filter((t) => !t.assignees.length);

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Workload</h1>
        <span className="sub">Open tasks per person per day</span>
        <div className="actions">
          <div className="seg">
            {(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((k) => (
              <button key={k} className={field === k ? 'on' : ''} onClick={() => setField(k)}>{DATE_FIELD_LABELS[k]}</button>
            ))}
          </div>
          <button className="btn sm icon" aria-label="Earlier" onClick={() => setStart(addDays(start, -7))}><IconChevronLeft /></button>
          <button className="btn sm" onClick={() => setStart(startOfWeek(today()))}>This week</button>
          <button className="btn sm icon" aria-label="Later" onClick={() => setStart(addDays(start, 7))}><IconChevronRight /></button>
        </div>
      </div>
      <div className="scroll-x">
        <table className="tbl wl">
          <thead>
            <tr>
              <th>Person</th>
              <th>Open</th>
              {days.map((d) => <th key={d} className={d === today() ? 'now' : ''} style={{ textAlign: 'center' }}>{fmtDay(d).split(' ').slice(0, 2).join(' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}><Avatar person={p} />{p.full_name || p.email}</span></td>
                <td className="mono">{openTasks.filter((t) => t.assignees.includes(p.id)).length}</td>
                {days.map((d) => {
                  const list = cell(p.id, d);
                  return (
                    <td key={d} className={d === today() ? 'now' : ''} style={{ textAlign: 'center', padding: 4 }}>
                      {list.length > 0 && (
                        <button className="wl-cell" title={list.map((t) => `#${t.number} ${t.title}`).join('\n')} onClick={() => open(list[0].id)}
                          style={{ background: `color-mix(in srgb, ${p.color} ${20 + (list.length / max) * 60}%, var(--surface))`, color: list.length / max > 0.6 ? '#fff' : 'var(--text)' }}>
                          {list.length}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="view-hint" style={{ marginTop: 12 }}>
        Darker = busier. Hover a number to see the tasks, click to open the first one. {unassigned.length > 0 && `${unassigned.length} open tasks have nobody assigned.`}
      </p>
    </div>
  );
}
