import { useState } from 'react';
import { Link } from 'react-router-dom';
import { firstName } from '../components/Atoms';
import { IconBell, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconX } from '../components/Icons';
import { useToast } from '../components/Toast';
import { addDays, fmtDay, fmtTime, startOfWeek, today } from '../lib/dates';
import { dayEntries, type DayEntry } from '../lib/daylist';
import { finishRun, releaseRun } from '../lib/routines';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';

/** Everything on one day's list (own items, reminders, dated tasks). */
export function useDayEntries(day: string) {
  const { db, tasks, meId } = useData();
  return dayEntries(db, tasks, meId, day);
}

function useDay(day: string) {
  const entries = useDayEntries(day);
  return {
    team: entries.filter((e) => e.scope === 'team'),
    mine: entries.filter((e) => e.scope === 'personal'),
    done: entries.filter((e) => e.done).length,
    total: entries.length,
  };
}

/** Tick / untick anything on the list; reminders and tasks update where they live. */
function useToggle() {
  const { insert, remove, update, can, meId, reload } = useData();
  const toast = useToast();
  return async (e: DayEntry, day: string) => {
    if (e.kind === 'item') {
      if (!can('checklist_tick')) { toast.error('Your access level can’t tick the checklist.'); return; }
      return e.done ? remove('checklist_checks', { item_id: e.item!.id, day }) : insert('checklist_checks', { item_id: e.item!.id, day });
    }
    if (e.kind === 'routine') {
      if (!can('routine_do')) { toast.error('Your access level can’t mark reminders done.'); return; }
      const res = e.done ? await releaseRun(e.routine!.id, day) : await finishRun(e.routine!.id, day, meId);
      if (res.error) toast.error(res.error.message);
      await reload('routine_runs');
      return;
    }
    if (!can('task_status') && !can('task_edit')) { toast.error('Your access level can’t change tasks.'); return; }
    await update('tasks', { id: e.task!.id }, { status: e.done ? 'To do' : 'Done' });
    if (!e.done) toast.show(`“${e.task!.title}” marked Done`);
  };
}

function Box({ on, label, onClick, small }: { on: boolean; label: string; onClick: () => void; small?: boolean }) {
  return (
    <button className={`box ${on ? 'on' : ''}`} onClick={onClick} role="checkbox" aria-checked={on} aria-label={label}
      style={small ? { width: 18, height: 18 } : undefined}>
      {on && <IconCheck size={11} strokeWidth={2.2} />}
    </button>
  );
}

function Row({ e, day, showBy }: { e: DayEntry; day: string; showBy: boolean }) {
  const { personById, update, can } = useData();
  const { open } = useOpenTask();
  const toggle = useToggle();
  const item = e.item;
  return (
    <div className="chk">
      <Box on={e.done} label={e.label} onClick={() => toggle(e, day)} />
      <span className={`lbl ${e.done ? 'on' : ''}`} onClick={() => (e.kind === 'task' ? open(e.task!.id) : toggle(e, day))} style={{ cursor: 'pointer' }}
        title={e.kind === 'task' ? 'Open the task' : undefined}>{e.label}</span>
      {e.kind === 'routine' && <span className="tag chk-src rt"><IconBell size={10} /> {e.time} reminder</span>}
      {e.kind === 'task' && (
        <span className={`tag chk-src tk ${e.why === 'deadline' && !e.done ? 'due' : ''}`}>
          #{e.task!.number} · {e.why === 'deadline' ? 'due' : 'planned'}{e.time ? ` ${e.time}` : ''}
        </span>
      )}
      {item?.only_day && <span className="tag" style={{ color: 'var(--tag-blue)', background: 'var(--tag-blue-bg)' }}>this day only</span>}
      {showBy && e.by && (e.done || e.kind === 'routine') && (
        <span className="by">{e.kind === 'routine' && !e.done ? `${firstName(personById.get(e.by))} is on it` : firstName(personById.get(e.by))}{e.at ? ` · ${fmtTime(e.at)}` : ''}</span>
      )}
      {item?.only_day && can('checklist_manage') && (
        <button className="btn ghost sm icon" style={{ marginLeft: showBy && e.done ? 0 : 'auto' }} aria-label="Remove item"
          onClick={() => { if (confirm(`Remove “${item.label}”?`)) update('checklist_items', { id: item.id }, { active: false }); }}><IconX size={12} /></button>
      )}
    </div>
  );
}

function AddOneDay({ day, scope }: { day: string; scope: 'team' | 'personal' }) {
  const { insert, meId } = useData();
  const [text, setText] = useState('');
  const add = async () => {
    const label = text.trim();
    if (!label) return;
    await insert('checklist_items', { label, scope, owner_id: scope === 'personal' ? meId : null, only_day: day, position: Date.now() });
    setText('');
  };
  return (
    <div className="chk" style={{ borderBottom: 0 }}>
      <IconPlus size={14} style={{ color: 'var(--icon)', margin: '0 1px' }} />
      <input className="input bare grow" style={{ height: 30 }} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={`Add an item for ${day === today() ? 'today' : fmtDay(day)} only`} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      {text.trim() && <button className="btn sm" onClick={add}>Add</button>}
    </div>
  );
}

