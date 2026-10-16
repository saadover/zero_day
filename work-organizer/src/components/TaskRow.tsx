import type { MouseEvent, ReactNode } from 'react';
import { dueLabel } from '../lib/dates';
import { isOverdue, TIME_FIELD } from '../lib/tasks';
import type { Status, Task } from '../lib/types';
import { STATUSES } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { useOpenTask } from '../store/ui';
import { Avatars, TagChip } from './Atoms';
import { useToast } from './Toast';
import { PriorityIcon, StatusIcon } from './Icons';
import { SelectMenu, useAnchor } from './Popover';

export function StatusButton({ task }: { task: Task }) {
  const { updateTask } = useActions();
  const toast = useToast();
  const menu = useAnchor();
  return (
    <>
      <button
        className="status-btn" aria-label={`Status: ${task.status}. Change status`}
        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); menu.open(e); }}
      >
        <StatusIcon status={task.status} />
      </button>
      {menu.anchor && (
        <SelectMenu<Status>
          anchor={menu.anchor} onClose={menu.close} value={task.status}
          options={STATUSES.map((s) => ({ value: s, label: s, icon: <StatusIcon status={s} /> }))}
          onPick={(s) => {
            if (s === task.status) return;
            const before = task.status;
            updateTask(task.id, { status: s });
            toast.show(`#${task.number} → ${s}`, { label: 'Undo', run: () => updateTask(task.id, { status: before }) });
          }}
        />
      )}
    </>
  );
}

export function TaskRow({ task, showCategory = true, dateField = 'deadline', right, compact }: {
  task: Task; showCategory?: boolean; compact?: boolean; dateField?: 'deadline' | 'do_date' | 'follow_up_date'; right?: ReactNode;
}) {
  const { personById, db } = useData();
  const { openId, open } = useOpenTask();
  const d = dueLabel(task[dateField], task.status === 'Done', task[TIME_FIELD[dateField]]);
  const tagList = task.tags.map((id) => db.tags.find((t) => t.id === id)).filter(Boolean).slice(0, 2);
  const subsDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div
      className={`trow ${compact ? 'compact' : ''} ${openId === task.id ? 'sel' : ''}`} role="button" tabIndex={0}
      onClick={() => open(task.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(task.id); }}
    >
      <StatusButton task={task} />
      <PriorityIcon priority={task.priority} />
      <span className="num">#{task.number}</span>
      <span className={`title ${task.status === 'Done' ? 'done' : ''}`}>{task.title}</span>
      {task.blocked && <span className="badge-block">BLOCKED</span>}
      {isOverdue(task) && <span className="badge-late">OVERDUE</span>}
      {task.subtasks.length > 0 && <span className="subs">{subsDone}/{task.subtasks.length}</span>}
      <span className="tags" style={{ display: 'inline-flex', gap: 4 }}>
        {tagList.map((t) => <TagChip key={t!.id} tag={t!} />)}
      </span>
      {showCategory && task.category && <span className="meta">{task.category}</span>}
      {right}
      <span className={`due ${d.tone}`}>{d.text}</span>
      <span className="people"><Avatars ids={task.assignees} byId={personById} /></span>
    </div>
  );
}
