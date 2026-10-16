import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { VIEWS } from '../lib/tasks';
import { useData } from '../store/data';
import { useOpenTask, useUi } from '../store/ui';
import {
  IconBoard, IconCalendar, IconChecklist, IconGrid, IconHome, IconList, IconMoon, IconNotes, IconPlus, IconSettings,
  IconUsers, StatusIcon,
} from './Icons';
import { applyTheme } from './theme';

interface Cmd { id: string; label: string; hint?: string; icon?: ReactNode; run: () => void; keywords?: string }

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useUi();
  if (!paletteOpen) return null;
  return <Palette close={() => setPaletteOpen(false)} />;
}

function Palette({ close }: { close: () => void }) {
  const nav = useNavigate();
  const { tasks, db, me, update } = useData();
  const { openQuickAdd } = useUi();
  const { open } = useOpenTask();
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);

  const commands = useMemo<Cmd[]>(() => {
    const go = (path: string) => () => nav(path);
    const cmds: Cmd[] = [
      { id: 'new', label: 'New task', hint: 'N', icon: <IconPlus />, run: () => openQuickAdd() },
      { id: 'dash', label: 'Go to Dashboard', icon: <IconHome />, run: go('/') },
      ...VIEWS.map((v) => ({ id: `v-${v.id}`, label: `View: ${v.name}`, icon: <IconList />, run: go(`/tasks/${v.id}`), keywords: v.hint })),
      { id: 'board', label: 'Go to Board', icon: <IconBoard />, run: go('/board') },
      { id: 'cal', label: 'Go to Calendar', icon: <IconCalendar />, run: go('/calendar') },
      { id: 'matrix', label: 'Go to Urgent / Important', icon: <IconGrid />, run: go('/matrix'), keywords: 'eisenhower' },
      { id: 'check', label: 'Go to Daily checklist', icon: <IconChecklist />, run: go('/checklist') },
      { id: 'meet', label: 'Go to Meetings', icon: <IconNotes />, run: go('/meetings') },
      { id: 'team', label: 'Go to Team', icon: <IconUsers />, run: go('/team'), keywords: 'members add person' },
      { id: 'settings', label: 'Settings', icon: <IconSettings />, run: go('/settings'), keywords: 'password notifications email' },
      { id: 'theme', label: 'Switch light / dark', icon: <IconMoon />, run: () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        if (me) update('profiles', { id: me.id }, { theme: next });
      } },
    ];
    return cmds;
  }, [nav, openQuickAdd, me, update]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmdHits = commands.filter((c) => !s || `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(s));
    if (!s) return cmdHits.slice(0, 9);
    const num = s.replace(/^#/, '');
    const taskHits: Cmd[] = tasks
      .filter((t) => t.title.toLowerCase().includes(s) || String(t.number) === num || t.notes.toLowerCase().includes(s))
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 8)
      .map((t) => ({ id: t.id, label: t.title, hint: `#${t.number}`, icon: <StatusIcon status={t.status} />, run: () => open(t.id) }));
    const meetHits: Cmd[] = db.meetings
      .filter((m) => m.title.toLowerCase().includes(s) || m.notes.toLowerCase().includes(s))
      .slice(0, 4)
      .map((m) => ({ id: m.id, label: m.title, hint: 'Meeting', icon: <IconNotes />, run: () => nav(`/meetings/${m.id}`) }));
    const create: Cmd = { id: 'create', label: `Create task “${q.trim()}”`, icon: <IconPlus />, run: () => openQuickAdd({ title: q.trim() }) };
    return [...taskHits, ...meetHits, ...cmdHits, create];
  }, [q, commands, tasks, db.meetings, open, nav, openQuickAdd]);

  useEffect(() => setHl(0), [q]);

  const run = (c: Cmd) => { close(); c.run(); };

  return (
    <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-label="Command menu">
        <input
          className="cmd-input" autoFocus placeholder="Search tasks, meetings, or type a command…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
            if (e.key === 'Enter' && results[hl]) { e.preventDefault(); run(results[hl]); }
          }}
        />
        <div className="cmd-list" role="listbox">
          {results.map((c, i) => (
            <button key={c.id} className={`cmd-item ${i === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => run(c)} role="option" aria-selected={i === hl}>
              <span style={{ color: 'var(--icon)', display: 'inline-flex' }}>{c.icon}</span>
              <span className="ellipsis">{c.label}</span>
              {c.hint && <span className="hint mono">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
