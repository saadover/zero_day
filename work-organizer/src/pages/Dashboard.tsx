import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { firstName } from '../components/Atoms';
import { IconPlus } from '../components/Icons';
import { TaskRow } from '../components/TaskRow';
import { ChecklistBlock } from './Checklist';
import { RoutineToday } from './Routines';
import { atToday, happensOn, visibleTo } from '../lib/routines';
import { fmtDay, fmtLongToday, fmtTime, greeting, today } from '../lib/dates';
import { runView, viewById, viewFilters } from '../lib/tasks';
import { useData } from '../store/data';
import { useUi } from '../store/ui';

function Section({ title, viewId, count, red, children }: { title: string; viewId?: string; count: number; red?: boolean; children: ReactNode }) {
  return (
    <section>
      <div className="sec-h">
        <h2 style={red ? { color: 'var(--late)' } : undefined}>{title}</h2>
        <span className="n">{count}</span>
        {viewId && <Link to={`/tasks/${viewId}`}>Open view</Link>}
      </div>
      {children}
    </section>
  );
}

export function Dashboard() {
  const { tasks, me, meId, db } = useData();
  const { openQuickAdd } = useUi();
  const v = (id: string) => { const view = viewById(id); return runView(tasks, view, viewFilters(view), meId); };

  const todayList = useMemo(() => v('today'), [tasks, meId]);
  const overdue = useMemo(() => v('overdue'), [tasks, meId]);
  const follow = useMemo(() => v('followups').filter((t) => t.follow_up_date! <= today()).concat(
    v('followups').filter((t) => t.follow_up_date! > today())).slice(0, 6), [tasks, meId]);
  const assign = useMemo(() => v('assign'), [tasks, meId]);
  const top = useMemo(() => tasks.filter((t) => t.status !== 'Done' && t.assignees.includes(meId))
    .sort((a, b) => b.urgency - a.urgency).slice(0, 3), [tasks, meId]);

  const routinesToday = visibleTo(db.routines, meId).filter((r) => happensOn(r, today())).sort((a, b) => atToday(a) - atToday(b));
  const upcoming = db.meetings.filter((m) => m.starts_at.slice(0, 10) >= today())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  const linkedCount = (id: string) => db.meeting_tasks.filter((x) => x.meeting_id === id).length;

  return (
    <div className="page">
      <header className="page-head" style={{ alignItems: 'flex-end', marginBottom: 26 }}>
        <div>
          <div className="mono muted" style={{ fontSize: 12, marginBottom: 6 }}>{fmtLongToday()}</div>
          <h1 style={{ fontSize: 24 }}>{greeting()}, {firstName(me)}</h1>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => openQuickAdd()}><IconPlus size={14} /> New task <span className="kbd">N</span></button>
        </div>
      </header>

      {top.length > 0 && (
        <div className="notice" style={{ marginBottom: 26 }}>
          <strong style={{ fontWeight: 600 }}>Most urgent for you:</strong>
          {top.map((t, i) => <span key={t.id}>{i > 0 && '·'} <TopLink id={t.id} title={t.title} /></span>)}
        </div>
      )}

      <div className="dash">
        <div className="dash-main">
          <Section title="Today" viewId="today" count={todayList.length}>
            <div className="list flat">
              {todayList.map((t) => <TaskRow key={t.id} task={t} />)}
              {todayList.length === 0 && <div className="empty">Nothing planned or due today.</div>}
            </div>
          </Section>

          {overdue.length > 0 && (
            <Section title="Overdue" viewId="overdue" count={overdue.length} red>
              <div className="list flat">{overdue.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            </Section>
          )}

          <div className="two">
            <Section title="Follow-ups" viewId="followups" count={v('followups').length}>
              <div className="list flat">
                {follow.map((t) => <TaskRow key={t.id} task={t} dateField="follow_up_date" compact
                  right={t.follow_up_with ? <span className="who">{t.follow_up_with}</span> : null} />)}
                {follow.length === 0 && <div className="empty">No one to chase.</div>}
              </div>
            </Section>
            <Section title="New from manager" viewId="assign" count={assign.length}>
              <div className="list flat">
                {assign.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} compact />)}
                {assign.length === 0 && <div className="empty">Everything from your manager is assigned.</div>}
              </div>
            </Section>
          </div>
        </div>

        <aside className="dash-side">
          {routinesToday.length > 0 && (
            <section>
              <div className="sec-h"><h2>Reminders today</h2><span className="n">{routinesToday.length}</span><Link to="/reminders">All</Link></div>
              <div className="list flat">{routinesToday.map((r) => <RoutineToday key={r.id} r={r} compact />)}</div>
            </section>
          )}
          <ChecklistBlock compact />
          <section>
            <div className="sec-h"><h2>Meetings</h2><Link to="/meetings">All notes</Link></div>
            {upcoming.length === 0 && <div className="empty">No upcoming meetings.</div>}
            {upcoming.map((m) => (
              <Link key={m.id} to={`/meetings/${m.id}`} className="trow" style={{ textDecoration: 'none', color: 'inherit', padding: '6px 4px' }}>
                <span className="mono" style={{ width: 54, fontSize: 12, lineHeight: 1.35 }}>
                  {m.starts_at.slice(0, 10) === today() ? 'Today' : fmtDay(m.starts_at.slice(0, 10)).split(' ').slice(0, 2).join(' ')}
                  <br /><span className="muted">{fmtTime(m.starts_at)}</span>
                </span>
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>{m.title}</span>
                  <span className="meta">{linkedCount(m.id)} linked {linkedCount(m.id) === 1 ? 'task' : 'tasks'}{m.attendees ? ` · ${m.attendees}` : ''}</span>
                </span>
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function TopLink({ id, title }: { id: string; title: string }) {
  return <Link to={`?task=${id}`} style={{ textDecoration: 'none' }}>{title}</Link>;
}
