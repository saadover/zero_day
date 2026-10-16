import { useMemo, useState } from 'react';
import { fmtDay } from '../lib/dates';
import { parseQuickAdd } from '../lib/quickadd';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask, useUi } from '../store/ui';
import { firstName } from './Atoms';
import { IconCalendar, IconFlag, PriorityIcon } from './Icons';
import { useToast } from './Toast';

export function QuickAdd() {
  const { quickAdd: defaults } = useUi();
  if (!defaults) return null;
  return <QuickAddModal key={JSON.stringify(defaults)} />;
}

function QuickAddModal() {
  const { quickAdd: defaults, closeQuickAdd } = useUi();
  const { people, meId, db, personById, insert } = useData();
  const { createTask } = useActions();
  const { open } = useOpenTask();
  const toast = useToast();
  const [text, setText] = useState(defaults?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);

  const parsed = useMemo(() => parseQuickAdd(text, people, meId, db.tags), [text, people, meId, db.tags]);

  const submit = async (openAfter: boolean) => {
    if (!parsed.title || busy) return;
    setBusy(true);
    try {
      const { assignees: defAssignees, meetingId, title: _t, ...defFields } = defaults ?? {};
      const row = await createTask({
        ...defFields,
        title: parsed.title,
        ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
        ...(parsed.doDate ? { do_date: parsed.doDate } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.category ? { category: parsed.category } : {}),
        ...(parsed.manager ? { given_by: 'Manager' as const } : {}),
      }, {
        assignees: parsed.assignees.length ? parsed.assignees : defAssignees ?? [],
        tagNames: parsed.tagNames,
      });
      if (meetingId) await insert('meeting_tasks', { meeting_id: meetingId, task_id: row.id });
      setText('');
      if (keepOpen && !openAfter) {
        toast.show(`Added #${row.number}`);
      } else {
        closeQuickAdd();
        if (openAfter) open(row.id);
        else toast.show(`Added “${row.title}”`, { label: 'Open', run: () => open(row.id) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) closeQuickAdd(); }}>
      <div className="modal" role="dialog" aria-label="New task">
        <input
          className="qa-input" autoFocus placeholder="Send budget to Karim fri !high #finance @lina"
          value={text} onChange={(e) => setText(e.target.value)} aria-label="Task"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeQuickAdd();
            if (e.key === 'Enter') { e.preventDefault(); submit(e.metaKey || e.ctrlKey); }
          }}
        />
        <div className="qa-chips">
          {parsed.deadline && <span className="qa-chip"><IconCalendar size={12} /> Deadline {fmtDay(parsed.deadline)}</span>}
          {parsed.doDate && <span className="qa-chip"><IconCalendar size={12} /> Do {fmtDay(parsed.doDate)}</span>}
          {parsed.priority && <span className="qa-chip"><PriorityIcon priority={parsed.priority} size={12} /> {parsed.priority}</span>}
          {parsed.category && <span className="qa-chip">{parsed.category}</span>}
          {parsed.manager && <span className="qa-chip"><IconFlag size={12} /> From manager</span>}
          {parsed.tagNames.map((t) => <span key={t} className="qa-chip">#{t}</span>)}
          {parsed.assignees.map((id) => <span key={id} className="qa-chip">@{firstName(personById.get(id))}</span>)}
          {!text && <span className="muted" style={{ fontSize: 12 }}>Type naturally — dates, !priority, #tags, @people and +manager are picked up.</span>}
        </div>
        <div className="qa-foot">
          <span><span className="kbd">↵</span> add</span>
          <span><span className="kbd">Ctrl ↵</span> add & open</span>
          <span><span className="kbd">do: mon</span> do date</span>
          <label className="check" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} /> Add several
          </label>
          <button className="btn primary sm" disabled={!parsed.title || busy} onClick={() => submit(false)}>Add task</button>
        </div>
      </div>
    </div>
  );
}
