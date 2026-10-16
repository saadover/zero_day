import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from './Icons';

/** A floating panel anchored to a trigger element. Closes on outside click / Escape. */
export function Popover({ anchor, onClose, children, width }: {
  anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const el = ref.current.getBoundingClientRect();
    let top = r.bottom + 4;
    let left = r.left;
    if (top + el.height > window.innerHeight - 8) top = Math.max(8, r.top - el.height - 4);
    if (left + el.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - el.width - 8);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className="pop" style={{ top: pos.top, left: pos.left, width }} role="dialog">
      {children}
    </div>,
    document.body,
  );
}

export interface Option<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

/** Single- or multi-select menu with optional search. */
export function SelectMenu<T extends string>({ anchor, onClose, options, value, onPick, multi, search, footer }: {
  anchor: HTMLElement | null; onClose: () => void; options: Option<T>[]; value: T | T[] | null;
  onPick: (v: T) => void; multi?: boolean; search?: boolean; footer?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);

  const pick = (v: T) => { onPick(v); if (!multi) onClose(); };

  return (
    <Popover anchor={anchor} onClose={onClose}>
      {(search || options.length > 8) && (
        <input
          className="pop-search" autoFocus placeholder="Filter…" value={q}
          onChange={(e) => { setQ(e.target.value); setHl(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, shown.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
            if (e.key === 'Enter' && shown[hl]) { e.preventDefault(); pick(shown[hl].value); }
          }}
        />
      )}
      {shown.map((o, i) => (
        <button key={o.value} className={`mi ${i === hl && q ? 'hl' : ''}`} onClick={() => pick(o.value)}>
          {o.icon}
          <span className="ellipsis">{o.label}</span>
          {o.hint && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{o.hint}</span>}
          {selected(o.value) && <span className="tick"><IconCheck size={14} /></span>}
        </button>
      ))}
      {shown.length === 0 && <div className="mi muted">Nothing found</div>}
      {footer}
    </Popover>
  );
}

/** A simple action menu. */
export function ActionMenu({ anchor, onClose, items }: {
  anchor: HTMLElement | null; onClose: () => void;
  items: ({ label: string; icon?: ReactNode; run: () => void; danger?: boolean } | 'sep')[];
}) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      {items.map((it, i) => it === 'sep' ? <div key={i} className="msep" /> : (
        <button key={i} className={`mi ${it.danger ? 'danger' : ''}`} onClick={() => { onClose(); it.run(); }}>
          {it.icon}{it.label}
        </button>
      ))}
    </Popover>
  );
}

/** Hook: manage one open popover anchored to the clicked element. */
export function useAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: (e: { currentTarget: HTMLElement }) => setAnchor(e.currentTarget),
    close: () => setAnchor(null),
  };
}
