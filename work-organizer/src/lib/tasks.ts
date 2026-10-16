import { addDays, addMonths, diffDays, endOfMonth, isPast, startOfMonth, startOfWeek, today } from './dates';
import type { Priority, Status, Task } from './types';

export const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
export const STATUS_RANK: Record<Status, number> = { 'In progress': 0, 'To do': 1, 'Waiting on someone': 2, Done: 3 };

/**
 * Urgency score: higher = deal with it sooner.
 * Combines priority with how close (or how late) the deadline / do date is.
 */
export function urgencyScore(t: Omit<Task, 'urgency'>): number {
  if (t.status === 'Done') return -1000;
  const now = today();
  let s = { High: 30, Medium: 18, Low: 8 }[t.priority];
  const dateScore = (d: string | null, weight: number) => {
    if (!d) return 0;
    const n = diffDays(now, d);
    if (n < 0) return weight * (40 + Math.min(-n, 14) * 2);
    if (n === 0) return weight * (d === t.deadline && isPast(t.deadline, t.deadline_time) ? 40 : 32);
    if (n === 1) return weight * 22;
    if (n <= 3) return weight * 14;
    if (n <= 7) return weight * 7;
    if (n <= 14) return weight * 3;
    return 0;
  };
  s += Math.max(dateScore(t.deadline, 1), dateScore(t.do_date, 0.6));
  if (t.follow_up_date && diffDays(now, t.follow_up_date) <= 0) s += 10;
  if (t.status === 'In progress') s += 4;
  if (t.status === 'Waiting on someone') s -= 6;
  if (t.blocked) s -= 15;
  return Math.round(s);
}

export function isOverdue(t: Pick<Task, 'status' | 'deadline' | 'deadline_time'>): boolean {
  return t.status !== 'Done' && isPast(t.deadline, t.deadline_time);
}

export const TIME_FIELD = { deadline: 'deadline_time', do_date: 'do_time', follow_up_date: 'follow_up_time' } as const;

/** Eisenhower: urgent = due within 2 days or overdue; important = High priority. */
export function quadrant(t: Task): 'do' | 'plan' | 'delegate' | 'drop' {
  const urgent = !!t.deadline && diffDays(today(), t.deadline) <= 2;
  const important = t.priority === 'High';
  if (urgent && important) return 'do';
  if (important) return 'plan';
  if (urgent) return 'delegate';
  return 'drop';
}

// ───────────────────────────── Filters ─────────────────────────────

export type DateField = 'deadline' | 'do_date' | 'follow_up_date';
export type DateRange =
  | 'any' | 'today' | 'tomorrow' | 'this_week' | 'next7' | 'next_week' | 'this_month'
  | 'next_month' | 'overdue' | 'none' | 'custom';
export type SortKey = 'urgency' | 'priority' | 'deadline' | 'do_date' | 'follow_up_date' | 'created' | 'updated' | 'completed' | 'title';
export type GroupKey = 'none' | 'status' | 'priority' | 'person' | 'category' | 'tag';

export interface Filters {
  dateField: DateField;
  range: DateRange;
  from: string;
  to: string;
  person: string; // 'any' | 'me' | 'none' | user id
  priority: string; // 'any' | Priority
  category: string;
  tag: string; // 'any' | tag id
  status: string; // 'open' | 'all' | Status
  givenBy: string;
  q: string;
  sort: SortKey;
  group: GroupKey;
}

export const DEFAULT_FILTERS: Filters = {
  dateField: 'deadline', range: 'any', from: '', to: '', person: 'any', priority: 'any',
  category: 'any', tag: 'any', status: 'open', givenBy: 'any', q: '', sort: 'urgency', group: 'none',
};

export const RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any date', today: 'Today', tomorrow: 'Tomorrow', this_week: 'This week', next7: 'Next 7 days',
  next_week: 'Next week', this_month: 'This month', next_month: 'Next month', overdue: 'Before today',
  none: 'No date', custom: 'Custom…',
};

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  deadline: 'Deadline', do_date: 'Do date', follow_up_date: 'Follow-up',
};

export const SORT_LABELS: Record<SortKey, string> = {
  urgency: 'Urgency', priority: 'Priority', deadline: 'Deadline', do_date: 'Do date',
  follow_up_date: 'Follow-up date', created: 'Newest created', updated: 'Recently updated',
  completed: 'Recently completed', title: 'Title A–Z',
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: 'No grouping', status: 'Status', priority: 'Priority', person: 'Person', category: 'Category', tag: 'Tag',
};

/** [from, to] inclusive for a range, or null for "any". */
export function rangeBounds(range: DateRange, from: string, to: string): [string | null, string | null] | null {
  const t = today();
  switch (range) {
    case 'today': return [t, t];
    case 'tomorrow': return [addDays(t, 1), addDays(t, 1)];
    case 'this_week': { const s = startOfWeek(t); return [s, addDays(s, 6)]; }
    case 'next7': return [t, addDays(t, 6)];
    case 'next_week': { const s = addDays(startOfWeek(t), 7); return [s, addDays(s, 6)]; }
    case 'this_month': return [startOfMonth(t), endOfMonth(t)];
    case 'next_month': { const s = addMonths(t, 1); return [s, endOfMonth(s)]; }
    case 'overdue': return [null, addDays(t, -1)];
    case 'custom': return [from || null, to || null];
    default: return null;
  }
}

