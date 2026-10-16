import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, firstName } from '../components/Atoms';
import { IconPlus, IconTrash, IconUsers } from '../components/Icons';
import { useToast } from '../components/Toast';
import { fmtTime, hhmm, nowTime, today } from '../lib/dates';
import { atToday, claimRun, daysLabel, finishRun, happensOn, isEveryDay, isWeekdays, releaseRun, runOf, visibleTo, WEEKDAYS } from '../lib/routines';
import type { Routine } from '../lib/types';
import { useData } from '../store/data';

/** Today's state of one reminder, with the pick-up / done buttons. */
export function RoutineToday({ r, compact }: { r: Routine; compact?: boolean }) {
  const { db, meId, personById, reload } = useData();
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

  return (
    <div className="trow" style={{ cursor: 'default', gap: 10, padding: compact ? '6px 4px' : '8px 14px' }}>
      <span className="mono" style={{ width: 44, fontSize: 12.5, color: upcoming ? 'var(--text-3)' : 'var(--text)' }}>{time}</span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className={`title ${run?.done_by ? 'done' : ''}`} style={{ display: 'block' }}>{r.title}</span>
        <span className="meta" style={{ width: 'auto' }}>
          {r.scope === 'team' ? 'Team' : 'Just me'}
          {doneBy ? ` · done by ${doneBy.id === meId ? 'you' : firstName(doneBy)} at ${fmtTime(run!.done_at!)}`
            : claimedBy ? ` · ${claimedBy.id === meId ? 'you are' : `${firstName(claimedBy)} is`} on it since ${fmtTime(run!.claimed_at!)}`
              : upcoming ? '' : ' · not picked up yet'}
        </span>
      </span>
      {claimedBy && !doneBy && <Avatar person={claimedBy} />}
      {doneBy ? (
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

interface Draft { id?: string; title: string; at_time: string; days: number[]; scope: 'personal' | 'team'; notes: string }
const blank: Draft = { title: '', at_time: '09:00', days: [1, 2, 3, 4, 5], scope: 'personal', notes: '' };

function Editor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { insert, update, meId } = useData();
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
      const row = { title: d.title.trim(), at_time: d.at_time, days: d.days, scope: d.scope, notes: d.notes };
      if (d.id) await update('routines', { id: d.id }, row);
      else await insert('routines', { ...row, owner_id: meId });
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
      <label className="field">Notes (optional)<textarea className="textarea" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></label>
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || (!dirty && !!d.id)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function RoutinesPage() {
  const { db, meId, personById, update, remove } = useData();
  const [editing, setEditing] = useState<Draft | null>(null);
  const mine = visibleTo(db.routines, meId).sort((a, b) => a.at_time.localeCompare(b.at_time));
  const todays = mine.filter((r) => happensOn(r, today())).sort((a, b) => atToday(a) - atToday(b));

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1>Reminders</h1>
        <span className="sub">Repeating alarms — yours and the team’s</span>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing(blank)}><IconPlus size={14} /> New reminder</button>
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
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="title" style={{ display: 'block' }}>{r.title}</span>
                <span className="meta" style={{ width: 'auto' }}>
                  {daysLabel(r.days)} · {r.scope === 'team' ? 'Whole team' : 'Just me'}
                  {r.scope === 'team' && r.created_by && ` · set up by ${r.created_by === meId ? 'you' : firstName(personById.get(r.created_by))}`}
                  {!r.active && ' · paused'}
                </span>
              </span>
              <button className="btn ghost sm" onClick={() => setEditing({ id: r.id, title: r.title, at_time: hhmm(r.at_time), days: r.days, scope: r.scope, notes: r.notes })}>Edit</button>
              <button className="btn ghost sm" onClick={() => update('routines', { id: r.id }, { active: !r.active })}>{r.active ? 'Pause' : 'Resume'}</button>
              <button className="btn ghost sm icon" aria-label="Delete reminder" onClick={() => { if (confirm(`Delete “${r.title}”?`)) remove('routines', { id: r.id }); }}><IconTrash size={14} /></button>
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
