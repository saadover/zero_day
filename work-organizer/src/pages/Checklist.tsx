import { useState } from 'react';
import { Link } from 'react-router-dom';
import { firstName } from '../components/Atoms';
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from '../components/Icons';
import { addDays, fmtDay, fmtTime, today } from '../lib/dates';
import type { ChecklistItem } from '../lib/types';
import { useData } from '../store/data';

function useChecklist(day: string) {
  const { db, meId } = useData();
  const items = db.checklist_items.filter((i) => i.active && (i.scope === 'team' || i.owner_id === meId))
    .sort((a, b) => a.position - b.position);
  const team = items.filter((i) => i.scope === 'team');
  const mine = items.filter((i) => i.scope === 'personal');
  const checks = new Map(db.checklist_checks.filter((c) => c.day === day).map((c) => [c.item_id, c]));
  const done = items.filter((i) => checks.has(i.id)).length;
  return { team, mine, checks, done, total: items.length };
}

function Row({ item, day, check, showBy }: {
  item: ChecklistItem; day: string; check?: { user_id: string | null; checked_at: string }; showBy: boolean;
}) {
  const { insert, remove, personById } = useData();
  const on = !!check;
  const toggle = () => (on ? remove('checklist_checks', { item_id: item.id, day }) : insert('checklist_checks', { item_id: item.id, day }));
  return (
    <div className="chk">
      <button className={`box ${on ? 'on' : ''}`} onClick={toggle} role="checkbox" aria-checked={on} aria-label={item.label}>
        {on && <IconCheck size={11} strokeWidth={2.2} />}
      </button>
      <span className={`lbl ${on ? 'on' : ''}`} onClick={toggle} style={{ cursor: 'pointer' }}>{item.label}</span>
      {showBy && check && <span className="by">{firstName(personById.get(check.user_id ?? ''))} · {fmtTime(check.checked_at)}</span>}
    </div>
  );
}

/** Today's checklist; used on the dashboard (compact) and the checklist page. */
export function ChecklistBlock({ compact, day = today() }: { compact?: boolean; day?: string }) {
  const { team, mine, checks, done, total } = useChecklist(day);
  return (
    <section>
      <div className="sec-h">
        <h2>{compact ? 'Daily checklist' : 'Checklist'}</h2>
        <span className="n">{done} / {total}</span>
        {compact && <Link to="/checklist">Open</Link>}
      </div>
      <div className="progress" style={{ margin: '12px 4px 4px' }}><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      <div className="side-label" style={{ padding: '12px 4px 2px' }}>Team</div>
      {team.map((i) => <Row key={i.id} item={i} day={day} check={checks.get(i.id)} showBy />)}
      {team.length === 0 && <div className="muted" style={{ padding: '8px 4px', fontSize: 12.5 }}>No team items.</div>}
      <div className="side-label" style={{ padding: '14px 4px 2px' }}>Mine <span style={{ textTransform: 'none', letterSpacing: 0 }}>· only you see these</span></div>
      {mine.map((i) => <Row key={i.id} item={i} day={day} check={checks.get(i.id)} showBy={false} />)}
      {mine.length === 0 && <div className="muted" style={{ padding: '8px 4px', fontSize: 12.5 }}>No personal items yet{compact ? '.' : ' — add some below.'}</div>}
    </section>
  );
}

function Editor({ scope }: { scope: 'team' | 'personal' }) {
  const { db, meId, insert, update } = useData();
  const [text, setText] = useState('');
  const items = db.checklist_items.filter((i) => i.active && i.scope === scope && (scope === 'team' || i.owner_id === meId))
    .sort((a, b) => a.position - b.position);

  const add = async () => {
    const label = text.trim();
    if (!label) return;
    setText('');
    await insert('checklist_items', { label, scope, owner_id: scope === 'personal' ? meId : null, position: Date.now() });
  };
  const move = (i: number, dir: -1 | 1) => {
    const a = items[i]; const b = items[i + dir];
    if (!a || !b) return;
    update('checklist_items', { id: a.id }, { position: b.position });
    update('checklist_items', { id: b.id }, { position: a.position });
  };

  return (
    <div className="card-box">
      <h2>{scope === 'team' ? 'Team items' : 'My items'}</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>
        {scope === 'team' ? 'Everyone sees these and can tick them. Each tick shows who did it.' : 'Private to you. Nobody else sees them.'}
      </p>
      <div>
        {items.map((it, i) => (
          <div className="chk" key={it.id}>
            <input className="input bare grow" defaultValue={it.label} aria-label="Item"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.label) update('checklist_items', { id: it.id }, { label: v }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <button className="btn ghost sm icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconChevronDown style={{ transform: 'rotate(180deg)' }} size={14} /></button>
            <button className="btn ghost sm icon" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><IconChevronDown size={14} /></button>
            <button className="btn ghost sm icon" aria-label="Remove" onClick={() => update('checklist_items', { id: it.id }, { active: false })}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
      <div className="row-gap">
        <input className="input grow" placeholder="New item" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn" onClick={add}><IconPlus size={14} /> Add</button>
      </div>
    </div>
  );
}

export function ChecklistPage() {
  const [day, setDay] = useState(today());
  const [editing, setEditing] = useState(false);
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Daily checklist</h1>
        <span className="sub">{day === today() ? 'Today' : fmtDay(day)}</span>
        <div className="actions">
          <button className="btn sm icon" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><IconChevronLeft /></button>
          <button className="btn sm" disabled={day === today()} onClick={() => setDay(today())}>Today</button>
          <button className="btn sm icon" aria-label="Next day" disabled={day >= today()} onClick={() => setDay(addDays(day, 1))}><IconChevronRight /></button>
          <button className={`btn sm ${editing ? 'primary' : ''}`} onClick={() => setEditing(!editing)}>{editing ? 'Done editing' : 'Edit items'}</button>
        </div>
      </div>
      <p className="view-hint">A fresh list every morning. Past days stay here so you can look back.</p>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Editor scope="team" />
          <Editor scope="personal" />
        </div>
      ) : <ChecklistBlock day={day} />}
    </div>
  );
}
