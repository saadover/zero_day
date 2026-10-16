import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { firstName, formatBytes } from '../components/Atoms';
import { IconArrowRight, IconChevronLeft, IconDownload, IconLink, IconPaperclip, IconPlus, IconTrash, IconX, StatusIcon } from '../components/Icons';
import { SelectMenu, useAnchor } from '../components/Popover';
import { TaskRow } from '../components/TaskRow';
import { useToast } from '../components/Toast';
import { fmtDay, fmtTime, timeAgo, today } from '../lib/dates';
import type { Meeting } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';

export function MeetingsPage() {
  const { db, insert, personById } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const list = [...db.meetings]
    .filter((m) => !q || `${m.title} ${m.attendees} ${m.notes}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcoming = list.filter((m) => m.starts_at.slice(0, 10) >= today()).reverse();
  const past = list.filter((m) => m.starts_at.slice(0, 10) < today());

  const create = async () => {
    const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
    const [m] = await insert('meetings', { title: 'New meeting', starts_at: d.toISOString() });
    nav(`/meetings/${m.id}`);
  };

  const Item = ({ m }: { m: Meeting }) => (
    <Link to={`/meetings/${m.id}`} className="trow" style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className="mono" style={{ width: 110, fontSize: 12 }}>{fmtDay(m.starts_at.slice(0, 10))}</span>
      <span className="mono muted" style={{ width: 44, fontSize: 12 }}>{fmtTime(m.starts_at)}</span>
      <span className="title">{m.title}</span>
      <span className="meta">{db.meeting_tasks.filter((x) => x.meeting_id === m.id).length} linked</span>
      <span className="meta ellipsis" style={{ maxWidth: 200 }}>{m.attendees}</span>
      <span className="meta">{firstName(personById.get(m.created_by ?? ''))}</span>
    </Link>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Meetings</h1>
        <span className="sub">{db.meetings.length} notes</span>
        <div className="actions">
          <input className="input" style={{ width: 200 }} placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search meetings" />
          <button className="btn primary" onClick={create}><IconPlus size={14} /> New meeting</button>
        </div>
      </div>
      {upcoming.length > 0 && <><div className="side-label" style={{ paddingLeft: 2 }}>Upcoming</div><div className="list">{upcoming.map((m) => <Item key={m.id} m={m} />)}</div></>}
      <div className="side-label" style={{ paddingLeft: 2 }}>Past</div>
      <div className="list">
        {past.map((m) => <Item key={m.id} m={m} />)}
        {past.length === 0 && <div className="empty">No past meetings yet.</div>}
      </div>
    </div>
  );
}

function Field({ value, onSave, placeholder, rows = 4, label }: { value: string; onSave: (v: string) => void; placeholder: string; rows?: number; label: string }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  return (
    <textarea className="textarea" rows={rows} value={v} placeholder={placeholder} aria-label={label}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setV(e.target.value)} onBlur={() => { focused.current = false; if (v !== value) onSave(v); }} />
  );
}

export function MeetingPage() {
  const { id } = useParams();
  const { db, tasks, update, insert, remove, meId, personById } = useData();
  const act = useActions();
  const toast = useToast();
  const nav = useNavigate();
  const { open } = useOpenTask();
  const linkM = useAnchor();
  const [newAction, setNewAction] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const m = db.meetings.find((x) => x.id === id);

  if (!m) return <div className="page"><div className="empty">Meeting not found. <Link to="/meetings">Back to meetings</Link></div></div>;

  const save = (patch: Partial<Meeting>) => update('meetings', { id: m.id }, { ...patch, updated_at: new Date().toISOString() });
  const actions = db.meeting_actions.filter((a) => a.meeting_id === m.id).sort((a, b) => a.position - b.position);
  const linkedIds = db.meeting_tasks.filter((x) => x.meeting_id === m.id).map((x) => x.task_id);
  const linked = tasks.filter((t) => linkedIds.includes(t.id));
  const files = db.attachments.filter((a) => a.meeting_id === m.id);

  const addAction = async () => {
    const text = newAction.trim();
    if (!text) return;
    setNewAction('');
    await insert('meeting_actions', { meeting_id: m.id, text, position: Date.now() });
  };

  const makeTask = async (actionId: string, text: string) => {
    const row = await act.createTask({ title: text, category: 'Meeting', given_by: 'Me' }, { assignees: [meId] });
    await update('meeting_actions', { id: actionId }, { task_id: row.id });
    await insert('meeting_tasks', { meeting_id: m.id, task_id: row.id });
    toast.show(`Task #${row.number} created`, { label: 'Open', run: () => open(row.id) });
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const f of list) { try { await act.uploadPdf(f, { meeting_id: m.id }); } catch (err) { toast.error((err as Error).message); } }
  };

  const localStart = (() => {
    const d = new Date(m.starts_at); const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  })();

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="row-gap" style={{ marginBottom: 14 }}>
        <Link to="/meetings" className="btn ghost sm"><IconChevronLeft size={14} /> Meetings</Link>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Created by {firstName(personById.get(m.created_by ?? ''))} · edited {timeAgo(m.updated_at)}</span>
        <button className="btn ghost sm danger" onClick={async () => {
          if (!confirm('Delete this meeting and its notes?')) return;
          if (files.length) await Promise.all(files.map((f) => act.deleteAttachment(f.id, f.path)));
          await remove('meetings', { id: m.id }); nav('/meetings');
        }}><IconTrash size={14} /> Delete</button>
      </div>

      <input className="panel-title" style={{ fontSize: 22, marginBottom: 6 }} defaultValue={m.title} key={m.title} aria-label="Meeting title"
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.title) save({ title: v }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />

      <div className="props" style={{ marginBottom: 8 }}>
        <span className="k">Date</span>
        <span className="v"><input type="datetime-local" className="date-input" value={localStart} aria-label="Date and time"
          onChange={(e) => e.target.value && save({ starts_at: new Date(e.target.value).toISOString() })} /></span>
        <span className="k">Attendees</span>
        <span className="v"><input className="input bare" defaultValue={m.attendees} key={m.attendees} placeholder="Who was there" style={{ height: 28 }}
          onBlur={(e) => e.target.value !== m.attendees && save({ attendees: e.target.value })} /></span>
      </div>

      <div className="doc">
        <h3>Agenda</h3>
        <Field label="Agenda" value={m.agenda} onSave={(v) => save({ agenda: v })} placeholder="1. Topic…" rows={3} />
        <h3>Notes</h3>
        <Field label="Notes" value={m.notes} onSave={(v) => save({ notes: v })} placeholder="What was discussed" rows={8} />
        <h3>Decisions</h3>
        <Field label="Decisions" value={m.decisions} onSave={(v) => save({ decisions: v })} placeholder="What was decided" rows={3} />

        <h3>Action items</h3>
        <div>
          {actions.map((a) => {
            const t = a.task_id ? tasks.find((x) => x.id === a.task_id) : undefined;
            return (
              <div className="action" key={a.id}>
                {t ? <StatusIcon status={t.status} /> : <span className="dot" style={{ background: 'var(--icon)', margin: '0 3px' }} />}
                <input className="input bare grow" defaultValue={a.text} aria-label="Action item" style={{ height: 30 }}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.text) update('meeting_actions', { id: a.id }, { text: v }); }} />
                {t ? (
                  <button className="btn ghost sm" onClick={() => open(t.id)}>#{t.number} · {t.status}</button>
                ) : (
                  <button className="btn sm" onClick={() => makeTask(a.id, a.text)}><IconArrowRight size={13} /> Make task</button>
                )}
                <button className="btn ghost sm icon" aria-label="Remove" onClick={() => remove('meeting_actions', { id: a.id })}><IconX size={13} /></button>
              </div>
            );
          })}
          <div className="action">
            <IconPlus size={14} style={{ color: 'var(--icon)' }} />
            <input className="input bare grow" placeholder="Add an action item and press Enter" value={newAction} style={{ height: 30 }}
              onChange={(e) => setNewAction(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAction(); }} />
          </div>
        </div>

        <h3 style={{ display: 'flex', alignItems: 'center' }}>Related tasks
          <button className="btn ghost sm" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }} onClick={linkM.open}><IconLink size={13} /> Link task</button>
        </h3>
        <div className="list flat">
          {linked.map((t) => (
            <TaskRow key={t.id} task={t} right={
              <button className="btn ghost sm icon" aria-label="Unlink" onClick={(e) => { e.stopPropagation(); remove('meeting_tasks', { meeting_id: m.id, task_id: t.id }); }}><IconX size={13} /></button>
            } />
          ))}
          {linked.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>No linked tasks.</div>}
        </div>

        <h3 style={{ display: 'flex', alignItems: 'center' }}>PDFs
          <button className="btn ghost sm" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }} onClick={() => fileRef.current?.click()}><IconPaperclip size={13} /> Attach PDF</button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={onFiles} />
        </h3>
        {files.map((a) => (
          <div className="file" key={a.id}>
            <span className="fi">PDF</span>
            <button className="vbtn grow" style={{ margin: 0 }} onClick={() => act.openAttachment(a.path).catch((e) => toast.error(e.message))}>
              <span className="ellipsis">{a.name}</span><span className="muted" style={{ fontSize: 11.5 }}>{formatBytes(a.size)}</span>
            </button>
            <button className="btn ghost icon sm" aria-label="Download" onClick={() => act.openAttachment(a.path, true)}><IconDownload size={14} /></button>
            <button className="btn ghost icon sm" aria-label="Delete file" onClick={() => { if (confirm(`Delete ${a.name}?`)) act.deleteAttachment(a.id, a.path); }}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>

      {linkM.anchor && (
        <SelectMenu anchor={linkM.anchor} onClose={linkM.close} search multi value={linkedIds}
          options={tasks.filter((t) => t.status !== 'Done' || linkedIds.includes(t.id)).map((t) => ({ value: t.id, label: `#${t.number} ${t.title}` }))}
          onPick={(tid) => linkedIds.includes(tid)
            ? remove('meeting_tasks', { meeting_id: m.id, task_id: tid })
            : insert('meeting_tasks', { meeting_id: m.id, task_id: tid })} />
      )}
    </div>
  );
}
