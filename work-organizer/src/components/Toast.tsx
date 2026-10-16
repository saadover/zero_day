import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem { id: number; text: string; err?: boolean; action?: { label: string; run: () => void } }
interface ToastApi {
  show: (text: string, action?: ToastItem['action']) => void;
  error: (text: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq;
    setItems((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), t.err ? 6000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show: (text, action) => push({ text, action }),
    error: (text) => push({ text, err: true }),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button onClick={() => { t.action!.run(); setItems((l) => l.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}
