// One day's checklist: the list's own items + that day's repeating reminders + tasks dated that day.
// Ticking a reminder marks it done; ticking a task marks it Done — everything stays in sync.
import { hhmm } from './dates';
import { happensOn, runOf, visibleTo } from './routines';
import type { ChecklistCheck, ChecklistItem, Routine, RoutineRun, Task } from './types';

export interface DayEntry {
  key: string;
  kind: 'item' | 'routine' | 'task';
  label: string;
  scope: 'team' | 'personal';
  done: boolean;
  by: string | null;
  at: string | null;
  /** hh:mm for reminders and timed tasks */
  time?: string;
  /** what links a task to this day */
  why?: 'deadline' | 'planned';
  item?: ChecklistItem;
  routine?: Routine;
  task?: Task;
}

interface Src {
  checklist_items: ChecklistItem[];
  checklist_checks: ChecklistCheck[];
  routines: Routine[];
  routine_runs: RoutineRun[];
}

/** Tasks that belong on my checklist: mine, or nobody's that I created / the team's. */
const forMe = (t: Task, meId: string) => t.assignees.includes(meId) || !t.assignees.length;

export function dayEntries(db: Src, tasks: Task[], meId: string, day: string): DayEntry[] {
  const checks = new Map(db.checklist_checks.filter((c) => c.day === day).map((c) => [c.item_id, c]));
  const items: DayEntry[] = db.checklist_items
    .filter((i) => i.active && (i.scope === 'team' || i.owner_id === meId) && (!i.only_day || i.only_day === day))
    .sort((a, b) => (a.only_day ? 1 : 0) - (b.only_day ? 1 : 0) || a.position - b.position)
    .map((i) => {
      const c = checks.get(i.id);
      return { key: `i:${i.id}`, kind: 'item', label: i.label, scope: i.scope, done: !!c, by: c?.user_id ?? null, at: c?.checked_at ?? null, item: i };
    });

  const routines: DayEntry[] = visibleTo(db.routines, meId)
    .filter((r) => happensOn(r, day))
    .sort((a, b) => a.at_time.localeCompare(b.at_time))
    .map((r) => {
      const run = runOf(db.routine_runs, r.id, day);
      return {
        key: `r:${r.id}`, kind: 'routine', label: r.title, scope: r.scope, time: hhmm(r.at_time),
        done: !!run?.done_by, by: run?.done_by ?? run?.claimed_by ?? null, at: run?.done_at ?? run?.claimed_at ?? null, routine: r,
      };
    });

  const dated: DayEntry[] = tasks
    .filter((t) => (t.do_date === day || t.deadline === day) && forMe(t, meId))
    .map((t) => {
      const why = t.deadline === day ? 'deadline' : 'planned';
      const time = why === 'deadline' ? hhmm(t.deadline_time) : hhmm(t.do_time);
      return {
        key: `t:${t.id}`, kind: 'task', label: t.title, scope: t.assignees.length ? 'personal' : 'team', time: time || undefined, why,
        done: t.status === 'Done', by: t.status === 'Done' ? t.updated_by : null, at: t.completed_at, task: t,
      } as DayEntry;
    })
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));

  // Every-day items first, then reminders and tasks by time, then one-off items.
  const everyDay = items.filter((e) => !e.item!.only_day);
  const oneOff = items.filter((e) => e.item!.only_day);
  return [...everyDay, ...routines, ...dated, ...oneOff];
}
