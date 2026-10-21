import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Attachments } from '../components/Attachments';
import { Avatar, firstName } from '../components/Atoms';
import { IconChevronDown, IconPaperclip, IconPlus, IconTrash, IconUsers, IconX } from '../components/Icons';
import { useToast } from '../components/Toast';
import { fmtTime, hhmm, nowTime, today } from '../lib/dates';
import { atToday, claimRun, daysLabel, finishRun, happensOn, isEveryDay, isWeekdays, releaseRun, runOf, visibleTo, WEEKDAYS } from '../lib/routines';
import type { Routine } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';

/** A reminder's separate notes (older reminders have one note in `notes`). */
export const notesOf = (r: Routine): string[] => (r.note_list?.length ? r.note_list : r.notes ? [r.notes] : []);

/** "2 notes · 1 file" toggle + the notes and files underneath. */
function useDetails(r: Routine) {
  const { db } = useData();
  const [open, setOpen] = useState(false);
  const notes = notesOf(r);
  const files = db.attachments.filter((a) => a.routine_id === r.id);
  const parts = [notes.length && `${notes.length} note${notes.length > 1 ? 's' : ''}`, files.length && `${files.length} file${files.length > 1 ? 's' : ''}`].filter(Boolean);
  const toggle = parts.length ? (
    <button className="linkish rt-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
      {files.length > 0 && <IconPaperclip size={11} />}{parts.join(' · ')}
      <IconChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
    </button>
  ) : null;
  const body = open && parts.length ? (
    <div className="rt-details">
      {notes.map((n, i) => <div key={i} className="rt-note">{n}</div>)}
      {files.length > 0 && <Attachments saved={files} newFiles={[]} removed={[]} readOnly onAdd={() => undefined} onRemoveSaved={() => undefined} onRemoveNew={() => undefined} />}
    </div>
  ) : null;
  return { toggle, body };
}

/** Today's state of one reminder, with the pick-up / done buttons. */
export function RoutineToday({ r, compact }: { r: Routine; compact?: boolean }) {
  const { db, meId, personById, reload, can } = useData();
  const canDo = can('routine_do');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = runOf(db.routine_runs, r.id);
  const day = today();
  const time = hhmm(r.at_time);
  const upcoming = time > nowTime();
  const claimedBy = run?.claimed_by ? personById.get(run.claimed_by) : undefined;
  const doneBy = run?.done_by ? personById.get(run.done_by) : undefined;

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { await reload('routine_runs'); setBusy(false); } };
  const claim = () => act(async () => {
    const other = await claimRun(r.id, day, meId);
    if (other) toast.error(`${firstName(personById.get(other))} is already on it.`);
  });
  const details = useDetails(r);

  return (
    <div className="trow" style={{ cursor: 'default', gap: 10, padding: compact ? '6px 4px' : '8px 14px', alignItems: 'flex-start' }}>
      <span className="mono" style={{ width: 44, fontSize: 12.5, color: upcoming ? 'var(--text-3)' : 'var(--text)' }}>{time}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <span className={`title ${run?.done_by ? 'done' : ''}`} style={{ display: 'block' }}>{r.title}</span>
        <span className="meta" style={{ width: 'auto' }}>
          {r.scope === 'team' ? 'Team' : 'Just me'}
          {doneBy ? ` · done by ${doneBy.id === meId ? 'you' : firstName(doneBy)} at ${fmtTime(run!.done_at!)}`
            : claimedBy ? ` · ${claimedBy.id === meId ? 'you are' : `${firstName(claimedBy)} is`} on it since ${fmtTime(run!.claimed_at!)}`
              : upcoming ? '' : ' · not picked up yet'}
        </span>
        {!compact && details.toggle}
        {!compact && details.body}
      </div>
      {claimedBy && !doneBy && <Avatar person={claimedBy} />}
      {!canDo ? null : doneBy ? (
        <button className="btn ghost sm" disabled={busy} onClick={() => act(() => releaseRun(r.id, day))}>Undo</button>
      ) : r.scope === 'team' && !claimedBy ? (
        <button className="btn sm" disabled={busy} onClick={claim}>I'm on it</button>
      ) : claimedBy && claimedBy.id !== meId ? null : (
        <span style={{ display: 'flex', gap: 6 }}>
          {claimedBy?.id === meId && <button className="btn ghost sm" disabled={busy} onClick={() => act(() => releaseRun(r.id, day))}>Let go</button>}
          <button className="btn primary sm" disabled={busy} onClick={() => act(() => finishRun(r.id, day, meId))}>Done</button>
        </span>
      )}
    </div>
  );
}