/** One day's checklist; used on the dashboard (compact) and the checklist page. */
export function ChecklistBlock({ compact, day = today() }: { compact?: boolean; day?: string }) {
  const { team, mine, done, total } = useDay(day);
  const manage = useData().can('checklist_manage');
  return (
    <section>
      <div className="sec-h">
        <h2>{compact ? 'Daily checklist' : day === today() ? 'Today' : fmtDay(day)}</h2>
        <span className="n">{done} / {total}</span>
        {compact && <Link to="/checklist">Open</Link>}
      </div>
      <div className="progress" style={{ margin: '12px 4px 4px' }}><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      <div className="side-label" style={{ padding: '12px 4px 2px' }}>Team</div>
      {team.map((e) => <Row key={e.key} e={e} day={day} showBy />)}
      {team.length === 0 && <div className="muted" style={{ padding: '8px 4px', fontSize: 12.5 }}>No team items.</div>}
      {!compact && manage && <AddOneDay day={day} scope="team" />}
      <div className="side-label" style={{ padding: '14px 4px 2px' }}>Mine <span style={{ textTransform: 'none', letterSpacing: 0 }}>· only you see these</span></div>
      {mine.map((e) => <Row key={e.key} e={e} day={day} showBy={false} />)}
      {mine.length === 0 && <div className="muted" style={{ padding: '8px 4px', fontSize: 12.5 }}>No personal items{compact ? '.' : ' — add every-day items with “Edit list”, or one for this day below.'}</div>}
      {!compact && manage && <AddOneDay day={day} scope="personal" />}
      {!compact && <p className="muted" style={{ fontSize: 12, margin: '10px 4px 0' }}>Reminders and tasks planned or due this day are added automatically — ticking them here marks them done everywhere.</p>}
    </section>
  );
}

