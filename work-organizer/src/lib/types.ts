export const STATUSES = ['To do', 'In progress', 'Waiting on someone', 'Done'] as const;
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const GIVEN_BY = ['Manager', 'Me', 'Client', 'Other team'] as const;
export const CATEGORIES = ['Admin', 'Reporting', 'Partner', 'Meeting', 'Learning', 'Other'] as const;
export const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export const PERSON_COLORS = ['#2F5FD0', '#0F766E', '#9A3412', '#7C3AED', '#BE185D', '#4D7C0F', '#0369A1', '#A16207'];

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
}

export type TableName = keyof Tables;
