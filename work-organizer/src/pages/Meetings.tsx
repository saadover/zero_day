import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Attachments } from '../components/Attachments';
import { firstName } from '../components/Atoms';
import { IconArrowRight, IconChevronLeft, IconLink, IconPlus, IconTrash, IconX, StatusIcon } from '../components/Icons';
import { SelectMenu, useAnchor } from '../components/Popover';
import { TaskRow } from '../components/TaskRow';
import { useToast } from '../components/Toast';
import { fmtDay, fmtTime, timeAgo, today } from '../lib/dates';
import type { Meeting } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';

export function MeetingsPage() {
  const { db, personById, can } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const list = [...db.meetings]
    .filter((m) => !q || `${m.title} ${m.attendees} ${m.notes}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcoming = list.filter((m) => m.starts_at.slice(0, 10) >= today()).reverse();
  const past = list.filter((m) => m.starts_at.slice(0, 10) < today());

  const create = () => nav('/meetings/new');

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
          {can('meeting_edit') && <button className="btn primary" onClick={create}><IconPlus size={14} /> New meeting</button>}
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

interface DraftAction { key: string; id?: string; text: string; task_id: string | null }
interface MeetingDraft {
  title: string; starts: string; attendees: string; agenda: string; notes: string; decisions: string;
  actions: DraftAction[]; links: string[]; newFiles: File[]; removedFiles: string[];
}

const toLocal = (iso: string) => {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function MeetingPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { db, tasks, update, insert, remove, meId, personById, can } = useData();
  const canEdit = can('meeting_edit');
  const act = useActions();
  const toast = useToast();
  const nav = useNavigate();
  const { open } = useOpenTask();
  const linkM = useAnchor();
  const [newAction, setNewAction] = useState('');
  const [busy, setBusy] = useState(false);
  const m = isNew ? undefined : db.meetings.find((x) => x.id === id);

  const saved = useMemo<MeetingDraft>(() => {
    if (!m) {
      const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
      return { title: '', starts: toLocal(d.toISOString()), attendees: '', agenda: '', notes: '', decisions: '', actions: [], links: [], newFiles: [], removedFiles: [] };
    }
    return {
      title: m.title, starts: toLocal(m.starts_at), attendees: m.attendees, agenda: m.agenda, notes: m.notes, decisions: m.decisions,
      actions: db.meeting_actions.filter((a) => a.meeting_id === m.id).sort((a, b) => a.position - b.position)
        .map((a) => ({ key: a.id, id: a.id, text: a.text, task_id: a.task_id })),
      links: db.meeting_tasks.filter((x) => x.meeting_id === m.id).map((x) => x.task_id).sort(),
      newFiles: [], removedFiles: [],
    };
  }, [m, db.meeting_actions, db.meeting_tasks]);
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const d = draft ?? saved;
  const dirty = isNew || (draft !== null && JSON.stringify({ ...draft, links: [...draft.links].sort(), newFiles: draft.newFiles.map((f) => f.name) })
    !== JSON.stringify({ ...saved, newFiles: [] }));
  const edit = (patch: Partial<MeetingDraft> | ((x: MeetingDraft) => MeetingDraft)) =>
    setDraft((cur) => (typeof patch === 'function' ? patch(cur ?? saved) : { ...(cur ?? saved), ...patch }));

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty && draft) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, draft]);

  if (!isNew && !m) return <div className="page"><div className="empty">Meeting not found. <Link to="/meetings">Back to meetings</Link></div></div>;


  /** Write the draft to the database. Returns the meeting id. */
  const save = async (): Promise<string | null> => {
    if (!d.title.trim()) { toast.error('Give the meeting a title.'); return null; }
    setBusy(true);
    try {
      const fields = { title: d.title.trim(), starts_at: new Date(d.starts).toISOString(), attendees: d.attendees, agenda: d.agenda, notes: d.notes, decisions: d.decisions };
      let mid = m?.id;
      if (!mid) { const [row] = await insert('meetings', fields); mid = row.id; }
      else await update('meetings', { id: mid }, { ...fields, updated_at: new Date().toISOString() });

      const keep = new Set(d.actions.map((a) => a.id).filter(Boolean));
      for (const a of saved.actions) if (a.id && !keep.has(a.id)) await remove('meeting_actions', { id: a.id });
      for (const [i, a] of d.actions.entries()) {
        if (!a.text.trim()) continue;
        if (!a.id) await insert('meeting_actions', { meeting_id: mid, text: a.text.trim(), position: i, task_id: a.task_id });
        else {
          const o = saved.actions.find((x) => x.id === a.id);
          if (o && (o.text !== a.text || saved.actions.indexOf(o) !== i)) await update('meeting_actions', { id: a.id }, { text: a.text.trim(), position: i });
        }
      }
      const add = d.links.filter((t) => !saved.links.includes(t));
      const del = saved.links.filter((t) => !d.links.includes(t));
      if (add.length) await insert('meeting_tasks', add.map((task_id) => ({ meeting_id: mid!, task_id })));
      for (const t of del) await remove('meeting_tasks', { meeting_id: mid, task_id: t });
      for (const f of d.newFiles) { try { await act.uploadPdf(f, { meeting_id: mid }); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); } }
      for (const fid of d.removedFiles) { const a = db.attachments.find((x) => x.id === fid); if (a) await act.deleteAttachment(a.id, a.path); }

      setDraft(null);
      toast.show('Meeting saved');
      if (isNew) nav(`/meetings/${mid}`, { replace: true });
      return mid;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally { setBusy(false); }
  };

  const cancel = () => {
    if (isNew) { nav('/meetings'); return; }
    setDraft(null);
  };

  const makeTask = async (a: DraftAction) => {
    if (!a.id || dirty) {
      if (!confirm('Save the meeting first, then create the task?')) return;
      const mid = await save();
      if (!mid) return;
      toast.show('Saved — click “Make task” again to create it.');
      return;
    }
    const row = await act.createTask({ title: a.text, category: 'Meeting', given_by: 'Me' }, { assignees: [meId] });
    await update('meeting_actions', { id: a.id }, { task_id: row.id });
    await insert('meeting_tasks', { meeting_id: m!.id, task_id: row.id });
    toast.show(`Task #${row.number} created`, { label: 'Open', run: () => open(row.id) });
  };


  const linked = tasks.filter((t) => d.links.includes(t.id));
  const addAction = () => {
    const text = newAction.trim();
    if (!text) return;
    edit((x) => ({ ...x, actions: [...x.actions, { key: crypto.randomUUID(), text, task_id: null }] }));
    setNewAction('');
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="row-gap" style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={() => { if (!(dirty && draft) || confirm('Leave without saving?')) nav('/meetings'); }}><IconChevronLeft size={14} /> Meetings</button>
        {m && <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Created by {firstName(personById.get(m.created_by ?? ''))} · edited {timeAgo(m.updated_at)}</span>}
        {m && canEdit && (
          <button className="btn ghost sm danger" onClick={async () => {
            if (!confirm('Delete this meeting and its notes?')) return;
            const all = db.attachments.filter((a) => a.meeting_id === m.id);
            if (all.length) await Promise.all(all.map((f) => act.deleteAttachment(f.id, f.path)));
            await remove('meetings', { id: m.id }); nav('/meetings');
          }}><IconTrash size={14} /> Delete</button>
        )}
      </div>

      {!canEdit && <p className="view-hint">View only — your access level can’t change meetings.</p>}
      <fieldset className="lock" disabled={!canEdit}>
      <input className="panel-title" style={{ fontSize: 22, marginBottom: 6 }} value={d.title} placeholder="Meeting title" aria-label="Meeting title"
        autoFocus={isNew} onChange={(e) => edit({ title: e.target.value })} />

      <div className="props" style={{ marginBottom: 8 }}>
        <span className="k">Date</span>
        <span className="v"><input type="datetime-local" className="date-input" value={d.starts} aria-label="Date and time" onChange={(e) => e.target.value && edit({ starts: e.target.value })} /></span>
        <span className="k">Attendees</span>
        <span className="v"><input className="input bare" value={d.attendees} placeholder="Who was there" style={{ height: 28 }} onChange={(e) => edit({ attendees: e.target.value })} /></span>
      </div>

      </fieldset>
      <div className="doc">
        <fieldset className="lock" disabled={!canEdit}>
        <h3>Agenda</h3>
        <textarea className="textarea" rows={3} value={d.agenda} placeholder="1. Topic…" onChange={(e) => edit({ agenda: e.target.value })} aria-label="Agenda" />
        <h3>Notes</h3>
        <textarea className="textarea" rows={8} value={d.notes} placeholder="What was discussed" onChange={(e) => edit({ notes: e.target.value })} aria-label="Notes" />
        <h3>Decisions</h3>
        <textarea className="textarea" rows={3} value={d.decisions} placeholder="What was decided" onChange={(e) => edit({ decisions: e.target.value })} aria-label="Decisions" />

        <h3>Action items</h3>
        <div>
          {d.actions.map((a) => {
            const t = a.task_id ? tasks.find((x) => x.id === a.task_id) : undefined;
            return (
              <div className="action" key={a.key}>
                {t ? <StatusIcon status={t.status} /> : <span className="dot" style={{ background: 'var(--icon)', margin: '0 3px' }} />}
                <input className="input bare grow" value={a.text} aria-label="Action item" style={{ height: 30 }}
                  onChange={(e) => edit((x) => ({ ...x, actions: x.actions.map((y) => (y.key === a.key ? { ...y, text: e.target.value } : y)) }))} />
                {t ? <button className="btn ghost sm" onClick={() => open(t.id)}>#{t.number} · {t.status}</button>
                  : <button className="btn sm" onClick={() => makeTask(a)}><IconArrowRight size={13} /> Make task</button>}
                <button className="btn ghost sm icon" aria-label="Remove" onClick={() => edit((x) => ({ ...x, actions: x.actions.filter((y) => y.key !== a.key) }))}><IconX size={13} /></button>
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
              <button className="btn ghost sm icon" aria-label="Unlink" onClick={(e) => { e.stopPropagation(); edit((x) => ({ ...x, links: x.links.filter((l) => l !== t.id) })); }}><IconX size={13} /></button>
            } />
          ))}
          {linked.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>No linked tasks.</div>}
        </div>

        </fieldset>
        <h3>Files</h3>
        <Attachments
          readOnly={!canEdit || !can('files_upload')}
          saved={m ? db.attachments.filter((a) => a.meeting_id === m.id) : []}
          newFiles={d.newFiles} removed={d.removedFiles}
          onAdd={(list) => edit((x) => ({ ...x, newFiles: [...x.newFiles, ...list] }))}
          onRemoveSaved={(fid) => edit((x) => ({ ...x, removedFiles: [...x.removedFiles, fid] }))}
          onRemoveNew={(i) => edit((x) => ({ ...x, newFiles: x.newFiles.filter((_, j) => j !== i) }))}
        />
      </div>

      {canEdit && <div className="save-bar">
        <span className="muted" style={{ fontSize: 12.5 }}>{isNew ? 'New meeting — not saved yet' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!dirty || busy} onClick={cancel}>Cancel</button>
          <button className="btn primary" disabled={!dirty || busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
        </span>
      </div>}

      {linkM.anchor && (
        <SelectMenu anchor={linkM.anchor} onClose={linkM.close} search multi value={d.links}
          options={tasks.filter((t) => t.status !== 'Done' || d.links.includes(t.id)).map((t) => ({ value: t.id, label: `#${t.number} ${t.title}` }))}
          onPick={(tid) => edit((x) => ({ ...x, links: x.links.includes(tid) ? x.links.filter((l) => l !== tid) : [...x.links, tid] }))} />
      )}
    </div>
  );
}
