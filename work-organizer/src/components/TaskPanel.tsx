import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { dueLabel, fmtDay, hhmm, timeAgo } from '../lib/dates';
import { ALARM_CHOICES, alarmLabel } from '../lib/alarms';
import { isOverdue } from '../lib/tasks';
import type { Category, GivenBy, Priority, Status, Task, TaskRow } from '../lib/types';
import { CATEGORIES, GIVEN_BY, PRIORITIES, STATUSES } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';
import { Attachments } from './Attachments';
import { Avatar, Avatars, firstName, TagChip, tagDot } from './Atoms';
import {
  IconBlock, IconChevronDown, IconCopy, IconLink, IconMore, IconPlus, IconTrash, IconX, PriorityIcon, StatusIcon,
} from './Icons';
import { ActionMenu, SelectMenu, useAnchor } from './Popover';
import { useToast } from './Toast';

// ───────────────────────────── Draft model ─────────────────────────────

const FIELDS = ['title', 'status', 'priority', 'given_by', 'category', 'do_date', 'do_time', 'deadline', 'deadline_time',
  'follow_up_date', 'follow_up_time', 'follow_up_with', 'notes', 'remind_at', 'start_alerts', 'deadline_alerts'] as const;
type Field = (typeof FIELDS)[number];
type Fields = Pick<TaskRow, Field>;

interface DraftSub { key: string; id?: string; title: string; done: boolean }
interface Draft {
  fields: Fields;
  assignees: string[];
  tags: string[]; // tag ids, or "new:<name>" for tags created on save
  blockedBy: string[];
  subtasks: DraftSub[];
  newFiles: File[];
  removedFiles: string[];
}

const normTime = (t: string | null) => (t ? hhmm(t) : null);

function fromTask(t: Task): Draft {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, t[f]])) as Fields;
  fields.do_time = normTime(fields.do_time);
  fields.deadline_time = normTime(fields.deadline_time);
  fields.follow_up_time = normTime(fields.follow_up_time);
  fields.start_alerts = [...(fields.start_alerts ?? [0])].sort((a, b) => a - b);
  fields.deadline_alerts = [...(fields.deadline_alerts ?? [60])].sort((a, b) => a - b);
  return {
    fields,
    assignees: [...t.assignees].sort(),
    tags: [...t.tags].sort(),
    blockedBy: [...t.blockedBy].sort(),
    subtasks: t.subtasks.map((s) => ({ key: s.id, id: s.id, title: s.title, done: s.done })),
    newFiles: [],
    removedFiles: [],
  };
}

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, assignees: [...a.assignees].sort(), tags: [...a.tags].sort(), blockedBy: [...a.blockedBy].sort(), newFiles: a.newFiles.map((f) => f.name) })
  === JSON.stringify({ ...b, assignees: [...b.assignees].sort(), tags: [...b.tags].sort(), blockedBy: [...b.blockedBy].sort(), newFiles: b.newFiles.map((f) => f.name) });

// ───────────────────────────── Panel shell ─────────────────────────────

export function TaskPanel() {
  const { openId, close } = useOpenTask();
  const { taskById, setViewing } = useData();
  const task = openId ? taskById.get(openId) : undefined;
  const dirtyRef = useRef(false);

  const tryClose = useCallback(() => {
    if (dirtyRef.current && !confirm('You have unsaved changes. Close without saving?')) return;
    dirtyRef.current = false;
    close();
  }, [close]);

  useEffect(() => {
    setViewing(task?.id ?? null);
    return () => setViewing(null);
  }, [task?.id, setViewing]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, .pop')) tryClose();
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, [openId, tryClose]);

  if (!openId) return null;
  return (
    <div className="panel-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <aside className="panel" aria-label="Task details">
        {task ? <PanelBody key={task.id} task={task} dirtyRef={dirtyRef} onClose={tryClose} /> : (
          <div className="empty">This task was deleted. <button className="btn sm" onClick={close}>Close</button></div>
        )}
      </aside>
    </div>
  );
}

// ───────────────────────────── Panel body ─────────────────────────────

