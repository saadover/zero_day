import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { urgencyScore } from '../lib/tasks';
import type { Profile, TableName, Tables, Task, TaskRow } from '../lib/types';
import { useToast } from '../components/Toast';

type DB = { [K in TableName]: Tables[K][] };

const TABLES: TableName[] = [
  'profiles', 'tags', 'tasks', 'task_assignees', 'task_tags', 'subtasks', 'task_blockers',
  'meetings', 'meeting_actions', 'meeting_tasks', 'attachments', 'checklist_items',
  'checklist_checks', 'notifications', 'routines', 'routine_runs', 'processes',
];

const KEYS: Record<TableName, string[]> = {
  profiles: ['id'], tags: ['id'], tasks: ['id'], task_assignees: ['task_id', 'user_id'],
  task_tags: ['task_id', 'tag_id'], subtasks: ['id'], task_blockers: ['task_id', 'blocked_by'],
  meetings: ['id'], meeting_actions: ['id'], meeting_tasks: ['meeting_id', 'task_id'], attachments: ['id'],
  checklist_items: ['id'], checklist_checks: ['item_id', 'day'], notifications: ['id'],
  routines: ['id'], routine_runs: ['routine_id', 'day'], processes: ['id'],
};

const emptyDB = (): DB => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;

type Row = Record<string, unknown>;
const keyOf = (table: TableName, row: Row) => KEYS[table].map((k) => String(row[k])).join('|');

function upsertRows<T extends Row>(table: TableName, list: T[], rows: T[]): T[] {
  const map = new Map(list.map((r) => [keyOf(table, r), r]));
  for (const r of rows) map.set(keyOf(table, r), { ...(map.get(keyOf(table, r)) ?? {}), ...r });
  return [...map.values()];
}

function removeRows<T extends Row>(list: T[], match: Row): T[] {
  return list.filter((r) => !Object.entries(match).every(([k, v]) => r[k] === v));
}

async function fetchAll(table: TableName): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    // A table from a newer upgrade that hasn't been run yet: treat as empty instead of failing.
    if (error && (error.code === 'PGRST205' || error.code === '42P01')) return [];
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface PresenceUser {
  userId: string;
  viewing: string | null;
}

