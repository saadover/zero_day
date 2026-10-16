import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { IconBoard, IconCalendar, IconList, IconPlus } from '../components/Icons';
import { BoardView, CalendarView, ListView, MatrixView } from '../components/TaskViews';
import type { DateField, Filters } from '../lib/tasks';
import { DATE_FIELD_LABELS, DEFAULT_FILTERS, runView, viewById, viewFilters, type ViewDef } from '../lib/tasks';
import { today } from '../lib/dates';
import { useData } from '../store/data';
import { useUi } from '../store/ui';

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

export function BoardPage() {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, status: 'all' };
  const [f, setF] = useViewFilters('board', defaults);
  const list = useMemo(() => runView(tasks, viewById('all'), { ...f, status: 'all' }, meId), [tasks, f, meId]);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Board</h1>
        <span className="sub">Drag cards between columns to change status</span>
      </div>
      <FilterBar f={f} set={setF} defaults={defaults} hide={['status', 'group', 'sort']} />
      <BoardView tasks={list} />
    </div>
  );
}

export function CalendarPage() {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS, status: 'all' };
  const [f, setF] = useViewFilters('calendar', defaults);
  const list = useMemo(() => runView(tasks, viewById('all'), { ...f, range: 'any' }, meId), [tasks, f, meId]);
  const navigate = useNavigate();
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Calendar</h1>
        <div className="actions">
          <div className="seg" role="tablist" aria-label="Date shown">
            {(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((k) => (
              <button key={k} className={f.dateField === k ? 'on' : ''} onClick={() => setF({ ...f, dateField: k })}>{DATE_FIELD_LABELS[k]}</button>
            ))}
          </div>
          <button className="btn" onClick={() => navigate('/tasks/week')}>This week as list</button>
        </div>
      </div>
      <FilterBar f={f} set={setF} defaults={defaults} hide={['range', 'group', 'sort']} />
      <CalendarView tasks={list} field={f.dateField} />
    </div>
  );
}

export function MatrixPage() {
  const { tasks, meId } = useData();
  const defaults: Filters = { ...DEFAULT_FILTERS };
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
