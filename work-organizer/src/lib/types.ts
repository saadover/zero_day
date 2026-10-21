export const STATUSES = ['To do', 'In progress', 'Waiting on someone', 'Done'] as const;
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const GIVEN_BY = ['Manager', 'Me', 'Client', 'Other team'] as const;
export const CATEGORIES = ['Admin', 'Reporting', 'Partner', 'Meeting', 'Learning', 'Other'] as const;
export const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export const PERSON_COLORS = ['#2F5FD0', '#0F766E', '#9A3412', '#7C3AED', '#BE185D', '#4D7C0F', '#0369A1', '#A16207'];

export type Role = 'admin' | 'user' | 'basic' | 'visitor';
export const ROLES: Role[] = ['admin', 'user', 'basic', 'visitor'];
export const ROLE_INFO: Record<Role, { label: string; hint: string }> = {
  admin: { label: 'Admin', hint: 'Can do everything, including managing people and permissions' },
  user: { label: 'User', hint: 'Full team member' },
  basic: { label: 'Basic', hint: 'Day-to-day work; processes are view-only by default' },
  visitor: { label: 'Visitor', hint: 'Sees everything, changes nothing by default' },
};

export type Perm =
  | 'task_create' | 'task_edit' | 'task_status' | 'task_delete' | 'files_upload'
  | 'checklist_tick' | 'checklist_manage' | 'meeting_edit' | 'routine_do' | 'routine_manage'
  | 'process_edit' | 'tags_manage' | 'export';
export const PERMS: { group: string; items: { id: Perm; label: string; hint?: string }[] }[] = [
  { group: 'Tasks', items: [
    { id: 'task_create', label: 'Create tasks' },
    { id: 'task_edit', label: 'Edit tasks', hint: 'Title, dates, priority, people, tags, sub-tasks, notes' },
    { id: 'task_status', label: 'Change status & tick sub-tasks', hint: 'Move tasks along without editing them' },
    { id: 'task_delete', label: 'Delete tasks' },
    { id: 'files_upload', label: 'Upload & remove files', hint: 'PDFs and images on tasks and meetings' },
  ] },
  { group: 'Daily checklist', items: [
    { id: 'checklist_tick', label: 'Tick items' },
    { id: 'checklist_manage', label: 'Add, rename & remove items' },
  ] },
  { group: 'Meetings', items: [{ id: 'meeting_edit', label: 'Create, edit & delete meetings' }] },
  { group: 'Reminders', items: [
    { id: 'routine_do', label: "Pick up reminders (“I'm on it”) & mark done" },
    { id: 'routine_manage', label: 'Create, edit & delete repeating reminders' },
  ] },
  { group: 'Processes', items: [{ id: 'process_edit', label: 'Create, edit & delete processes' }] },
  { group: 'Other', items: [
    { id: 'tags_manage', label: 'Rename, recolour & delete tags' },
    { id: 'export', label: 'Export (PDF, Excel, images)' },
  ] },
];
export interface RolePermission { role: Exclude<Role, 'admin'>; perm: Perm; allowed: boolean }

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type GivenBy = (typeof GIVEN_BY)[number];
export type Category = (typeof CATEGORIES)[number];
export type TagColor = (typeof TAG_COLORS)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  color: string;
  must_change_password: boolean;
  notify_email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  digest_enabled: boolean;
  digest_time: string;
  remind_due_tomorrow: boolean;
  remind_due_today: boolean;
  remind_due_soon: boolean;
  remind_start: boolean;
  alarm_email: boolean;
  remind_overdue: boolean;
  remind_followups: boolean;
  remind_assigned: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  quiet_weekends: boolean;
  timezone: string;
  theme: 'system' | 'light' | 'dark';
  role?: Role;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
}

export interface TaskRow {
  id: string;
  number: number;
  title: string;
  status: Status;
  given_by: GivenBy | null;
  priority: Priority;
  category: Category | null;
  do_date: string | null;
  do_time: string | null;
  deadline: string | null;
  deadline_time: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  follow_up_with: string | null;
  start_alerts: number[];
  deadline_alerts: number[];
  notes: string;
  remind_at: string | null;
  position: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A task joined with its assignees, tags, subtasks and blockers. */
export interface Task extends TaskRow {
  assignees: string[];
  tags: string[];
  subtasks: Subtask[];
  blockedBy: string[];
  blocked: boolean;
  urgency: number;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  attendees: string;
  agenda: string;
  notes: string;
  decisions: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingAction {
  id: string;
  meeting_id: string;
  text: string;
  task_id: string | null;
  position: number;
}

export interface Attachment {
  id: string;
  task_id: string | null;
  meeting_id: string | null;
  name: string;
  size: number;
  path: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  scope: 'team' | 'personal';
  owner_id: string | null;
  position: number;
  active: boolean;
  only_day: string | null;
}

export interface ChecklistCheck {
  item_id: string;
  day: string;
  user_id: string | null;
  checked_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  task_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface Routine {
  id: string;
  title: string;
  notes: string;
  at_time: string;
  days: number[];
  scope: 'personal' | 'team';
  owner_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface RoutineRun {
  routine_id: string;
  day: string;
  claimed_by: string | null;
  claimed_at: string | null;
  done_by: string | null;
  done_at: string | null;
}

export interface Process {
  id: string;
  title: string;
  outline: string;
  scene: { elements?: unknown[]; appState?: Record<string, unknown> } | null;
  view: 'bullets' | 'tree' | 'mindmap' | 'canvas';
  visibility: 'team' | 'private';
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tables {
  profiles: Profile;
  tags: Tag;
  tasks: TaskRow;
  task_assignees: { task_id: string; user_id: string };
  task_tags: { task_id: string; tag_id: string };
  subtasks: Subtask;
  task_blockers: { task_id: string; blocked_by: string };
  meetings: Meeting;
  meeting_actions: MeetingAction;
  meeting_tasks: { meeting_id: string; task_id: string };
  attachments: Attachment;
  checklist_items: ChecklistItem;
  checklist_checks: ChecklistCheck;
  notifications: AppNotification;
  routines: Routine;
  routine_runs: RoutineRun;
  processes: Process;
  role_permissions: RolePermission;
}

export type TableName = keyof Tables;
