import { hhmm, parseDate, today } from './dates';
import { supabase } from './supabase';
import type { Routine, RoutineRun } from './types';

export const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 0, short: 'Sun' },
];

export const isWeekdays = (days: number[]) => [...days].sort().join() === '1,2,3,4,5';
export const isEveryDay = (days: number[]) => days.length === 7;

export function daysLabel(days: number[]): string {
  if (isEveryDay(days)) return 'Every day';
  if (isWeekdays(days)) return 'Mon–Fri';
  if (!days.length) return 'Never';
  return WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.short).join(', ');
}

/** Does this reminder happen on the given day? */
export const happensOn = (r: Routine, day: string) => r.active && r.days.includes(parseDate(day).getDay());

/** The reminders this person sees: their own plus the team's. */
export const visibleTo = (list: Routine[], meId: string) => list.filter((r) => r.scope === 'team' || r.owner_id === meId);

export const runOf = (runs: RoutineRun[], id: string, day = today()) => runs.find((x) => x.routine_id === id && x.day === day);

export const atToday = (r: Routine, day = today()) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm(r.at_time).split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
};

/**
 * "I'm on it" — only succeeds if nobody else took it first.
 * Returns null on success, or the id of the person who already has it.
 */
export async function claimRun(routineId: string, day: string, me: string): Promise<string | null> {
  const now = new Date().toISOString();
  const ins = await supabase.from('routine_runs').insert({ routine_id: routineId, day, claimed_by: me, claimed_at: now });
  if (!ins.error) return null;
  // A row exists already: take it only if it's still free.
  const upd = await supabase.from('routine_runs').update({ claimed_by: me, claimed_at: now })
    .eq('routine_id', routineId).eq('day', day).is('claimed_by', null).is('done_by', null).select();
  if (upd.data?.length) return null;
  const { data } = await supabase.from('routine_runs').select('claimed_by, done_by').eq('routine_id', routineId).eq('day', day).maybeSingle();
  if (data?.claimed_by === me) return null;
  return data?.done_by ?? data?.claimed_by ?? 'someone';
}

export async function finishRun(routineId: string, day: string, me: string) {
  const now = new Date().toISOString();
  const { data } = await supabase.from('routine_runs').select('claimed_by').eq('routine_id', routineId).eq('day', day).maybeSingle();
  return supabase.from('routine_runs').upsert({
    routine_id: routineId, day, done_by: me, done_at: now,
    claimed_by: data?.claimed_by ?? me, claimed_at: data?.claimed_by ? undefined : now,
  });
}

export async function releaseRun(routineId: string, day: string) {
  return supabase.from('routine_runs').update({ claimed_by: null, claimed_at: null, done_by: null, done_at: null })
    .eq('routine_id', routineId).eq('day', day);
}