interface DataCtx {
  ready: boolean;
  db: DB;
  me: Profile | null;
  meId: string;
  tasks: Task[];
  taskById: Map<string, Task>;
  people: Profile[];
  personById: Map<string, Profile>;
  online: PresenceUser[];
  setViewing: (taskId: string | null) => void;
  insert: <K extends TableName>(table: K, row: Partial<Tables[K]> | Partial<Tables[K]>[]) => Promise<Tables[K][]>;
  update: <K extends TableName>(table: K, match: Partial<Tables[K]>, patch: Partial<Tables[K]>) => Promise<void>;
  remove: <K extends TableName>(table: K, match: Partial<Tables[K]>) => Promise<void>;
  reload: (table?: TableName) => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ session, children }: { session: Session; children: ReactNode }) {
  const toast = useToast();
  const [db, setDb] = useState<DB>(emptyDB);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const presenceRef = useRef<RealtimeChannel | null>(null);
  const viewingRef = useRef<string | null>(null);
  const meId = session.user.id;

  const apply = useCallback((table: TableName, fn: (list: Row[]) => Row[]) => {
    setDb((prev) => ({ ...prev, [table]: fn(prev[table] as unknown as Row[]) }));
  }, []);

  const reload = useCallback(async (only?: TableName) => {
    const list = only ? [only] : TABLES;
    try {
      const results = await Promise.all(list.map(fetchAll));
      setDb((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        list.forEach((t, i) => { next[t] = results[i]; });
        return next as unknown as DB;
      });
    } catch (e) {
      toast.error(`Could not load data: ${(e as Error).message}`);
    }
  }, [toast]);

  // Initial load + live updates
  useEffect(() => {
    let alive = true;
    reload().then(() => alive && setReady(true));

    const channel = supabase.channel('db-changes');
    channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload.table as TableName;
      if (!TABLES.includes(table)) return;
      if (payload.eventType === 'DELETE') {
        const old = payload.old as Row;
        const match = Object.fromEntries(KEYS[table].map((k) => [k, old[k]]));
        apply(table, (l) => removeRows(l, match));
      } else {
        apply(table, (l) => upsertRows(table, l, [payload.new as Row]));
      }
    });
    channel.subscribe((status) => {
      // After a reconnect, refetch everything in case we missed events.
      if (status === 'SUBSCRIBED' && alive) reload();
    });

    const presence = supabase.channel('presence', { config: { presence: { key: meId } } });
    presence.on('presence', { event: 'sync' }, () => {
      const state = presence.presenceState<{ viewing: string | null }>();
      setOnline(Object.entries(state).map(([userId, metas]) => ({ userId, viewing: metas[metas.length - 1]?.viewing ?? null })));
    });
    presence.subscribe((status) => {
      if (status === 'SUBSCRIBED') presence.track({ viewing: viewingRef.current });
    });
    presenceRef.current = presence;

    // Refresh "today"-based numbers when the tab comes back after midnight etc.
    const onFocus = () => setDb((prev) => ({ ...prev }));
    window.addEventListener('focus', onFocus);

    return () => {
      alive = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(presence);
      window.removeEventListener('focus', onFocus);
    };
  }, [meId, reload, apply]);

  const setViewing = useCallback((taskId: string | null) => {
    if (viewingRef.current === taskId) return;
    viewingRef.current = taskId;
    presenceRef.current?.track({ viewing: taskId });
  }, []);

  const insert = useCallback(async <K extends TableName>(table: K, row: Partial<Tables[K]> | Partial<Tables[K]>[]) => {
    const { data, error } = await supabase.from(table).insert(row as never).select();
    if (error) { toast.error(error.message); throw error; }
    apply(table, (l) => upsertRows(table, l, data as Row[]));
    return data as Tables[K][];
  }, [apply, toast]);

  const update = useCallback(async <K extends TableName>(table: K, match: Partial<Tables[K]>, patch: Partial<Tables[K]>) => {
    // Optimistic: show the change at once, roll back by reloading on failure.
    apply(table, (l) => l.map((r) => (Object.entries(match).every(([k, v]) => r[k] === v) ? { ...r, ...patch } : r)));
    let q = supabase.from(table).update(patch as never);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
    const { data, error } = await q.select();
    if (error) { toast.error(error.message); await reload(table); return; }
    apply(table, (l) => upsertRows(table, l, data as Row[]));
  }, [apply, reload, toast]);

  const remove = useCallback(async <K extends TableName>(table: K, match: Partial<Tables[K]>) => {
    apply(table, (l) => removeRows(l, match as Row));
    let q = supabase.from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
    const { error } = await q;
    if (error) { toast.error(error.message); await reload(table); }
  }, [apply, reload, toast]);

  // Join tasks with their related rows
  const tasks = useMemo<Task[]>(() => {
    const by = <T extends Row>(list: T[], key: string) => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const k = String(r[key]);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      }
      return m;
    };
    const assignees = by(db.task_assignees as unknown as Row[], 'task_id');
    const tags = by(db.task_tags as unknown as Row[], 'task_id');
    const subs = by(db.subtasks as unknown as Row[], 'task_id');
    const blockers = by(db.task_blockers as unknown as Row[], 'task_id');
    const statusById = new Map(db.tasks.map((t) => [t.id, t.status]));
    return db.tasks.map((t: TaskRow) => {
      const blockedBy = (blockers.get(t.id) ?? []).map((b) => String(b.blocked_by));
      const base = {
        ...t,
        assignees: (assignees.get(t.id) ?? []).map((a) => String(a.user_id)),
        tags: (tags.get(t.id) ?? []).map((a) => String(a.tag_id)),
        subtasks: ((subs.get(t.id) ?? []) as unknown as Task['subtasks']).sort((a, b) => a.position - b.position),
        blockedBy,
        blocked: blockedBy.some((id) => statusById.get(id) && statusById.get(id) !== 'Done'),
      };
      return { ...base, urgency: urgencyScore(base) };
    });
  }, [db.tasks, db.task_assignees, db.task_tags, db.subtasks, db.task_blockers]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const people = useMemo(() => [...db.profiles].sort((a, b) => a.full_name.localeCompare(b.full_name)), [db.profiles]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const me = personById.get(meId) ?? null;

  const value: DataCtx = {
    ready, db, me, meId, tasks, taskById, people, personById, online, setViewing, insert, update, remove, reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData outside DataProvider');
  return c;
}