interface Draft {
  id?: string; title: string; at_time: string; days: number[]; scope: 'personal' | 'team';
  notes: string[]; newFiles: File[]; removedFiles: string[];
}
const blank: Draft = { title: '', at_time: '09:00', days: [1, 2, 3, 4, 5], scope: 'personal', notes: [''], newFiles: [], removedFiles: [] };
const draftOf = (r: Routine): Draft => ({
  id: r.id, title: r.title, at_time: hhmm(r.at_time), days: r.days, scope: r.scope,
  notes: notesOf(r).length ? notesOf(r) : [''], newFiles: [], removedFiles: [],
});

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { db, insert, update, meId, can } = useData();
  const act = useActions();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const toggleDay = (n: number) => setD({ ...d, days: d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n].sort() });

  const save = async () => {
    if (!d.title.trim()) { toast.error('Give the reminder a name.'); return; }
    if (!d.days.length) { toast.error('Pick at least one day.'); return; }
    setBusy(true);
    try {
      const notes = d.notes.map((n) => n.trim()).filter(Boolean);
      const row = { title: d.title.trim(), at_time: d.at_time, days: d.days, scope: d.scope, note_list: notes, notes: notes.join('\n\n') };
      let id = d.id;
      if (id) await update('routines', { id }, row);
      else id = (await insert('routines', { ...row, owner_id: meId }))[0].id;
      for (const f of d.newFiles) {
        try { await act.uploadPdf(f, { routine_id: id }); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      }
      for (const fid of d.removedFiles) {
        const a = db.attachments.find((x) => x.id === fid);
        if (a) await act.deleteAttachment(a.id, a.path);
      }
      toast.show('Reminder saved');
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="card-box">
      <h2>{d.id ? 'Edit reminder' : 'New reminder'}</h2>
      <div className="grid-2">
        <label className="field">What<input className="input" autoFocus value={d.title} placeholder="Check the shared inbox" onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field">Time<input className="input" type="time" value={d.at_time} onChange={(e) => e.target.value && setD({ ...d, at_time: e.target.value })} /></label>
      </div>
      <div className="row-gap">
        <span className="muted" style={{ fontSize: 12.5, width: 60 }}>Days</span>
        {WEEKDAYS.map((w) => (
          <button key={w.n} className={`pill ${d.days.includes(w.n) ? 'set' : ''}`} aria-pressed={d.days.includes(w.n)} onClick={() => toggleDay(w.n)}>{w.short}</button>
        ))}
        <button className="btn ghost sm" onClick={() => setD({ ...d, days: [1, 2, 3, 4, 5] })} disabled={isWeekdays(d.days)}>Weekdays</button>
        <button className="btn ghost sm" onClick={() => setD({ ...d, days: [0, 1, 2, 3, 4, 5, 6] })} disabled={isEveryDay(d.days)}>Every day</button>
      </div>
      <div className="row-gap">
        <span className="muted" style={{ fontSize: 12.5, width: 60 }}>Who</span>
        <div className="seg">
          <button className={d.scope === 'personal' ? 'on' : ''} onClick={() => setD({ ...d, scope: 'personal' })}>Just me</button>
          <button className={d.scope === 'team' ? 'on' : ''} onClick={() => setD({ ...d, scope: 'team' })}><IconUsers size={13} /> Whole team</button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {d.scope === 'team' ? 'Everyone gets the alarm. The first to click “I’m on it” takes it — the others see who’s doing it, so it isn’t done twice.' : 'Only you get the alarm.'}
        </span>
      </div>
      <div className="field">
        <span>Notes <span className="muted">(optional — one box per note)</span></span>
        {d.notes.map((n, i) => (
          <div key={i} className="rt-note-edit">
            <span className="rt-note-n mono">{i + 1}</span>
            <textarea className="textarea" rows={2} value={n} placeholder={i === 0 ? 'e.g. Use the shared mailbox, not your own' : 'Another note'}
              autoFocus={i > 0 && i === d.notes.length - 1 && !n} aria-label={`Note ${i + 1}`}
              onChange={(e) => setD({ ...d, notes: d.notes.map((x, j) => (j === i ? e.target.value : x)) })} />
            {(d.notes.length > 1 || n) && (
              <button className="btn ghost icon sm" aria-label={`Remove note ${i + 1}`}
                onClick={() => setD({ ...d, notes: d.notes.length > 1 ? d.notes.filter((_, j) => j !== i) : [''] })}><IconX size={13} /></button>
            )}
          </div>
        ))}
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ ...d, notes: [...d.notes, ''] })}><IconPlus size={13} /> Add another note</button>
      </div>
      <Attachments
        saved={d.id ? db.attachments.filter((a) => a.routine_id === d.id) : []}
        newFiles={d.newFiles} removed={d.removedFiles}
        readOnly={!can('files_upload')}
        onAdd={(files) => setD((x) => ({ ...x, newFiles: [...x.newFiles, ...files] }))}
        onRemoveSaved={(fid) => setD((x) => ({ ...x, removedFiles: [...x.removedFiles, fid] }))}
        onRemoveNew={(i) => setD((x) => ({ ...x, newFiles: x.newFiles.filter((_, j) => j !== i) }))}
      />
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || (!dirty && !!d.id)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function RoutineInfo({ r, children }: { r: Routine; children: React.ReactNode }) {
  const details = useDetails(r);
  return <div className="grow" style={{ minWidth: 0 }}>{children}{details.toggle}{details.body}</div>;
}