function PanelBody({ task, dirtyRef, onClose }: { task: Task; dirtyRef: MutableRefObject<boolean>; onClose: () => void }) {
  const { db, people, personById, tasks, online, meId, insert, update, remove, can } = useData();
  const canEdit = can('task_edit');
  const canStatus = canEdit || can('task_status');
  const canFiles = can('files_upload');
  const act = useActions();
  const toast = useToast();
  const { close, open } = useOpenTask();

  const saved = useMemo(() => fromTask(task), [task]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const d = draft ?? saved;
  const dirty = draft !== null && !sameDraft(draft, saved);
  dirtyRef.current = dirty;
  const [saving, setSaving] = useState(false);

  const edit = (fn: (x: Draft) => Draft) => setDraft((cur) => fn(cur ?? saved));
  const setField = <K extends Field>(k: K, v: Fields[K]) => edit((x) => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const toggleIn = (key: 'assignees' | 'tags' | 'blockedBy', id: string) =>
    edit((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((v) => v !== id) : [...x[key], id] }));

  const statusM = useAnchor(); const prioM = useAnchor(); const peopleM = useAnchor(); const givenM = useAnchor();
  const catM = useAnchor(); const tagM = useAnchor(); const moreM = useAnchor(); const blockM = useAnchor();
  const [newSub, setNewSub] = useState('');
  const [bulk, setBulk] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
  }, [d.fields.title]);

  // ── Save / cancel ──
  const save = async () => {
    if (!dirty || saving) return;
    if (!d.fields.title.trim()) { toast.error('The task needs a title.'); return; }
    setSaving(true);
    try {
      const patch: Partial<TaskRow> = {};
      for (const f of FIELDS) if (d.fields[f] !== saved.fields[f]) (patch as Record<string, unknown>)[f] = f === 'title' ? d.fields.title.trim() : d.fields[f];
      if (Object.keys(patch).length) await act.updateTask(task.id, patch);

      const diff = (a: string[], b: string[]) => ({ add: a.filter((x) => !b.includes(x)), del: b.filter((x) => !a.includes(x)) });
      const as = diff(d.assignees, saved.assignees);
      if (as.add.length) await insert('task_assignees', as.add.map((user_id) => ({ task_id: task.id, user_id })));
      for (const u of as.del) await remove('task_assignees', { task_id: task.id, user_id: u });

      const newNames = d.tags.filter((t) => t.startsWith('new:')).map((t) => t.slice(4));
      const created = await act.ensureTags(newNames);
      const tagIds = [...d.tags.filter((t) => !t.startsWith('new:')), ...created.map((t) => t.id)];
      const ts = diff([...new Set(tagIds)], saved.tags);
      if (ts.add.length) await insert('task_tags', ts.add.map((tag_id) => ({ task_id: task.id, tag_id })));
      for (const t of ts.del) await remove('task_tags', { task_id: task.id, tag_id: t });

      const bs = diff(d.blockedBy, saved.blockedBy);
      if (bs.add.length) await insert('task_blockers', bs.add.map((blocked_by) => ({ task_id: task.id, blocked_by })));
      for (const b of bs.del) await remove('task_blockers', { task_id: task.id, blocked_by: b });

      // Subtasks: delete removed, update changed, insert new — positions follow the list order.
      const keep = new Set(d.subtasks.map((s) => s.id).filter(Boolean));
      for (const s of saved.subtasks) if (s.id && !keep.has(s.id)) await remove('subtasks', { id: s.id });
      const toInsert: { task_id: string; title: string; done: boolean; position: number }[] = [];
      for (const [i, s] of d.subtasks.entries()) {
        const orig = s.id ? saved.subtasks.findIndex((o) => o.id === s.id) : -1;
        if (!s.id) toInsert.push({ task_id: task.id, title: s.title, done: s.done, position: i });
        else {
          const o = saved.subtasks[orig];
          if (!o || o.title !== s.title || o.done !== s.done || orig !== i) await update('subtasks', { id: s.id }, { title: s.title, done: s.done, position: i });
        }
      }
      if (toInsert.length) await insert('subtasks', toInsert);

      for (const f of d.newFiles) {
        try { await act.uploadPdf(f, { task_id: task.id }); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      }
      for (const id of d.removedFiles) {
        const a = db.attachments.find((x) => x.id === id);
        if (a) await act.deleteAttachment(a.id, a.path);
      }
      setDraft(null);
      toast.show('Saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => setDraft(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Derived display data ──
  const viewers = online.filter((o) => o.viewing === task.id && o.userId !== meId).map((o) => o.userId);
  const linkedMeetings = useMemo(() => {
    const ids = new Set([...db.meeting_tasks.filter((m) => m.task_id === task.id).map((m) => m.meeting_id),
      ...db.meeting_actions.filter((a) => a.task_id === task.id).map((a) => a.meeting_id)]);
    return db.meetings.filter((m) => ids.has(m.id));
  }, [db.meeting_tasks, db.meeting_actions, db.meetings, task.id]);
  const blockers = d.blockedBy.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const blocking = tasks.filter((t) => t.blockedBy.includes(task.id));
  const subsDone = d.subtasks.filter((s) => s.done).length;
  const due = dueLabel(d.fields.deadline, d.fields.status === 'Done', d.fields.deadline_time);
  const overdue = isOverdue({ status: d.fields.status, deadline: d.fields.deadline, deadline_time: d.fields.deadline_time });

  // ── Subtasks ──
  const addSubs = (titles: string[]) => {
    const clean = titles.map((t) => t.replace(/^[\s•\-*\d.)]+/, '').trim()).filter(Boolean);
    if (!clean.length) return;
    edit((x) => ({ ...x, subtasks: [...x.subtasks, ...clean.map((title) => ({ key: crypto.randomUUID(), title, done: false }))] }));
  };
  const onSubPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) { e.preventDefault(); addSubs(text.split(/\r?\n/)); setNewSub(''); }
  };
  const moveSub = (i: number, dir: -1 | 1) => edit((x) => {
    const list = [...x.subtasks];
    const j = i + dir;
    if (j < 0 || j >= list.length) return x;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...x, subtasks: list };
  });
  const setSub = (key: string, patch: Partial<DraftSub>) =>
    edit((x) => ({ ...x, subtasks: x.subtasks.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));


  const copyLink = () => { navigator.clipboard?.writeText(`${location.origin}/tasks/all?task=${task.id}`); toast.show('Link copied'); };
  const tagLabel = (id: string) => (id.startsWith('new:') ? { id, name: id.slice(4), color: 'gray' as const } : db.tags.find((t) => t.id === id));

  const dateTime = (date: 'do_date' | 'deadline' | 'follow_up_date', time: 'do_time' | 'deadline_time' | 'follow_up_time', label: string) => (
    <span className="v" style={{ gap: 2 }}>
      <input type="date" className="date-input" value={d.fields[date] ?? ''} aria-label={label}
        onChange={(e) => edit((x) => ({ ...x, fields: { ...x.fields, [date]: e.target.value || null, ...(e.target.value ? {} : { [time]: null }) } }))} />
      {d.fields[date] && (
        <input type="time" className="date-input" value={d.fields[time] ?? ''} aria-label={`${label} time`} title="Optional time"
          onChange={(e) => setField(time, e.target.value || null)} style={{ width: 104, color: d.fields[time] ? undefined : 'var(--text-3)' }} />
      )}
      {d.fields[date] && (
        <button className="btn ghost icon sm" aria-label={`Clear ${label}`} onClick={() => edit((x) => ({ ...x, fields: { ...x.fields, [date]: null, [time]: null } }))}><IconX size={12} /></button>
      )}
    </span>
  );

  const alarmChips = (key: 'start_alerts' | 'deadline_alerts', what: string) => {
    const on = d.fields[key] ?? [];
    return (
      <>
        <span className="k" style={{ fontSize: 12 }}>{what} alarms</span>
        <span className="v" style={{ gap: 4 }}>
          {ALARM_CHOICES.map((m) => {
            const active = on.includes(m);
            return (
              <button key={m} className={`pill ${active ? 'set' : ''}`} style={{ height: 24, fontSize: 11.5, padding: '0 8px' }} aria-pressed={active}
                onClick={() => setField(key, (active ? on.filter((x) => x !== m) : [...on, m]).sort((a, b) => a - b))}>
                {alarmLabel(m)}
              </button>
            );
          })}
        </span>
      </>
    );
  };

  return (
    <>
      <div className="panel-top">
        <span className="mono">#{task.number}</span>
        <span>·</span>
        <span className="ellipsis">Created by {firstName(personById.get(task.created_by ?? ''))}, {timeAgo(task.created_at)}</span>
        {viewers.length > 0 && <span className="viewers" title="Also looking at this task"><Avatars ids={viewers} byId={personById} /> here now</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button className="btn ghost icon sm" aria-label="More actions" onClick={moreM.open}><IconMore /></button>
          <button className="btn ghost icon sm" aria-label="Close" onClick={onClose}><IconX /></button>
        </span>
      </div>
      {moreM.anchor && (
        <ActionMenu anchor={moreM.anchor} onClose={moreM.close} items={[
          { label: 'Copy link', icon: <IconLink />, run: copyLink },
          ...(can('task_create') ? [{ label: 'Duplicate', icon: <IconCopy />, run: async () => { const r = await act.duplicateTask(task); open(r.id); } }] : []),
          ...(can('task_delete') ? ['sep' as const, { label: 'Delete task', icon: <IconTrash />, danger: true, run: async () => {
            if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
            dirtyRef.current = false; close(); await act.deleteTask(task.id); toast.show('Task deleted');
          } }] : []),
        ]} />
      )}

      {!canEdit && <p className="view-hint" style={{ margin: 0 }}>{canStatus ? 'Your access level lets you change the status and tick sub-tasks only.' : 'View only — your access level can’t change tasks.'}</p>}
      <textarea className="panel-title" rows={1} ref={titleRef} aria-label="Task title" value={d.fields.title} readOnly={!canEdit}
        onChange={(e) => setField('title', e.target.value.replace(/\n/g, ' '))} />

      {(overdue || task.blocked) && (
        <div className="row-gap">
          {overdue && <span className="badge-late">OVERDUE · {due.text.toUpperCase()}</span>}
          {task.blocked && <span className="badge-block">BLOCKED BY {blockers.filter((b) => b.status !== 'Done').length} TASK(S)</span>}
        </div>
      )}

      <div className="props">
        <span className="k">Status</span>
        <span className="v"><button className="vbtn" disabled={!canStatus} onClick={statusM.open}><StatusIcon status={d.fields.status} />{d.fields.status}</button></span>
        <fieldset className="lock contents" disabled={!canEdit}>

        <span className="k">Priority</span>
        <span className="v"><button className="vbtn" onClick={prioM.open}><PriorityIcon priority={d.fields.priority} />{d.fields.priority}</button></span>

        <span className="k">Assigned to</span>
        <span className="v">
          <button className={`vbtn ${d.assignees.length ? '' : 'placeholder'}`} onClick={peopleM.open} style={{ flexWrap: 'wrap' }}>
            {d.assignees.length ? d.assignees.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Avatar person={personById.get(id)} />{firstName(personById.get(id))}</span>
            )) : 'Nobody yet'}
          </button>
        </span>

        <span className="k">Given by</span>
        <span className="v"><button className={`vbtn ${d.fields.given_by ? '' : 'placeholder'}`} onClick={givenM.open}>{d.fields.given_by ?? 'Empty'}</button></span>

        <span className="k">Category</span>
        <span className="v"><button className={`vbtn ${d.fields.category ? '' : 'placeholder'}`} onClick={catM.open}>{d.fields.category ?? 'Empty'}</button></span>

        <span className="k">Tags</span>
        <span className="v">
          <button className={`vbtn ${d.tags.length ? '' : 'placeholder'}`} onClick={tagM.open} style={{ flexWrap: 'wrap', padding: '3px 7px' }}>
            {d.tags.length ? d.tags.map((id) => { const t = tagLabel(id); return t ? <TagChip key={id} tag={t} /> : null; }) : 'Add tags'}
          </button>
        </span>

        <span className="k">Do date</span>
        {dateTime('do_date', 'do_time', 'Do date')}
        {d.fields.do_date && d.fields.do_time && alarmChips('start_alerts', 'Start')}
        {d.fields.do_date && !d.fields.do_time && <><span /><span className="v muted" style={{ fontSize: 12, minHeight: 22 }}>Add a time to get a “time to start” alarm.</span></>}

        <span className="k">Deadline</span>
        <span className="v" style={{ gap: 6 }}>
          {dateTime('deadline', 'deadline_time', 'Deadline')}
          {d.fields.deadline && d.fields.status !== 'Done' && <span className={`mono ${due.tone}`} style={{ fontSize: 12 }}>{due.text}</span>}
        </span>
        {d.fields.deadline && d.fields.deadline_time && alarmChips('deadline_alerts', 'Deadline')}

        <span className="k">Follow-up date</span>
        {dateTime('follow_up_date', 'follow_up_time', 'Follow-up date')}

        <span className="k">Follow up with</span>
        <span className="v"><input className="input bare" placeholder="Person to chase" value={d.fields.follow_up_with ?? ''} style={{ height: 28 }}
          onChange={(e) => setField('follow_up_with', e.target.value || null)} /></span>

        <span className="k">Remind me</span>
        <span className="v">
          <input type="datetime-local" className="date-input" aria-label="Reminder"
            value={d.fields.remind_at ? toLocalInput(d.fields.remind_at) : ''}
            onChange={(e) => setField('remind_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
        </span>
        </fieldset>
      </div>

      {/* Subtasks */}
      <div className="section">
        <div className="section-h">
          Subtasks {d.subtasks.length > 0 && <span className="mono">{subsDone}/{d.subtasks.length}</span>}
          {canEdit && <button className="btn ghost sm r" onClick={() => setBulk(bulk === null ? '' : null)}>{bulk === null ? 'Add several' : 'Close list'}</button>}
        </div>
        {d.subtasks.length > 0 && <div className="progress"><div style={{ width: `${(subsDone / d.subtasks.length) * 100}%` }} /></div>}
        {d.subtasks.map((s, i) => (
          <div className="sub-row" key={s.key}>
            <label className="check"><input type="checkbox" checked={s.done} disabled={!canStatus} onChange={() => setSub(s.key, { done: !s.done })} /><span className="sr-only">Done</span></label>
            <input className="input bare" value={s.title} aria-label="Subtask" readOnly={!canEdit} onChange={(e) => setSub(s.key, { title: e.target.value })}
              style={{ height: 28, textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--text-3)' : undefined }} />
            {canEdit && <>
            <button className="btn ghost icon sm" aria-label="Move up" disabled={i === 0} onClick={() => moveSub(i, -1)}><IconChevronDown size={13} style={{ transform: 'rotate(180deg)' }} /></button>
            <button className="btn ghost icon sm" aria-label="Move down" disabled={i === d.subtasks.length - 1} onClick={() => moveSub(i, 1)}><IconChevronDown size={13} /></button>
            <button className="btn ghost icon sm" aria-label="Remove subtask" onClick={() => edit((x) => ({ ...x, subtasks: x.subtasks.filter((y) => y.key !== s.key) }))}><IconX size={13} /></button>
            </>}
          </div>
        ))}
        {!canEdit ? null : bulk !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea className="textarea" rows={4} autoFocus value={bulk} onChange={(e) => setBulk(e.target.value)}
              placeholder={'One per line, e.g.\nSync Australia\nSync Morocco\nSync USA'} />
            <div className="row-gap">
              <button className="btn sm" onClick={() => { addSubs(bulk.split(/\r?\n/)); setBulk(null); }}>Add {bulk.split(/\r?\n/).filter((l) => l.trim()).length || ''} subtasks</button>
              <span className="muted" style={{ fontSize: 12 }}>Tip: pasting a list into the box below works too.</span>
            </div>
          </div>
        ) : (
          <div className="sub-row">
            <IconPlus size={14} style={{ color: 'var(--icon)' }} />
            <input className="input bare" placeholder="Add a subtask and press Enter (or paste a list)" value={newSub} style={{ height: 28 }}
              onChange={(e) => setNewSub(e.target.value)} onPaste={onSubPaste}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { addSubs([newSub]); setNewSub(''); } }} />
          </div>
        )}
      </div>

      {/* Blockers */}
      <fieldset className="lock" disabled={!canEdit}>
      <div className="section">
        <div className="section-h">
          Blocked by
          <button className="btn ghost sm r" onClick={blockM.open}><IconBlock size={13} /> Add</button>
        </div>
        {blockers.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Not waiting on any other task.</span>}
        {blockers.map((b) => (
          <div className="sub-row" key={b.id}>
            <StatusIcon status={b.status} />
            <span className="grow ellipsis">#{b.number} {b.title}</span>
            <button className="btn ghost icon sm" aria-label="Remove blocker" onClick={() => toggleIn('blockedBy', b.id)}><IconX size={13} /></button>
          </div>
        ))}
        {blocking.length > 0 && <span className="muted" style={{ fontSize: 12.5 }}>This task blocks: {blocking.map((b) => `#${b.number}`).join(', ')}</span>}
      </div>

      {/* Notes */}
      <div className="section">
        <div className="section-h">Notes</div>
        <textarea className="textarea" placeholder="Write anything…" value={d.fields.notes} rows={4} onChange={(e) => setField('notes', e.target.value)} />
      </div>
      </fieldset>

      {/* Attachments */}
      <Attachments
        saved={db.attachments.filter((a) => a.task_id === task.id)}
        newFiles={d.newFiles} removed={d.removedFiles}
        onAdd={(files) => edit((x) => ({ ...x, newFiles: [...x.newFiles, ...files] }))}
        onRemoveSaved={(id) => edit((x) => ({ ...x, removedFiles: [...x.removedFiles, id] }))}
        onRemoveNew={(i) => edit((x) => ({ ...x, newFiles: x.newFiles.filter((_, j) => j !== i) }))}
        readOnly={!canFiles}
      />

      {linkedMeetings.length > 0 && (
        <div className="section">
          <div className="section-h">Meetings</div>
          {linkedMeetings.map((m) => <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>{m.title} · {fmtDay(m.starts_at.slice(0, 10))}</Link>)}
        </div>
      )}

      <div className="section muted" style={{ fontSize: 12 }}>
        <span>Last updated by {firstName(personById.get(task.updated_by ?? ''))}, {timeAgo(task.updated_at)}</span>
        {task.completed_at && <span>Completed {timeAgo(task.completed_at)}</span>}
      </div>

      <div className={`panel-foot ${dirty ? 'dirty' : ''}`}>
        <span className="muted" style={{ fontSize: 12.5 }}>{dirty ? 'Unsaved changes' : 'No changes'}</span>
        <span className="kbd" style={{ marginLeft: 6 }}>Ctrl S</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={dirty ? cancel : onClose}>{dirty ? 'Cancel' : 'Close'}</button>
          <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </span>
      </div>

      {/* Menus */}
      {statusM.anchor && <SelectMenu<Status> anchor={statusM.anchor} onClose={statusM.close} value={d.fields.status}
        options={STATUSES.map((s) => ({ value: s, label: s, icon: <StatusIcon status={s} /> }))} onPick={(s) => setField('status', s)} />}
      {prioM.anchor && <SelectMenu<Priority> anchor={prioM.anchor} onClose={prioM.close} value={d.fields.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: p, icon: <PriorityIcon priority={p} /> }))} onPick={(p) => setField('priority', p)} />}
      {peopleM.anchor && <SelectMenu anchor={peopleM.anchor} onClose={peopleM.close} multi search value={d.assignees}
        options={people.map((p) => ({ value: p.id, label: p.id === meId ? `${p.full_name || p.email} (you)` : p.full_name || p.email, icon: <Avatar person={p} /> }))}
        onPick={(id) => toggleIn('assignees', id)} />}
      {givenM.anchor && <SelectMenu<GivenBy | ''> anchor={givenM.anchor} onClose={givenM.close} value={d.fields.given_by ?? ''}
        options={[...GIVEN_BY.map((g) => ({ value: g as GivenBy | '', label: g })), { value: '', label: 'Empty' }]}
        onPick={(g) => setField('given_by', g || null)} />}
      {catM.anchor && <SelectMenu<Category | ''> anchor={catM.anchor} onClose={catM.close} value={d.fields.category ?? ''}
        options={[...CATEGORIES.map((c) => ({ value: c as Category | '', label: c })), { value: '', label: 'Empty' }]}
        onPick={(c) => setField('category', c || null)} />}
      {tagM.anchor && <SelectMenu anchor={tagM.anchor} onClose={tagM.close} multi search value={d.tags}
        options={[...db.tags.map((t) => ({ value: t.id, label: t.name, icon: tagDot(t.color) })),
          ...d.tags.filter((t) => t.startsWith('new:')).map((t) => ({ value: t, label: `${t.slice(4)} (new)`, icon: tagDot('gray') }))]}
        onPick={(id) => toggleIn('tags', id)}
        footer={
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, padding: 4 }}>
            <input className="input" style={{ height: 28 }} placeholder="New tag + Enter" value={newTag} onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                const name = newTag.trim().toLowerCase();
                if (e.key !== 'Enter' || !name) return;
                const existing = db.tags.find((t) => t.name.toLowerCase() === name);
                const id = existing ? existing.id : `new:${name}`;
                if (!d.tags.includes(id)) toggleIn('tags', id);
                setNewTag('');
              }} />
          </div>
        } />}
      {blockM.anchor && <SelectMenu anchor={blockM.anchor} onClose={blockM.close} search value={d.blockedBy}
        options={tasks.filter((t) => t.id !== task.id && t.status !== 'Done').map((t) => ({ value: t.id, label: `#${t.number} ${t.title}` }))}
        onPick={(id) => toggleIn('blockedBy', id)} />}
    </>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
