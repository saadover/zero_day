export type Theme = 'system' | 'light' | 'dark';

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* storage unavailable */ }
}

export function initTheme() {
  try {
    const t = localStorage.getItem('theme') as Theme | null;
    if (t) applyTheme(t);
  } catch { /* storage unavailable */ }
}
