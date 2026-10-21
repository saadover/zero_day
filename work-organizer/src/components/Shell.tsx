import { useEffect, useMemo, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { today } from '../lib/dates';
import { runView, viewById, viewFilters, VIEWS } from '../lib/tasks';
import { happensOn, runOf, visibleTo } from '../lib/routines';
import { supabase } from '../lib/supabase';
import { useData } from '../store/data';
import { useOpenTask, useUi } from '../store/ui';
import { Avatar, Avatars } from './Atoms';
import { CommandPalette } from './CommandPalette';
import {
  IconBell, IconBoard, IconDownload, IconCalendar, IconChecklist, IconFlag, IconGrid, IconHome, IconList, IconLogout, IconMenu, IconNotes, IconPlus,
  IconSearch, IconSettings, IconUsers,
} from './Icons';
import { Popover, useAnchor } from './Popover';
import { QuickAdd } from './QuickAdd';
import { TaskPanel } from './TaskPanel';
import { timeAgo } from '../lib/dates';

function Nav({ to, icon, label, count, red, end }: { to: string; icon: ReactNode; label: string; count?: number | string; red?: boolean; end?: boolean }) {
  const { setNavOpen } = useUi();
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav ${isActive ? 'on' : ''}`} onClick={() => setNavOpen(false)}>
      {icon}<span className="ellipsis">{label}</span>
      {count !== undefined && count !== 0 && count !== '' && <span className={`cnt ${red ? 'red' : ''}`}>{count}</span>}
    </NavLink>
  );
}

function Bell() {
  const { db, update, meId } = useData();
  const { open } = useOpenTask();
  const m = useAnchor();
  const mine = useMemo(() => db.notifications.filter((n) => n.user_id === meId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [db.notifications, meId]);
  const unread = mine.filter((n) => !n.read_at).length;

  const markAll = async () => {
    const now = new Date().toISOString();
    for (const n of mine.filter((x) => !x.read_at)) await update('notifications', { id: n.id }, { read_at: now });
  };

  return (
    <>
      <button className="nav" onClick={m.open} aria-label={`Inbox, ${unread} unread`}>
        <IconBell /><span>Inbox</span>{unread > 0 && <span className="cnt red">{unread}</span>}
      </button>
      {m.anchor && (
        <Popover anchor={m.anchor} onClose={m.close} width={340}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px' }}>
            <strong style={{ fontSize: 13 }}>Inbox</strong>
            {unread > 0 && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={markAll}>Mark all read</button>}
          </div>
          {mine.length === 0 && <div className="empty">Nothing yet. Assignments and reminders show up here.</div>}
          {mine.slice(0, 30).map((n) => (
            <button key={n.id} className="mi" style={{ alignItems: 'flex-start', padding: '7px 8px', flexDirection: 'column', gap: 2 }}
              onClick={() => { if (!n.read_at) update('notifications', { id: n.id }, { read_at: new Date().toISOString() }); if (n.task_id) open(n.task_id); m.close(); }}>
              <span style={{ display: 'flex', width: '100%', gap: 6, alignItems: 'center' }}>
                {!n.read_at && <span className="dot" style={{ background: 'var(--accent)' }} />}
                <span style={{ fontWeight: n.read_at ? 400 : 500 }} className="ellipsis">{n.title}</span>
                <span className="muted mono" style={{ marginLeft: 'auto', fontSize: 11 }}>{timeAgo(n.created_at)}</span>
              </span>
              {n.body && <span className="muted ellipsis" style={{ fontSize: 12.5, maxWidth: '100%' }}>{n.body}</span>}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { tasks, me, meId, db, online, personById, can } = useData();
  const { openQuickAdd, setPaletteOpen, navOpen, setNavOpen } = useUi();
  const navigate = useNavigate();
  const loc = useLocation();

  // Keyboard: N = new task, Ctrl/Cmd+K or / = command menu, g then d/t/b/c = go to…
  useEffect(() => {
    let g = false;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, textarea, select, [contenteditable=true]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.modal-wrap')) return;
      if (e.key === 'n' || e.key === 'c') { e.preventDefault(); openQuickAdd(); }
      else if (e.key === '/') { e.preventDefault(); setPaletteOpen(true); }
      else if (e.key === 'g') { g = true; setTimeout(() => { g = false; }, 800); }
      else if (g) {
        const to = { d: '/', t: '/tasks/today', b: '/board', c: '/calendar', m: '/meetings', l: '/checklist', w: '/team/list' }[e.key];
        if (to) { navigate(to); g = false; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd, setPaletteOpen, navigate]);

  useEffect(() => setNavOpen(false), [loc.pathname, setNavOpen]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of VIEWS) if (v.id !== 'all' && v.id !== 'done') c[v.id] = runView(tasks, viewById(v.id), viewFilters(v), meId).length;
    return c;
  }, [tasks, meId]);

  const t = today();
  const activeItems = db.checklist_items.filter((i) => i.active && (i.scope === 'team' || i.owner_id === meId) && (!i.only_day || i.only_day === t));
  const checked = db.checklist_checks.filter((c) => c.day === t && activeItems.some((i) => i.id === c.item_id)).length;
  const others = online.map((o) => o.userId).filter((id) => id !== meId);
  const todaysRoutines = visibleTo(db.routines, meId).filter((r) => happensOn(r, t)
    && !runOf(db.routine_runs, r.id, t)?.done_by).length;

  return (
    <div className="shell">
      <div className="topbar">
        <button className="btn ghost icon" aria-label="Open menu" onClick={() => setNavOpen(true)}><IconMenu /></button>
        <strong style={{ fontSize: 14 }}>Work Organizer</strong>
        <button className="btn ghost icon" style={{ marginLeft: 'auto' }} aria-label="Search" onClick={() => setPaletteOpen(true)}><IconSearch /></button>
        {can('task_create') && <button className="btn primary sm icon" aria-label="New task" onClick={() => openQuickAdd()}><IconPlus /></button>}
      </div>
      {navOpen && <div className="panel-wrap" style={{ zIndex: 35 }} onClick={() => setNavOpen(false)} />}

      <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main">
        <div className="brand">
          <span className="brand-mark">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          Work Organizer
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 2px 10px' }}>
          {can('task_create') ? <button className="btn primary sm grow" onClick={() => openQuickAdd()}>New task <span className="kbd">N</span></button>
            : <span className="grow muted" style={{ fontSize: 12, alignSelf: 'center' }}>{me?.role === 'visitor' ? 'Visitor' : 'View'} access</span>}
          <button className="btn sm icon" aria-label="Search (Ctrl+K)" title="Search  Ctrl K" onClick={() => setPaletteOpen(true)}><IconSearch size={14} /></button>
        </div>
        <Nav to="/" end icon={<IconHome />} label="Dashboard" />
        <Bell />

        <div className="side-label">My work</div>
        {VIEWS.filter((v) => ['today', 'overdue', 'week', 'followups', 'mine', 'done'].includes(v.id)).map((v) => (
          <Nav key={v.id} to={`/tasks/${v.id}`} icon={<span style={{ width: 16 }} />} label={v.name}
            count={counts[v.id]} red={v.id === 'overdue'} />
        ))}
        <Nav to="/board" icon={<IconBoard />} label="My board" />
        <Nav to="/calendar" icon={<IconCalendar />} label="My calendar" />
        <Nav to="/matrix" icon={<IconGrid />} label="Urgent / Important" />
        <Nav to="/checklist" icon={<IconChecklist />} label="Daily checklist" count={activeItems.length ? `${checked}/${activeItems.length}` : ''} />
        <Nav to="/reminders" icon={<IconBell />} label="Reminders" count={todaysRoutines || ''} />
        <Nav to="/meetings" icon={<IconNotes />} label="Meetings" />
        <Nav to="/processes" icon={<IconBoard />} label="Processes" count={db.processes.length || ''} />

        <div className="side-label">Team</div>
        <Nav to="/team/list" icon={<IconUsers />} label="Team tasks" count={tasks.filter((x) => x.status !== 'Done').length} />
        <Nav to="/team/calendar" icon={<IconCalendar />} label="Team calendar" />
        <Nav to="/team/board" icon={<IconBoard />} label="Team board" />
        <Nav to="/team/workload" icon={<IconGrid />} label="Workload" />
        <Nav to="/tasks/assign" icon={<IconFlag />} label="To assign" count={counts.assign} />
        <Nav to="/tasks/all" icon={<IconList />} label="All tasks" />
        {can('export') && <Nav to="/export" icon={<IconDownload />} label="Export" />}

        <div className="side-foot">
          <Nav to="/people" icon={<IconUsers />} label="People" count={db.profiles.length} />
          <Nav to="/settings" icon={<IconSettings />} label="Settings" />
          <div className="nav" style={{ cursor: 'default' }}>
            <Avatar person={me ?? undefined} />
            <span className="ellipsis">{me?.full_name || me?.email}</span>
            {others.length > 0 && <span style={{ marginLeft: 'auto' }} title="Online now"><Avatars ids={others} byId={personById} max={3} /></span>}
          </div>
          <button className="nav" onClick={() => supabase.auth.signOut()}><IconLogout />Log out</button>
        </div>
      </nav>

      <main className="main">{children}</main>
      <TaskPanel />
      <QuickAdd />
      <CommandPalette />
    </div>
  );
}
