import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { dueLabel, fmtDay, timeAgo } from '../lib/dates';
import { isOverdue } from '../lib/tasks';
import type { Category, GivenBy, Priority, Status, Task } from '../lib/types';
import { CATEGORIES, GIVEN_BY, PRIORITIES, STATUSES } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';
import { Avatar, Avatars, firstName, formatBytes, TagChip, tagDot } from './Atoms';
import {
  IconBlock, IconCopy, IconDownload, IconLink, IconMore, IconPaperclip, IconPlus, IconTrash, IconX, PriorityIcon, StatusIcon,
} from './Icons';
import { ActionMenu, SelectMenu, useAnchor } from './Popover';
import { useToast } from './Toast';

/** Text that saves when you leave the field (or press Enter for single-line). */
function useDraft(value: string, save: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return {
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; if (draft !== value) save(draft); },
  };
}

export function TaskPanel() {
  const { openId, close } = useOpenTask();
  const { taskById, setViewing } = useData();
  const task = openId ? taskById.get(openId) : undefined;

  useEffect(() => {
    setViewing(task?.id ?? null);
    return () => setViewing(null);
  }, [task?.id, setViewing]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, .pop')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, close]);

  if (!openId) return null;
  return (
    <div className="panel-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside className="panel" aria-label="Task details">
        {task ? <PanelBody key={task.id} task={task} /> : (
          <div className="empty">This task was deleted. <button className="btn sm" onClick={close}>Close</button></div>
        )}
      </aside>
    </div>
  );
}

function PanelBody({ task }: { task: Task }) {
  const { db, people, personById, tasks, online, meId, insert, update, remove } = useData();
  const act = useActions();
  const toast = useToast();
  const { close, open } = useOpenTask();

  const statusM = useAnchor(); const prioM = useAnchor(); const peopleM = useAnchor(); const givenM = useAnchor();
  const catM = useAnchor(); const tagM = useAnchor(); const moreM = useAnchor(); const blockM = useAnchor();

  const title = useDraft(task.title, (v) => v.trim() && act.updateTask(task.id, { title: v.trim() }));
  const notes = useDraft(task.notes, (v) => act.updateTask(task.id, { notes: v }));
  const followWith = useDraft(task.follow_up_with ?? '', (v) => act.updateTask(task.id, { follow_up_with: v.trim() || null }));
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
  }, [title.value]);
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const viewers = online.filter((o) => o.viewing === task.id && o.userId !== meId).map((o) => o.userId);
  const attachments = db.attachments.filter((a) => a.task_id === task.id);
  const meetings = db.meeting_tasks.filter((m) => m.task_id === task.id)
    .map((m) => db.meetings.find((x) => x.id === m.meeting_id)).filter(Boolean);
  const actionFrom = db.meeting_actions.filter((a) => a.task_id === task.id)
    .map((a) => db.meetings.find((x) => x.id === a.meeting_id)).filter(Boolean);
  const linkedMeetings = [...new Map([...meetings, ...actionFrom].map((m) => [m!.id, m!])).values()];
  const blockers = task.blockedBy.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const blocking = tasks.filter((t) => t.blockedBy.includes(task.id));
  const subsDone = task.subtasks.filter((s) => s.done).length;
  const due = dueLabel(task.deadline, task.status === 'Done');

  const setDate = (field: 'do_date' | 'deadline' | 'follow_up_date') => (e: ChangeEvent<HTMLInputElement>) =>
    act.updateTask(task.id, { [field]: e.target.value || null });

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setUploading(true);
    for (const f of files) {
      try { await act.uploadPdf(f, { task_id: task.id }); } catch (err) { toast.error((err as Error).message); }
    }
    setUploading(false);
  };

  const addSub = async () => {
    const t = newSub.trim();
    if (!t) return;
    setNewSub('');
    await insert('subtasks', { task_id: task.id, title: t, position: Date.now() });
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(`${location.origin}/tasks/all?task=${task.id}`);
    toast.show('Link copied');
  };

  return (
    <>
      <div className="panel-top">
        <span className="mono">#{task.number}</span>
        <span>·</span>
        <span className="ellipsis">Created by {firstName(personById.get(task.created_by ?? ''))}, {timeAgo(task.created_at)}</span>
        {viewers.length > 0 && (
          <span className="viewers" title="Also looking at this task"><Avatars ids={viewers} byId={personById} /> here now</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button className="btn ghost icon sm" aria-label="More actions" onClick={moreM.open}><IconMore /></button>
          <button className="btn ghost icon sm" aria-label="Close" onClick={close}><IconX /></button>
        </span>
      </div>
      {moreM.anchor && (
        <ActionMenu anchor={moreM.anchor} onClose={moreM.close} items={[
          { label: 'Copy link', icon: <IconLink />, run: copyLink },
          { label: 'Duplicate', icon: <IconCopy />, run: async () => { const r = await act.duplicateTask(task); open(r.id); } },
          'sep',
          { label: 'Delete task', icon: <IconTrash />, danger: true, run: async () => {
            if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
            close(); await act.deleteTask(task.id); toast.show('Task deleted');
          } },
        ]} />
      )}

      <textarea
        className="panel-title" rows={1} {...title} aria-label="Task title" ref={titleRef}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
      />

      {(isOverdue(task) || task.blocked) && (
        <div className="row-gap">
          {isOverdue(task) && <span className="badge-late">OVERDUE · {due.text.toUpperCase()}</span>}
          {task.blocked && <span className="badge-block">BLOCKED BY {blockers.filter((b) => b.status !== 'Done').length} TASK(S)</span>}
        </div>
      )}

      <div className="props">
        <span className="k">Status</span>
        <span className="v"><button className="vbtn" onClick={statusM.open}><StatusIcon status={task.status} />{task.status}</button></span>

        <span className="k">Priority</span>
        <span className="v"><button className="vbtn" onClick={prioM.open}><PriorityIcon priority={task.priority} />{task.priority}</button></span>

        <span className="k">Assigned to</span>
        <span className="v">
          <button className={`vbtn ${task.assignees.length ? '' : 'placeholder'}`} onClick={peopleM.open}>
            {task.assignees.length ? task.assignees.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Avatar person={personById.get(id)} />{firstName(personById.get(id))}
              </span>
            )) : 'Nobody yet'}
          </button>
        </span>

        <span className="k">Given by</span>
        <span className="v"><button className={`vbtn ${task.given_by ? '' : 'placeholder'}`} onClick={givenM.open}>{task.given_by ?? 'Empty'}</button></span>

        <span className="k">Category</span>
        <span className="v"><button className={`vbtn ${task.category ? '' : 'placeholder'}`} onClick={catM.open}>{task.category ?? 'Empty'}</button></span>

        <span className="k">Tags</span>
        <span className="v">
          <button className={`vbtn ${task.tags.length ? '' : 'placeholder'}`} onClick={tagM.open} style={{ flexWrap: 'wrap', padding: '3px 7px' }}>
            {task.tags.length ? task.tags.map((id) => {
              const t = db.tags.find((x) => x.id === id);
              return t ? <TagChip key={id} tag={t} /> : null;
            }) : 'Add tags'}
          </button>
        </span>

        <span className="k">Do date</span>
        <span className="v"><input type="date" className="date-input" value={task.do_date ?? ''} onChange={setDate('do_date')} aria-label="Do date" /></span>

        <span className="k">Deadline</span>
        <span className="v">
          <input type="date" className="date-input" value={task.deadline ?? ''} onChange={setDate('deadline')} aria-label="Deadline" />
          {task.deadline && task.status !== 'Done' && <span className={`mono ${due.tone}`} style={{ fontSize: 12 }}>{due.text}</span>}
        </span>

        <span className="k">Follow-up date</span>
        <span className="v"><input type="date" className="date-input" value={task.follow_up_date ?? ''} onChange={setDate('follow_up_date')} aria-label="Follow-up date" /></span>

        <span className="k">Follow up with</span>
        <span className="v"><input className="input bare" placeholder="Person to chase" {...followWith} style={{ height: 28 }} /></span>

        <span className="k">Remind me</span>
        <span className="v">
          <input
            type="datetime-local" className="date-input" aria-label="Reminder"
            value={task.remind_at ? toLocalInput(task.remind_at) : ''}
            onChange={(e) => act.updateTask(task.id, { remind_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </span>
      </div>

      {/* Subtasks */}
      <div className="section">
        <div className="section-h">
          Subtasks {task.subtasks.length > 0 && <span className="mono">{subsDone}/{task.subtasks.length}</span>}
        </div>
        {task.subtasks.length > 0 && <div className="progress"><div style={{ width: `${(subsDone / task.subtasks.length) * 100}%` }} /></div>}
        {task.subtasks.map((s) => (
          <div className="sub-row" key={s.id}>
            <label className="check"><input type="checkbox" checked={s.done} onChange={() => update('subtasks', { id: s.id }, { done: !s.done })} /><span className="sr-only">Done</span></label>
            <SubtaskTitle id={s.id} title={s.title} done={s.done} />
            <button className="btn ghost icon sm" aria-label="Remove subtask" onClick={() => remove('subtasks', { id: s.id })}><IconX size={13} /></button>
          </div>
        ))}
        <div className="sub-row">
          <IconPlus size={14} style={{ color: 'var(--icon)' }} />
          <input
            className="input bare" placeholder="Add a subtask and press Enter" value={newSub} style={{ height: 28 }}
            onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub(); }}
          />
        </div>
      </div>

      {/* Blockers */}
      <div className="section">
        <div className="section-h">
          Blocked by
          <button className="btn ghost sm r" onClick={blockM.open}><IconBlock size={13} /> Add</button>
        </div>
        {blockers.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Not waiting on any other task.</span>}
        {blockers.map((b) => (
          <div className="sub-row" key={b.id}>
            <StatusIcon status={b.status} />
            <button className="vbtn grow" onClick={() => open(b.id)}><span className="ellipsis">#{b.number} {b.title}</span></button>
            <button className="btn ghost icon sm" aria-label="Remove blocker" onClick={() => remove('task_blockers', { task_id: task.id, blocked_by: b.id })}><IconX size={13} /></button>
          </div>
        ))}
        {blocking.length > 0 && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            This task blocks: {blocking.map((b, i) => (
              <span key={b.id}>{i > 0 && ', '}<button className="vbtn" style={{ margin: 0, padding: '0 3px', minHeight: 0 }} onClick={() => open(b.id)}>#{b.number}</button></span>
            ))}
          </span>
        )}
      </div>

      {/* Notes */}
      <div className="section">
        <div className="section-h">Notes</div>
        <textarea className="textarea" placeholder="Write anything…" {...notes} rows={4} />
      </div>

      {/* Attachments */}
      <div className="section">
        <div className="section-h">
          PDFs
          <button className="btn ghost sm r" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <IconPaperclip size={13} /> {uploading ? 'Uploading…' : 'Attach PDF'}
          </button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={onFiles} />
        </div>
        {attachments.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No files. PDFs up to 10 MB.</span>}
        {attachments.map((a) => (
          <div className="file" key={a.id}>
            <span className="fi">PDF</span>
            <button className="vbtn grow" style={{ margin: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 0 }} onClick={() => act.openAttachment(a.path).catch((e) => toast.error(e.message))}>
              <span className="ellipsis" style={{ maxWidth: '100%' }}>{a.name}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{formatBytes(a.size)} · {firstName(personById.get(a.uploaded_by ?? ''))} · {timeAgo(a.created_at)}</span>
            </button>
            <button className="btn ghost icon sm" aria-label="Download" onClick={() => act.openAttachment(a.path, true).catch((e) => toast.error(e.message))}><IconDownload size={14} /></button>
            <button className="btn ghost icon sm" aria-label="Delete file" onClick={() => { if (confirm(`Delete ${a.name}?`)) act.deleteAttachment(a.id, a.path); }}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>

      {linkedMeetings.length > 0 && (
        <div className="section">
          <div className="section-h">Meetings</div>
          {linkedMeetings.map((m) => (
            <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>{m.title} · {fmtDay(m.starts_at.slice(0, 10))}</Link>
          ))}
        </div>
      )}

      <div className="section muted" style={{ fontSize: 12 }}>
        <span>Last updated by {firstName(personById.get(task.updated_by ?? ''))}, {timeAgo(task.updated_at)}</span>
        {task.completed_at && <span>Completed {timeAgo(task.completed_at)}</span>}
      </div>

      {/* Menus */}
      {statusM.anchor && <SelectMenu<Status> anchor={statusM.anchor} onClose={statusM.close} value={task.status}
        options={STATUSES.map((s) => ({ value: s, label: s, icon: <StatusIcon status={s} /> }))}
        onPick={(s) => act.updateTask(task.id, { status: s })} />}
      {prioM.anchor && <SelectMenu<Priority> anchor={prioM.anchor} onClose={prioM.close} value={task.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: p, icon: <PriorityIcon priority={p} /> }))}
        onPick={(p) => act.updateTask(task.id, { priority: p })} />}
      {peopleM.anchor && <SelectMenu anchor={peopleM.anchor} onClose={peopleM.close} multi search value={task.assignees}
        options={people.map((p) => ({ value: p.id, label: p.id === meId ? `${p.full_name || p.email} (you)` : p.full_name || p.email, icon: <Avatar person={p} /> }))}
        onPick={(id) => act.toggleAssignee(task.id, id)} />}
      {givenM.anchor && <SelectMenu<GivenBy | ''> anchor={givenM.anchor} onClose={givenM.close} value={task.given_by ?? ''}
        options={[...GIVEN_BY.map((g) => ({ value: g as GivenBy | '', label: g })), { value: '', label: 'Empty' }]}
        onPick={(g) => act.updateTask(task.id, { given_by: g || null })} />}
      {catM.anchor && <SelectMenu<Category | ''> anchor={catM.anchor} onClose={catM.close} value={task.category ?? ''}
        options={[...CATEGORIES.map((c) => ({ value: c as Category | '', label: c })), { value: '', label: 'Empty' }]}
        onPick={(c) => act.updateTask(task.id, { category: c || null })} />}
      {tagM.anchor && <SelectMenu anchor={tagM.anchor} onClose={tagM.close} multi search value={task.tags}
        options={db.tags.map((t) => ({ value: t.id, label: t.name, icon: tagDot(t.color) }))}
        onPick={(id) => act.toggleTag(task.id, id)}
        footer={
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, padding: 4 }}>
            <input className="input" style={{ height: 28 }} placeholder="New tag + Enter" value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={async (e) => { if (e.key === 'Enter' && newTag.trim()) { await act.addTagByName(task.id, newTag); setNewTag(''); } }} />
          </div>
        } />}
      {blockM.anchor && <SelectMenu anchor={blockM.anchor} onClose={blockM.close} search value={task.blockedBy}
        options={tasks.filter((t) => t.id !== task.id && t.status !== 'Done').map((t) => ({ value: t.id, label: `#${t.number} ${t.title}` }))}
        onPick={(id) => {
          if (task.blockedBy.includes(id)) remove('task_blockers', { task_id: task.id, blocked_by: id });
          else insert('task_blockers', { task_id: task.id, blocked_by: id });
        }} />}
    </>
  );
}

function SubtaskTitle({ id, title, done }: { id: string; title: string; done: boolean }) {
  const { update } = useData();
  const d = useDraft(title, (v) => v.trim() && update('subtasks', { id }, { title: v.trim() }));
  return (
    <input className="input bare" {...d} style={{ height: 28, textDecoration: done ? 'line-through' : undefined, color: done ? 'var(--text-3)' : undefined }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Subtask" />
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
