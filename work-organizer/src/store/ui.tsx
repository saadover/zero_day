import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaskRow } from '../lib/types';

export type QuickAddDefaults = Partial<TaskRow> & { assignees?: string[]; meetingId?: string };

interface UiCtx {
  quickAdd: QuickAddDefaults | null;
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  closeQuickAdd: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
}

const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [quickAdd, setQuickAdd] = useState<QuickAddDefaults | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const openQuickAdd = useCallback((d?: QuickAddDefaults) => setQuickAdd(d ?? {}), []);
  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);
  const value = useMemo(() => ({ quickAdd, openQuickAdd, closeQuickAdd, paletteOpen, setPaletteOpen, navOpen, setNavOpen }),
    [quickAdd, openQuickAdd, closeQuickAdd, paletteOpen, navOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUi outside UiProvider');
  return c;
}

/** The open task lives in the URL (?task=<id>) so it can be linked and survives refresh. */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('task');
  const open = useCallback((id: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('task', id); return n; });
  }, [setParams]);
  const close = useCallback(() => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('task'); return n; });
  }, [setParams]);
  return { openId, open, close };
}
