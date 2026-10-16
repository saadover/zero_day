// Every task gets a stable colour from its id, so the same task looks the same everywhere.
const COLORS = ['#E5484D', '#F76B15', '#E2A336', '#46A758', '#12A594', '#0090FF', '#3E63DD', '#8E4EC6', '#D6409F', '#978365', '#0D74CE', '#BD4B00'];

export function taskColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Hovering a task lights up every other place the same task is shown. */
export const sameTaskHover = (id: string) => ({
  'data-task': id,
  onMouseEnter: () => document.querySelectorAll(`[data-task="${id}"]`).forEach((el) => el.classList.add('same-hl')),
  onMouseLeave: () => document.querySelectorAll(`[data-task="${id}"]`).forEach((el) => el.classList.remove('same-hl')),
});
