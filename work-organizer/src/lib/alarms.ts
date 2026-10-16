import { hhmm } from './dates';
import type { Task } from './types';

/** Choices offered on a task, in minutes before the time (0 = at the time). */
export const ALARM_CHOICES = [0, 15, 30, 60, 1440];

export const alarmLabel = (m: number) =>
  m === 0 ? 'At the time' : m < 60 ? `${m} min before` : m === 60 ? '1 h before' : m === 1440 ? '1 day before' : `${m / 60} h before`;

export interface Alarm { key: string; at: number; title: string; body: string; taskId: string }

const at = (date: string, time: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
};

/**
 * Alarms for a task, in this browser's time zone. Keys match the server's, so a pop-up
 * shown by the open app and the same one sent by the server replace each other.
 */
export function taskAlarms(t: Task): Alarm[] {
  if (t.status === 'Done') return [];
  const out: Alarm[] = [];
  if (t.do_date && t.do_time) {
    const time = hhmm(t.do_time);
    for (const m of t.start_alerts ?? [0]) {
      out.push({
        key: `start:${t.id}:${t.do_date}:${time}:${m}`, at: at(t.do_date, time) - m * 60_000, taskId: t.id,
        title: m === 0 ? `Time to start: ${t.title}` : `Starts ${m < 60 ? `in ${m} min` : m === 1440 ? 'tomorrow' : `in ${m / 60} h`}: ${t.title}`,
        body: `Planned for ${time}`,
      });
    }
  }
  if (t.deadline && t.deadline_time) {
    const time = hhmm(t.deadline_time);
    for (const m of t.deadline_alerts ?? [60]) {
      out.push({
        key: `due:${t.id}:${t.deadline}:${time}:${m}`, at: at(t.deadline, time) - m * 60_000, taskId: t.id,
        title: m === 0 ? `Due now: ${t.title}` : `Due ${m < 60 ? `in ${m} min` : m === 1440 ? 'tomorrow' : `in ${m / 60} h`}: ${t.title}`,
        body: `Deadline ${time}`,
      });
    }
  }
  return out;
}
