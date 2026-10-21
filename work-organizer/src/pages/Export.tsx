import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { firstName } from '../components/Atoms';
import { IconDownload } from '../components/Icons';
import { useToast } from '../components/Toast';
import { addDays, endOfMonth, fmtDay, fmtTime, hhmm, startOfMonth, startOfWeek, toDateStr, today } from '../lib/dates';
import { download, PICTURES, pictureFor, processesToPdf, processPng, processSvg, safeName, sectionsToPdf, tableToCsv, tableToPdf, type Picture, type Table } from '../lib/exporter';
import { parseOutline } from '../lib/outline';
import type { Process, Task } from '../lib/types';
import { useData } from '../store/data';

type Kind = 'tasks' | 'processes' | 'checklist' | 'reminders' | 'meetings';
const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'tasks', label: 'Tasks', hint: 'What the team finished, what was due, what was planned' },
  { id: 'processes', label: 'Processes', hint: 'Diagrams as PDF, PNG or SVG' },
  { id: 'checklist', label: 'Daily checklist', hint: 'What was ticked, by whom and when' },
  { id: 'reminders', label: 'Reminders', hint: 'Repeating reminders and who did them' },
  { id: 'meetings', label: 'Meetings', hint: 'Agenda, notes, decisions and actions' },
];

const localDay = (iso: string | null | undefined) => (iso ? toDateStr(new Date(iso)) : null);
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d >= from && d <= to;
const stamp = (iso: string | null | undefined) => (iso ? `${fmtDay(localDay(iso))} ${fmtTime(iso)}` : '');

/* ---------- shared pieces ---------- */

function useRange() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}

function RangePicker({ r }: { r: ReturnType<typeof useRange> }) {
  const t = today();
  const lastWeek = addDays(startOfWeek(t), -7);
  const presets: [string, string, string][] = [
    ['Today', t, t],
    ['Yesterday', addDays(t, -1), addDays(t, -1)],
    ['This week', startOfWeek(t), addDays(startOfWeek(t), 6)],
    ['Last week', lastWeek, addDays(lastWeek, 6)],
    ['This month', startOfMonth(t), endOfMonth(t)],
    ['Last month', startOfMonth(addDays(startOfMonth(t), -1)), addDays(startOfMonth(t), -1)],
  ];
  return (
    <div className="exp-field">
      <span className="exp-label">Dates</span>
      <div className="row-gap" style={{ flexWrap: 'wrap', gap: 6 }}>
        {presets.map(([label, f, to]) => (
          <button key={label} className={`btn sm ${r.from === f && r.to === to ? "primary" : ""}`} onClick={() => { r.setFrom(f); r.setTo(to); }}>{label}</button>
        ))}
        <span className="row-gap" style={{ gap: 6 }}>
          <input type="date" className="input exp-date" value={r.from} aria-label="From"
            onChange={(e) => { const v = e.target.value; if (!v) return; r.setFrom(v); if (v > r.to) r.setTo(v); }} />
          <span className="muted">to</span>
          <input type="date" className="input exp-date" value={r.to} aria-label="To"
            onChange={(e) => { const v = e.target.value; if (!v) return; r.setTo(v); if (v < r.from) r.setFrom(v); }} />
        </span>
      </div>
    </div>
  );
}

function PersonPicker({ value, onChange, label = 'People' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { people } = useData();
  return (
    <label className="exp-field">
      <span className="exp-label">{label}</span>
      <select className="input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Everyone</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
      </select>
    </label>
  );
}

/** Selection state over a list of ids: all picked by default, kept when the list changes. */
function useSelection(ids: string[]) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const picked = ids.filter((id) => !off.has(id));
  return {
    picked,
    has: (id: string) => !off.has(id),
    toggle: (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    all: () => setOff(new Set()),
    none: () => setOff(new Set(ids)),
  };
}

function SelectHead({ sel, total }: { sel: ReturnType<typeof useSelection>; total: number }) {
  return (
    <span className="row-gap" style={{ gap: 6, fontSize: 12.5 }}>
      <span className="muted">{sel.picked.length} of {total} selected</span>
      <button className="btn ghost sm" onClick={sel.all}>All</button>
      <button className="btn ghost sm" onClick={sel.none}>None</button>
    </span>
  );
}

function Buttons({ busy, disabled, run, formats }: { busy: boolean; disabled: boolean; run: (f: string) => void; formats: [string, string][] }) {
  return (
    <div className="exp-actions">
      {formats.map(([f, label], i) => (
        <button key={f} className={`btn ${i === 0 ? 'primary' : ''}`} disabled={busy || disabled} onClick={() => run(f)}>
          <IconDownload size={13} /> {busy ? 'Preparing…' : label}
        </button>
      ))}
    </div>
  );
}

function useRunner() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return { busy, go };
}

