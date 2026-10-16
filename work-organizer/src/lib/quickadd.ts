import * as chrono from 'chrono-node';
import { toDateStr } from './dates';
import type { Category, Priority, Profile, Tag } from './types';
import { CATEGORIES } from './types';

export interface QuickAddResult {
  title: string;
  deadline: string | null;
  doDate: string | null;
  priority: Priority | null;
  category: Category | null;
  assignees: string[];
  tagNames: string[];
  manager: boolean;
}

/**
 * Turn "Send budget to Karim fri !high #finance @lina" into a task.
 *  - a date anywhere → deadline ("do: monday" sets the do date instead)
 *  - !high / !med / !low (or !1 !2 !3) → priority
 *  - #word → tag (created if new); #admin #reporting… → category
 *  - @name → assignee (first name match), @me → you
 *  - +manager → Given by: Manager
 */
export function parseQuickAdd(input: string, people: Profile[], meId: string, tags: Tag[]): QuickAddResult {
  let text = ` ${input} `;
  const out: QuickAddResult = {
    title: '', deadline: null, doDate: null, priority: null, category: null, assignees: [], tagNames: [], manager: false,
  };

  text = text.replace(/\s!(high|h|1|urgent|medium|med|m|2|low|l|3)(?=\s)/gi, (_, p: string) => {
    const k = p.toLowerCase();
    out.priority = ['high', 'h', '1', 'urgent'].includes(k) ? 'High' : ['low', 'l', '3'].includes(k) ? 'Low' : 'Medium';
    return ' ';
  });

  text = text.replace(/\s\+manager(?=\s)/gi, () => { out.manager = true; return ' '; });

  text = text.replace(/\s@([\p{L}\d._-]+)(?=\s)/giu, (m, name: string) => {
    const n = name.toLowerCase();
    if (n === 'me') { out.assignees.push(meId); return ' '; }
    const p = people.find((x) => x.full_name.toLowerCase().split(/\s+/)[0] === n)
      ?? people.find((x) => x.full_name.toLowerCase().startsWith(n) || x.email.toLowerCase().startsWith(n));
    if (p) { if (!out.assignees.includes(p.id)) out.assignees.push(p.id); return ' '; }
    return m;
  });

  text = text.replace(/\s#([\p{L}\d_-]+)(?=\s)/giu, (_, word: string) => {
    const cat = CATEGORIES.find((c) => c.toLowerCase() === word.toLowerCase());
    if (cat) out.category = cat;
    else {
      const existing = tags.find((t) => t.name.toLowerCase() === word.toLowerCase());
      out.tagNames.push(existing ? existing.name : word.toLowerCase());
    }
    return ' ';
  });

  // "do: monday" → do date
  const doMatch = text.match(/\sdo:\s*([^!#@+]+?)(?=\s(?:due|by)\b|\s[!#@+]|\s*$)/i);
  if (doMatch) {
    const r = chrono.parse(doMatch[1], new Date(), { forwardDate: true })[0];
    if (r) { out.doDate = toDateStr(r.start.date()); text = text.replace(doMatch[0], ' '); }
  }

  const results = chrono.parse(text, new Date(), { forwardDate: true });
  const r = results[results.length - 1];
  if (r) {
    out.deadline = toDateStr(r.start.date());
    text = text.slice(0, r.index) + text.slice(r.index + r.text.length);
    text = text.replace(/\s(due|by|on)\s*$/i, ' ');
  }

  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}