function WeekGrid({ start }: { start: string }) {
  const { db, tasks, meId, personById } = useData();
  const toggle = useToggle();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const perDay = new Map(days.map((d) => [d, dayEntries(db, tasks, meId, d)]));
  // One row per thing, in first-seen order; a cell where it doesn't apply stays empty.
  const rowsOf = (scope: 'team' | 'personal') => {
    const seen = new Map<string, DayEntry>();
    for (const d of days) for (const e of perDay.get(d)!) if (e.scope === scope && !seen.has(e.key)) seen.set(e.key, e);
    return [...seen.values()];
  };
  const cell = (key: string, d: string) => perDay.get(d)!.find((e) => e.key === key);

  const rows = (scope: 'team' | 'personal') => rowsOf(scope).map((r) => (
    <tr key={r.key}>
      <td style={{ minWidth: 220 }}>
        {r.label}
        {r.kind === 'routine' && <span className="muted" style={{ fontSize: 11.5 }}> · ⏰ {r.time}</span>}
        {r.kind === 'task' && <span className="muted" style={{ fontSize: 11.5 }}> · task #{r.task!.number}</span>}
        {r.item?.only_day && <span className="muted" style={{ fontSize: 11.5 }}> · {fmtDay(r.item.only_day).split(' ')[0]} only</span>}
      </td>
      {days.map((d) => {
        const e = cell(r.key, d);
        if (!e) return <td key={d} className={d === today() ? 'now' : ''} />;
        return (
          <td key={d} className={d === today() ? 'now' : ''} style={{ textAlign: 'center' }}
            title={e.done && e.by ? `${firstName(personById.get(e.by))}${e.at ? ` · ${fmtTime(e.at)}` : ''}` : ''}>
            <span className="chk" style={{ border: 0, justifyContent: 'center', minHeight: 0 }}>
              <Box small on={e.done} label={`${e.label} on ${fmtDay(d)}`} onClick={() => toggle(e, d)} />
            </span>
          </td>
        );
      })}
    </tr>
  ));

  return (
    <div className="scroll-x">
      <table className="tbl wl">
        <thead>
          <tr>
            <th>Item</th>
            {days.map((d) => (
              <th key={d} className={d === today() ? 'now' : ''} style={{ textAlign: 'center' }}>
                {fmtDay(d).split(' ').slice(0, 2).join(' ')}<br />
                <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{perDay.get(d)!.filter((e) => e.done).length}/{perDay.get(d)!.length}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={8} className="side-label" style={{ padding: '10px 14px 4px' }}>Team</td></tr>
          {rows('team')}
          <tr><td colSpan={8} className="side-label" style={{ padding: '10px 14px 4px' }}>Mine · only you see these</td></tr>
          {rows('personal')}
        </tbody>
      </table>
    </div>
  );
}

interface EditRow { key: string; id?: string; label: string }

/** Edit the every-day items. Nothing changes until Save. */
function Editor({ scope, onDone }: { scope: 'team' | 'personal'; onDone?: () => void }) {
  const { db, meId, insert, update } = useData();
  const toast = useToast();
  const saved = db.checklist_items.filter((i) => i.active && !i.only_day && i.scope === scope && (scope === 'team' || i.owner_id === meId))
    .sort((a, b) => a.position - b.position);
  const [rows, setRows] = useState<EditRow[]>(() => saved.map((i) => ({ key: i.id, id: i.id, label: i.label })));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows.map((r) => [r.id, r.label])) !== JSON.stringify(saved.map((i) => [i.id, i.label]));

  const move = (i: number, dir: -1 | 1) => setRows((l) => {
    const n = [...l]; const j = i + dir;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const add = () => { const v = text.trim(); if (v) { setRows((l) => [...l, { key: crypto.randomUUID(), label: v }]); setText(''); } };

  const save = async () => {
    setBusy(true);
    try {
      const keep = new Set(rows.map((r) => r.id).filter(Boolean));
      for (const i of saved) if (!keep.has(i.id)) await update('checklist_items', { id: i.id }, { active: false });
      for (const [idx, r] of rows.entries()) {
        const label = r.label.trim();
        if (!label) continue;
        if (r.id) {
          const o = saved.find((i) => i.id === r.id);
          if (o && (o.label !== label || o.position !== idx)) await update('checklist_items', { id: r.id }, { label, position: idx });
        } else {
          await insert('checklist_items', { label, scope, owner_id: scope === 'personal' ? meId : null, position: idx });
        }
      }
      toast.show('Checklist saved');
      onDone?.();
    } finally { setBusy(false); }
  };

  return (
    <div className="card-box">
      <h2>{scope === 'team' ? 'Team items (every day)' : 'My items (every day)'}</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>
        {scope === 'team' ? 'Everyone sees these and can tick them. Each tick shows who did it.' : 'Private to you. Nobody else sees them.'}
      </p>
      <div>
        {rows.map((r, i) => (
          <div className="chk" key={r.key}>
            <input className="input bare grow" value={r.label} aria-label="Item" onChange={(e) => setRows((l) => l.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))} />
            <button className="btn ghost sm icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconChevronDown style={{ transform: 'rotate(180deg)' }} size={14} /></button>
            <button className="btn ghost sm icon" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><IconChevronDown size={14} /></button>
            <button className="btn ghost sm icon" aria-label="Remove" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
      <div className="row-gap">
        <input className="input grow" placeholder="New every-day item" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn" onClick={add}><IconPlus size={14} /> Add</button>
      </div>
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        {dirty && <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>Unsaved changes</span>}
        <button className="btn" disabled={!dirty || busy} onClick={() => setRows(saved.map((i) => ({ key: i.id, id: i.id, label: i.label })))}>Cancel</button>
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function ChecklistPage() {
  const [day, setDay] = useState(today());
  const [mode, setMode] = useState<'day' | 'week' | 'edit'>('day');
  const manage = useData().can('checklist_manage');
  const weekStart = startOfWeek(day);
  const step = (n: number) => setDay(addDays(day, mode === 'week' ? n * 7 : n));

  return (
    <div className="page" style={{ maxWidth: mode === 'week' ? 1100 : 760 }}>
      <div className="page-head">
        <h1>Daily checklist</h1>
        {mode !== 'edit' && <span className="sub">{mode === 'week' ? `${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}` : day === today() ? 'Today' : fmtDay(day)}</span>}
        <div className="actions">
          {mode !== 'edit' && (
            <>
              <button className="btn sm icon" aria-label="Previous" onClick={() => step(-1)}><IconChevronLeft /></button>
              <button className="btn sm" onClick={() => setDay(today())}>Today</button>
              <button className="btn sm icon" aria-label="Next" onClick={() => step(1)}><IconChevronRight /></button>
              {mode === 'day' && (
                <input type="date" className="input" style={{ width: 150, height: 30 }} value={day} aria-label="Pick a date" onChange={(e) => e.target.value && setDay(e.target.value)} />
              )}
            </>
          )}
          <div className="seg">
            <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Day</button>
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Week</button>
            {manage && <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit list</button>}
          </div>
        </div>
      </div>
      <p className="view-hint">
        {mode === 'edit' ? 'These items repeat every day. For something that only matters on one day, use “Add an item for … only” in Day view.'
          : 'A fresh list every day. Go back to see what was done, or ahead to plan and tick upcoming days.'}
      </p>
      {mode === 'day' && <ChecklistBlock day={day} />}
      {mode === 'week' && <WeekGrid start={weekStart} />}
      {mode === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Editor scope="team" />
          <Editor scope="personal" />
        </div>
      )}
    </div>
  );
}
