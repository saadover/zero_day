// Dates are kept as local 'YYYY-MM-DD' strings, matching Postgres `date` columns.

const DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => toDateStr(new Date());

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);
}

/** Monday of the week containing s. */
export function startOfWeek(s: string): string {
  const d = parseDate(s);
  const shift = (d.getDay() + 6) % 7;
  return addDays(s, -shift);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01';
}

export function endOfMonth(s: string): string {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** "Fri 16 Oct" (adds the year when it isn't this year). */
export function fmtDay(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseDate(s);
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function fmtMonth(s: string): string {
  const d = parseDate(s);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtLongToday(): string {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()].toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "2 days ago", "just now"… */
export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? 'yesterday' : `${d} days ago`;
  return fmtDay(toDateStr(new Date(iso)));
}

export type DueTone = '' | 'soon' | 'late';

/** "15:00:00" → "15:00" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Has this date (+ optional time) already passed? */
export function isPast(date: string | null, time?: string | null): boolean {
  if (!date) return false;
  const t = today();
  if (date < t) return true;
  return date === t && !!time && hhmm(time) <= nowTime();
}

/** Text + tone for a date (and optional time) relative to now. */
export function dueLabel(date: string | null, done = false, time?: string | null): { text: string; tone: DueTone } {
  if (!date) return { text: '', tone: '' };
  const tm = hhmm(time);
  if (done) return { text: `${fmtDay(date)}${tm ? ` ${tm}` : ''}`, tone: '' };
  const n = diffDays(today(), date);
  if (n < 0) return { text: n === -1 ? '1 day late' : `${-n} days late`, tone: 'late' };
  if (n === 0) {
    if (!tm) return { text: 'Today', tone: 'soon' };
    const left = minutes(tm) - minutes(nowTime());
    if (left <= 0) return { text: `Late · ${tm}`, tone: 'late' };
    if (left < 60) return { text: `In ${left} min`, tone: 'late' };
    if (left < 180) return { text: `In ${Math.round(left / 60)} h · ${tm}`, tone: 'soon' };
    return { text: `Today ${tm}`, tone: 'soon' };
  }
  if (n === 1) return { text: `Tomorrow${tm ? ` ${tm}` : ''}`, tone: 'soon' };
  if (n <= 6) return { text: tm ? `${fmtDay(date).split(' ')[0]} ${tm}` : `${n} days left`, tone: '' };
  return { text: `${fmtDay(date)}${tm ? ` ${tm}` : ''}`, tone: '' };
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
