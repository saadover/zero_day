import { fmtDay, hhmm } from './dates';
import type { Task } from './types';

/** Choices offered on a task, in minutes before the time (0 = at the time). */
export const ALARM_CHOICES = [0, 15, 30, 60, 1440];

export const alarmLabel = (m: number) =>
  m === 0 ? 'At the time' : m < 60 ? `${m} min before` : m === 60 ? '1 h before' : m === 1440 ? '1 day before' : `${m / 60} h before`;

export interface Alarm { key: string; at: number; target: number; moment: string; minutes: number; title: string; body: string; taskId: string }

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
        target: at(t.do_date, time), moment: `start:${t.id}:${t.do_date}:${time}`, minutes: m,
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
        target: at(t.deadline, time), moment: `due:${t.id}:${t.deadline}:${time}`, minutes: m,
        title: m === 0 ? `Due now: ${t.title}` : `Due ${m < 60 ? `in ${m} min` : m === 1440 ? 'tomorrow' : `in ${m / 60} h`}: ${t.title}`,
        body: `Deadline ${time}`,
      });
    }
  }
  if (t.remind_at) {
    const when = Date.parse(t.remind_at);
    out.push({
      key: `remind:${t.id}:${t.remind_at}`, at: when, target: when, moment: `remind:${t.id}:${t.remind_at}`, minutes: 0, taskId: t.id,
      title: `Reminder: ${t.title}`, body: t.deadline ? `Deadline ${fmtDay(t.deadline)}${t.deadline_time ? ` ${hhmm(t.deadline_time)}` : ''}` : '',
    });
  }
  return out;
}

const inWords = (ms: number) => {
  const left = Math.round(ms / 60_000);
  return left <= 0 ? 'now' : left < 60 ? `in ${left} min` : left < 1440 ? `in ${Math.round(left / 60)} h` : 'tomorrow';
};

/** Title for an alarm that fires late (e.g. the task was created after its alarm time). */
export function lateTitle(a: Alarm, now: number, title: string): string {
  if (a.key.startsWith('remind:')) return `Reminder: ${title}`;
  const kind = a.key.startsWith('start:') ? 'Starts' : 'Due';
  return a.target <= now ? (kind === 'Starts' ? `Time to start: ${title}` : `Due now: ${title}`) : `${kind} ${inWords(a.target - now)}: ${title}`;
}