const rangeText = (from: string, to: string) => (from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);
const fileRange = (from: string, to: string) => (from === to ? from : `${from}_to_${to}`);

/* ---------- tasks ---------- */

type TaskWhen = 'done' | 'due' | 'planned' | 'created' | 'any';
const WHEN: { id: TaskWhen; label: string }[] = [
  { id: 'done', label: 'Finished on these dates' },
  { id: 'due', label: 'Deadline on these dates' },
  { id: 'planned', label: 'Planned (do date) on these dates' },
  { id: 'created', label: 'Created on these dates' },
  { id: 'any', label: 'Anything that happened on these dates' },
];

function TasksExport() {
  const { tasks, personById, db } = useData();
  const r = useRange();
  const [when, setWhen] = useState<TaskWhen>('done');
  const [person, setPerson] = useState('');
  const [notes, setNotes] = useState(false);
  const [subs, setSubs] = useState(true);
  const { busy, go } = useRunner();
  const tagName = useMemo(() => new Map(db.tags.map((t) => [t.id, t.name])), [db.tags]);

  const hit = (t: Task) => {
    const done = inRange(localDay(t.completed_at), r.from, r.to);
    const due = inRange(t.deadline, r.from, r.to);
    const planned = inRange(t.do_date, r.from, r.to);
    const created = inRange(localDay(t.created_at), r.from, r.to);
    if (when === 'done') return done;
    if (when === 'due') return due;
    if (when === 'planned') return planned;
    if (when === 'created') return created;
    return done || due || planned || created || inRange(localDay(t.updated_at), r.from, r.to);
  };
  const list = tasks
    .filter((t) => hit(t) && (!person || t.assignees.includes(person) || (!t.assignees.length && t.created_by === person)))
    .sort((a, b) => (a.completed_at ?? a.deadline ?? a.created_at).localeCompare(b.completed_at ?? b.deadline ?? b.created_at));
  const sel = useSelection(list.map((t) => t.id));
  const who = (ids: string[]) => ids.map((id) => firstName(personById.get(id))).join(', ');

  const table = (): Table => {
    const cols = ['#', 'Task', 'Status', 'Priority', 'Assigned to', 'Do date', 'Deadline', 'Finished', 'Category', 'Tags'];
    if (subs) cols.push('Sub-tasks');
    if (notes) cols.push('Notes');
    const rows = list.filter((t) => sel.has(t.id)).map((t) => {
      const row: (string | number)[] = [
        t.number, t.title, t.status, t.priority, who(t.assignees) || '—',
        t.do_date ? `${fmtDay(t.do_date)}${t.do_time ? ' ' + hhmm(t.do_time) : ''}` : '',
        t.deadline ? `${fmtDay(t.deadline)}${t.deadline_time ? ' ' + hhmm(t.deadline_time) : ''}` : '',
        stamp(t.completed_at), t.category ?? '', t.tags.map((id) => tagName.get(id) ?? '').filter(Boolean).join(', '),
      ];
      if (subs) row.push(t.subtasks.map((s) => `${s.done ? '✓' : '○'} ${s.title}`).join('\n'));
      if (notes) row.push(t.notes);
      return row;
    });
    const label = WHEN.find((w) => w.id === when)!.label.replace(' on these dates', '').replace('Anything that happened', 'Activity');
    const whom = person ? ` · ${personById.get(person)?.full_name || 'one person'}` : ' · whole team';
    return { title: `Tasks — ${label.toLowerCase()}`, subtitle: `${rangeText(r.from, r.to)}${whom} · ${rows.length} tasks`, columns: cols, rows };
  };

  const run = (f: string) => go(async () => {
    const t = table();
    const name = `tasks-${when}-${fileRange(r.from, r.to)}`;
    // PDF has no room for sub-task ticks drawn in a symbol font
    if (f === 'pdf') download(`${name}.pdf`, await tableToPdf({ ...t, rows: t.rows.map((row) => row.map((c) => String(c).replace(/✓/g, '[x]').replace(/○/g, '[ ]'))) }));
    else download(`${name}.csv`, tableToCsv(t));
  });

  return (
    <>
      <div className="exp-filters">
        <RangePicker r={r} />
        <label className="exp-field">
          <span className="exp-label">Which tasks</span>
          <select className="input" style={{ width: 'auto' }} value={when} onChange={(e) => setWhen(e.target.value as TaskWhen)}>
            {WHEN.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </label>
        <PersonPicker value={person} onChange={setPerson} label="Assigned to" />
        <div className="exp-field">
          <span className="exp-label">Include</span>
          <span className="row-gap">
            <label className="row-gap" style={{ gap: 6 }}><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Sub-tasks</label>
            <label className="row-gap" style={{ gap: 6 }}><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Notes</label>
          </span>
        </div>
      </div>
      <div className="exp-list-head">
        <SelectHead sel={sel} total={list.length} />
        <Buttons busy={busy} disabled={!sel.picked.length} run={run} formats={[['pdf', 'PDF'], ['csv', 'Excel (CSV)']]} />
      </div>
      {list.length === 0 ? <div className="empty">No tasks match these dates and filters.</div> : (
        <div className="scroll-x">
          <table className="tbl exp-tbl">
            <thead><tr><th style={{ width: 30 }} /><th>Task</th><th>Status</th><th>Assigned to</th><th>Deadline</th><th>Finished</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={sel.has(t.id) ? '' : 'off'} onClick={() => sel.toggle(t.id)}>
                  <td><input type="checkbox" checked={sel.has(t.id)} onChange={() => sel.toggle(t.id)} onClick={(e) => e.stopPropagation()} aria-label={`Include ${t.title}`} /></td>
                  <td><span className="mono muted" style={{ fontSize: 11.5, marginRight: 6 }}>#{t.number}</span>{t.title}</td>
                  <td>{t.status}</td>
                  <td>{who(t.assignees) || <span className="muted">—</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.deadline ? fmtDay(t.deadline) : ''}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{stamp(t.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- processes ---------- */

function ProcessesExport({ preselect }: { preselect: string | null }) {
  const { db } = useData();
  const list = [...db.processes].sort((a, b) => a.title.localeCompare(b.title));
  const sel = useSelection(list.map((p) => p.id));
  const [picture, setPicture] = useState<Picture>('saved');
  const [steps, setSteps] = useState(true);
  const [q, setQ] = useState('');
  const { busy, go } = useRunner();
  const toast = useToast();
  // Opened from one process: only that one is ticked.
  const [inited, setInited] = useState(false);
  if (!inited && preselect && list.length) { setInited(true); list.forEach((p) => { if (p.id !== preselect) sel.toggle(p.id); }); }

  const shown = list.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  const chosen = () => list.filter((p) => sel.has(p.id));

  const run = (f: string) => go(async () => {
    const ps = chosen();
    if (f === 'pdf') {
      const name = ps.length === 1 ? safeName(ps[0].title) : `processes-${today()}`;
      download(`${name}.pdf`, await processesToPdf(ps, picture, { picture: true, steps }));
      return;
    }
    let skipped = 0;
    for (const p of ps) {
      const blob = f === 'png' ? await processPng(p, picture) : await processSvg(p, picture).then((s) => (s ? new Blob([s], { type: 'image/svg+xml' }) : null));
      if (!blob) { skipped++; continue; }
      download(`${safeName(p.title)}.${f}`, blob);
      await new Promise((ok) => setTimeout(ok, 350)); // browsers drop downloads fired too quickly
    }
    if (skipped) toast.error(`${skipped} process${skipped > 1 ? 'es have' : ' has'} no steps or drawing yet — skipped.`);
    if (ps.length - skipped > 1) toast.show('If only one file arrived, allow “multiple downloads” in your browser for this site.');
  });

  const describe = (p: Process) => {
    const k = pictureFor(p, picture);
    const n = parseOutline(p.outline, p.title).children.length;
    return `${p.visibility === 'private' ? 'Private · ' : ''}${k === 'canvas' ? 'drawing' : k === 'mindmap' ? 'mind map' : k === 'tree' ? 'tree' : 'empty'}${n ? ` · ${n} main steps` : ''}`;
  };

  return (
    <>
      <div className="exp-filters">
        <label className="exp-field">
          <span className="exp-label">Picture</span>
          <div className="seg">{PICTURES.map((p) => <button key={p.id} className={picture === p.id ? 'on' : ''} onClick={() => setPicture(p.id)}>{p.label}</button>)}</div>
        </label>
        <div className="exp-field">
          <span className="exp-label">PDF also includes</span>
          <label className="row-gap" style={{ gap: 6 }}><input type="checkbox" checked={steps} onChange={(e) => setSteps(e.target.checked)} /> The step list as bullet points</label>
        </div>
        <label className="exp-field">
          <span className="exp-label">Find</span>
          <input className="input" placeholder="Search processes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        PDF puts every selected process in one file (one page each). PNG and SVG download one picture per process.
        A process without a drawing is exported as a tree; one without steps uses its drawing.
      </p>
      <div className="exp-list-head">
        <SelectHead sel={sel} total={list.length} />
        <Buttons busy={busy} disabled={!sel.picked.length} run={run} formats={[['pdf', 'PDF'], ['png', 'PNG image'], ['svg', 'SVG']]} />
      </div>
      {list.length === 0 ? <div className="empty">No processes yet.</div> : (
        <div className="exp-cards">
          {shown.map((p) => (
            <label key={p.id} className={`exp-card ${sel.has(p.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => sel.toggle(p.id)} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500 }} className="ellipsis">{p.title || 'Untitled'}</span>
                <span className="muted" style={{ fontSize: 12 }}>{describe(p)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- checklist ---------- */

function ChecklistExport() {
  const { db, personById, meId } = useData();
  const r = useRange();
  const [person, setPerson] = useState('');
  const [missed, setMissed] = useState(false);
  const { busy, go } = useRunner();
  const items = useMemo(() => new Map(db.checklist_items.map((i) => [i.id, i])), [db.checklist_items]);

  const rows = useMemo(() => {
    const out: { key: string; day: string; label: string; scope: string; who: string; at: string }[] = [];
    for (const c of db.checklist_checks) {
      const it = items.get(c.item_id);
      if (!it || !inRange(c.day, r.from, r.to)) continue;
      if (person && c.user_id !== person) continue;
      out.push({ key: `${c.item_id}-${c.day}-${c.user_id}`, day: c.day, label: it.label, scope: it.scope === 'team' ? 'Team' : 'Personal', who: firstName(personById.get(c.user_id ?? '')), at: fmtTime(c.checked_at) });
    }
    if (missed) {
      // Team items (and my own) that nobody ticked on a day they applied to.
      const ticked = new Set(db.checklist_checks.map((c) => `${c.item_id}|${c.day}`));
      for (let d = r.from; d <= r.to && out.length < 5000; d = addDays(d, 1)) {
        for (const it of db.checklist_items) {
          if (it.only_day ? it.only_day !== d : !it.active) continue;
          if (it.scope === 'personal' && it.owner_id !== (person || meId)) continue;
          if (!ticked.has(`${it.id}|${d}`)) out.push({ key: `${it.id}-${d}-missed`, day: d, label: it.label, scope: it.scope === 'team' ? 'Team' : 'Personal', who: '— not done', at: '' });
        }
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label));
  }, [db.checklist_checks, db.checklist_items, items, r.from, r.to, person, missed, personById, meId]);
  const sel = useSelection(rows.map((x) => x.key));

  const run = (f: string) => go(async () => {
    const t: Table = {
      title: 'Daily checklist', subtitle: `${rangeText(r.from, r.to)}${person ? ` · ${personById.get(person)?.full_name}` : ''}`,
      columns: ['Day', 'Item', 'List', 'Ticked by', 'At'],
      rows: rows.filter((x) => sel.has(x.key)).map((x) => [fmtDay(x.day), x.label, x.scope, x.who, x.at]),
    };
    const name = `checklist-${fileRange(r.from, r.to)}`;
    download(`${name}.${f}`, f === 'pdf' ? await tableToPdf(t) : tableToCsv(t));
  });

  return (
    <>
      <div className="exp-filters">
        <RangePicker r={r} />
        <PersonPicker value={person} onChange={setPerson} label="Ticked by" />
        <div className="exp-field">
          <span className="exp-label">Include</span>
          <label className="row-gap" style={{ gap: 6 }}><input type="checkbox" checked={missed} onChange={(e) => setMissed(e.target.checked)} /> Items nobody ticked</label>
        </div>
      </div>
      <div className="exp-list-head">
        <SelectHead sel={sel} total={rows.length} />
        <Buttons busy={busy} disabled={!sel.picked.length} run={run} formats={[['pdf', 'PDF'], ['csv', 'Excel (CSV)']]} />
      </div>
      {rows.length === 0 ? <div className="empty">Nothing was ticked on these dates.</div> : (
        <div className="scroll-x">
          <table className="tbl exp-tbl">
            <thead><tr><th style={{ width: 30 }} /><th>Day</th><th>Item</th><th>List</th><th>Ticked by</th><th>At</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className={sel.has(x.key) ? '' : 'off'} onClick={() => sel.toggle(x.key)}>
                  <td><input type="checkbox" checked={sel.has(x.key)} onChange={() => sel.toggle(x.key)} onClick={(e) => e.stopPropagation()} aria-label="Include" /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDay(x.day)}</td><td>{x.label}</td><td>{x.scope}</td>
                  <td className={x.at ? '' : 'muted'}>{x.who}</td><td className="mono" style={{ fontSize: 12 }}>{x.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- reminders ---------- */

function RemindersExport() {
  const { db, personById } = useData();
  const r = useRange();
  const [person, setPerson] = useState('');
  const { busy, go } = useRunner();
  const routines = useMemo(() => new Map(db.routines.map((x) => [x.id, x])), [db.routines]);
  const rows = db.routine_runs
    .filter((x) => inRange(x.day, r.from, r.to) && routines.has(x.routine_id) && (!person || x.done_by === person || x.claimed_by === person))
    .map((x) => ({ key: `${x.routine_id}-${x.day}`, day: x.day, run: x, routine: routines.get(x.routine_id)! }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.routine.at_time.localeCompare(b.routine.at_time));
  const sel = useSelection(rows.map((x) => x.key));

  const run = (f: string) => go(async () => {
    const t: Table = {
      title: 'Reminders', subtitle: rangeText(r.from, r.to),
      columns: ['Day', 'Time', 'Reminder', 'For', 'Picked up by', 'Done by', 'Done at'],
      rows: rows.filter((x) => sel.has(x.key)).map(({ day, run: x, routine }) => [
        fmtDay(day), hhmm(routine.at_time), routine.title, routine.scope === 'team' ? 'Team' : 'Personal',
        x.claimed_by ? firstName(personById.get(x.claimed_by)) : '', x.done_by ? firstName(personById.get(x.done_by)) : 'not done', x.done_at ? fmtTime(x.done_at) : '',
      ]),
    };
    download(`reminders-${fileRange(r.from, r.to)}.${f}`, f === 'pdf' ? await tableToPdf(t) : tableToCsv(t));
  });

  return (
    <>
      <div className="exp-filters">
        <RangePicker r={r} />
        <PersonPicker value={person} onChange={setPerson} label="Done or picked up by" />
      </div>
      <div className="exp-list-head">
        <SelectHead sel={sel} total={rows.length} />
        <Buttons busy={busy} disabled={!sel.picked.length} run={run} formats={[['pdf', 'PDF'], ['csv', 'Excel (CSV)']]} />
      </div>
      {rows.length === 0 ? <div className="empty">No reminder activity on these dates.</div> : (
        <div className="scroll-x">
          <table className="tbl exp-tbl">
            <thead><tr><th style={{ width: 30 }} /><th>Day</th><th>Reminder</th><th>Picked up by</th><th>Done by</th></tr></thead>
            <tbody>
              {rows.map(({ key, day, run: x, routine }) => (
                <tr key={key} className={sel.has(key) ? '' : 'off'} onClick={() => sel.toggle(key)}>
                  <td><input type="checkbox" checked={sel.has(key)} onChange={() => sel.toggle(key)} onClick={(e) => e.stopPropagation()} aria-label="Include" /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDay(day)} {hhmm(routine.at_time)}</td><td>{routine.title}</td>
                  <td>{x.claimed_by ? firstName(personById.get(x.claimed_by)) : ''}</td>
                  <td className={x.done_by ? '' : 'muted'}>{x.done_by ? `${firstName(personById.get(x.done_by))} at ${fmtTime(x.done_at!)}` : 'not done'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- meetings ---------- */

function MeetingsExport() {
  const { db, taskById } = useData();
  const r = useRange();
  const { busy, go } = useRunner();
  const list = db.meetings.filter((m) => inRange(localDay(m.starts_at), r.from, r.to)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const sel = useSelection(list.map((m) => m.id));
  const actionsOf = (id: string) => [
    ...db.meeting_actions.filter((a) => a.meeting_id === id).sort((a, b) => a.position - b.position).map((a) => `• ${a.text}`),
    ...db.meeting_tasks.filter((x) => x.meeting_id === id).map((x) => taskById.get(x.task_id)).filter(Boolean).map((t) => `• #${t!.number} ${t!.title} (${t!.status})`),
  ].join('\n');

  const run = (f: string) => go(async () => {
    const ms = list.filter((m) => sel.has(m.id));
    const name = `meetings-${fileRange(r.from, r.to)}`;
    if (f === 'pdf') {
      download(`${name}.pdf`, await sectionsToPdf('Meetings', rangeText(r.from, r.to), ms.map((m) => ({
        title: m.title, meta: `${fmtDay(localDay(m.starts_at))} ${fmtTime(m.starts_at)}${m.attendees ? ` · ${m.attendees}` : ''}`,
        parts: [{ label: 'Agenda', text: m.agenda }, { label: 'Notes', text: m.notes }, { label: 'Decisions', text: m.decisions }, { label: 'Actions', text: actionsOf(m.id) }],
      }))));
    } else {
      download(`${name}.csv`, tableToCsv({
        title: 'Meetings', columns: ['Date', 'Time', 'Title', 'Attendees', 'Agenda', 'Notes', 'Decisions', 'Actions'],
        rows: ms.map((m) => [fmtDay(localDay(m.starts_at)), fmtTime(m.starts_at), m.title, m.attendees, m.agenda, m.notes, m.decisions, actionsOf(m.id)]),
      }));
    }
  });

  return (
    <>
      <div className="exp-filters"><RangePicker r={r} /></div>
      <div className="exp-list-head">
        <SelectHead sel={sel} total={list.length} />
        <Buttons busy={busy} disabled={!sel.picked.length} run={run} formats={[['pdf', 'PDF'], ['csv', 'Excel (CSV)']]} />
      </div>
      {list.length === 0 ? <div className="empty">No meetings on these dates.</div> : (
        <div className="exp-cards">
          {list.map((m) => (
            <label key={m.id} className={`exp-card ${sel.has(m.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.has(m.id)} onChange={() => sel.toggle(m.id)} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500 }} className="ellipsis">{m.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>{fmtDay(localDay(m.starts_at))} {fmtTime(m.starts_at)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- page ---------- */

export function ExportPage() {
  const [params, setParams] = useSearchParams();
  const kind = (KINDS.some((k) => k.id === params.get('what')) ? params.get('what') : 'tasks') as Kind;
  const set = (k: Kind) => setParams({ what: k }, { replace: true });
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Export</h1>
        <span className="muted" style={{ fontSize: 13 }}>Pick what, pick the dates, tick what you want, download.</span>
      </div>
      <div className="seg" role="tablist" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
        {KINDS.map((k) => <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => set(k.id)}>{k.label}</button>)}
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>{KINDS.find((k) => k.id === kind)?.hint}</p>
      {kind === 'tasks' && <TasksExport />}
      {kind === 'processes' && <ProcessesExport preselect={params.get('id')} />}
      {kind === 'checklist' && <ChecklistExport />}
      {kind === 'reminders' && <RemindersExport />}
      {kind === 'meetings' && <MeetingsExport />}
    </div>
  );
}