export function applyFilters(tasks: Task[], f: Filters, me: string): Task[] {
  const bounds = f.range === 'none' ? null : rangeBounds(f.range, f.from, f.to);
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.status === 'open' && t.status === 'Done') return false;
    if (f.status !== 'open' && f.status !== 'all' && t.status !== f.status) return false;
    if (f.priority !== 'any' && t.priority !== f.priority) return false;
    if (f.category !== 'any' && t.category !== f.category) return false;
    if (f.givenBy !== 'any' && t.given_by !== f.givenBy) return false;
    if (f.tag !== 'any' && !t.tags.includes(f.tag)) return false;
    if (f.person === 'me' && !t.assignees.includes(me)) return false;
    if (f.person === 'none' && t.assignees.length > 0) return false;
    if (!['any', 'me', 'none'].includes(f.person) && !t.assignees.includes(f.person)) return false;
    const d = t[f.dateField];
    if (f.range === 'none' && d) return false;
    if (bounds) {
      if (!d) return false;
      if (bounds[0] && d < bounds[0]) return false;
      if (bounds[1] && d > bounds[1]) return false;
    }
    if (q && !(`${t.title} ${t.notes} ${t.follow_up_with ?? ''} #${t.number}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

const cmpDate = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
};

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const list = [...tasks];
  list.sort((a, b) => {
    switch (key) {
      case 'urgency': return b.urgency - a.urgency || cmpDate(a.deadline, b.deadline);
      case 'priority': return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || cmpDate(a.deadline, b.deadline);
      case 'deadline': return cmpDate(a.deadline, b.deadline) || cmpDate(a.deadline_time, b.deadline_time) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case 'do_date': return cmpDate(a.do_date, b.do_date) || cmpDate(a.do_time, b.do_time);
      case 'follow_up_date': return cmpDate(a.follow_up_date, b.follow_up_date) || cmpDate(a.follow_up_time, b.follow_up_time);
      case 'created': return b.created_at.localeCompare(a.created_at);
      case 'updated': return b.updated_at.localeCompare(a.updated_at);
      case 'completed': return (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
      case 'title': return a.title.localeCompare(b.title);
    }
  });
  return list;
}

// ───────────────────────────── Saved views ─────────────────────────────

export interface ViewDef {
  id: string;
  name: string;
  /** Fixed condition that the filter bar can't remove (e.g. "do date OR deadline is today"). */
  base?: (t: Task, me: string) => boolean;
  defaults: Partial<Filters>;
  hint: string;
}

export const VIEWS: ViewDef[] = [
  {
    id: 'today', name: 'Today', hint: 'Your tasks with a do date or deadline today — switch Person to see others',
    base: (t) => t.do_date === today() || t.deadline === today(),
    defaults: { sort: 'deadline', person: 'me' },
  },
  {
    id: 'overdue', name: 'Overdue', hint: 'Your tasks whose deadline has passed',
    base: (t) => isOverdue(t),
    defaults: { sort: 'deadline', person: 'me' },
  },
  {
    id: 'week', name: 'This week', hint: 'Your deadlines in the next 7 days — change the range to anything',
    defaults: { range: 'next7', sort: 'deadline', person: 'me' },
  },
  {
    id: 'followups', name: 'Follow-ups', hint: 'Your tasks with someone to chase',
    base: (t) => !!t.follow_up_date,
    defaults: { sort: 'follow_up_date', person: 'me' },
  },
  {
    id: 'assign', name: 'To assign', hint: 'From your manager, nobody assigned yet',
    defaults: { givenBy: 'Manager', person: 'none', sort: 'deadline' },
  },
  {
    id: 'mine', name: 'My tasks', hint: 'Everything assigned to you',
    defaults: { person: 'me' },
  },
  {
    id: 'done', name: 'Done', hint: 'What you finished, newest first',
    defaults: { status: 'Done', sort: 'completed', person: 'me' },
  },
  {
    id: 'all', name: 'All tasks', hint: 'Everyone’s tasks, open and done',
    defaults: { status: 'all', sort: 'updated' },
  },
];

export const viewById = (id: string) => VIEWS.find((v) => v.id === id) ?? VIEWS[VIEWS.length - 1];

export function viewFilters(v: ViewDef): Filters {
  return { ...DEFAULT_FILTERS, ...v.defaults };
}

export function runView(tasks: Task[], v: ViewDef, f: Filters, me: string): Task[] {
  const base = v.base ? tasks.filter((t) => v.base!(t, me)) : tasks;
  return sortTasks(applyFilters(base, f, me), f.sort);
}