export function RoutinesPage() {
  const { db, meId, personById, update, remove, can } = useData();
  const manage = can('routine_manage');
  const [editing, setEditing] = useState<Draft | null>(null);
  const mine = visibleTo(db.routines, meId).sort((a, b) => a.at_time.localeCompare(b.at_time));
  const todays = mine.filter((r) => happensOn(r, today())).sort((a, b) => atToday(a) - atToday(b));

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1>Reminders</h1>
        <span className="sub">Repeating alarms — yours and the team’s</span>
        <div className="actions">
          {manage && <button className="btn primary" onClick={() => setEditing(blank)}><IconPlus size={14} /> New reminder</button>}
        </div>
      </div>

      {editing && <div style={{ marginBottom: 20 }}><Editor key={editing.id ?? 'new'} initial={editing} onClose={() => setEditing(null)} /></div>}

      <section style={{ marginBottom: 28 }}>
        <div className="sec-h"><h2>Today</h2><span className="n">{todays.length}</span></div>
        <div className="list flat">
          {todays.map((r) => <RoutineToday key={r.id} r={r} />)}
          {todays.length === 0 && <div className="empty">Nothing repeating today.</div>}
        </div>
      </section>

      <section>
        <div className="sec-h"><h2>All reminders</h2><span className="n">{mine.length}</span></div>
        <div className="list flat">
          {mine.map((r) => (
            <div key={r.id} className="trow" style={{ cursor: 'default', opacity: r.active ? 1 : 0.55 }}>
              <span className="mono" style={{ width: 44, fontSize: 12.5 }}>{hhmm(r.at_time)}</span>
              <RoutineInfo r={r}>
                <span className="title" style={{ display: 'block' }}>{r.title}</span>
                <span className="meta" style={{ width: 'auto' }}>
                  {daysLabel(r.days)} · {r.scope === 'team' ? 'Whole team' : 'Just me'}
                  {r.scope === 'team' && r.created_by && ` · set up by ${r.created_by === meId ? 'you' : firstName(personById.get(r.created_by))}`}
                  {!r.active && ' · paused'}
                </span>
              </RoutineInfo>
              {manage && <>
              <button className="btn ghost sm" onClick={() => setEditing(draftOf(r))}>Edit</button>
              <button className="btn ghost sm" onClick={() => update('routines', { id: r.id }, { active: !r.active })}>{r.active ? 'Pause' : 'Resume'}</button>
              <button className="btn ghost sm icon" aria-label="Delete reminder" onClick={() => { if (confirm(`Delete “${r.title}”?`)) remove('routines', { id: r.id }); }}><IconTrash size={14} /></button>
              </>}
            </div>
          ))}
          {mine.length === 0 && (
            <div className="empty">
              No reminders yet. Examples: “Check the shared inbox” at 09:00 on weekdays for the whole team,
              or “Fill in timesheet” on Fridays at 16:30 just for you.
            </div>
          )}
        </div>
      </section>
      <p className="view-hint" style={{ marginTop: 18 }}>
        Alarms pop up on your desktop while the app is open. Turn them on per device in <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}
