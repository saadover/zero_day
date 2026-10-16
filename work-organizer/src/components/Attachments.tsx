import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { timeAgo } from '../lib/dates';
import { isImage, prepareFiles } from '../lib/images';
import { supabase } from '../lib/supabase';
import type { Attachment } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';
import { firstName, formatBytes } from './Atoms';
import { IconDownload, IconPaperclip, IconTrash, IconX } from './Icons';
import { useToast } from './Toast';

/** Short-lived signed URLs for private files, refreshed in batches. */
function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    const missing = paths.filter((p) => !urls[p]);
    if (!missing.length) return;
    supabase.storage.from('attachments').createSignedUrls(missing, 3600).then(({ data }) => {
      if (!data) return;
      setUrls((u) => ({ ...u, ...Object.fromEntries(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string])) }));
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** Local preview URLs for not-yet-uploaded images. */
function usePreviews(files: File[]) {
  const urls = useMemo(() => files.map((f) => (isImage(f) ? URL.createObjectURL(f) : '')), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function Lightbox({ src, name, onClose, onDownload }: { src: string; name: string; onClose: () => void; onDownload?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={name}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="ellipsis">{name}</span>
        {onDownload && <button className="btn sm" onClick={onDownload}><IconDownload size={13} /> Download</button>}
        <button className="btn sm icon" aria-label="Close" onClick={onClose}><IconX size={14} /></button>
      </div>
      <img src={src} alt={name} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

/**
 * Attachment list for a task or meeting. Works on a draft: new files and removals
 * only happen when the parent saves.
 */
export function Attachments({ saved, newFiles, removed, onAdd, onRemoveSaved, onRemoveNew }: {
  saved: Attachment[]; newFiles: File[]; removed: string[];
  onAdd: (files: File[]) => void; onRemoveSaved: (id: string) => void; onRemoveNew: (index: number) => void;
}) {
  const { personById } = useData();
  const act = useActions();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ src: string; name: string; path?: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const shown = saved.filter((a) => !removed.includes(a.id));
  const images = shown.filter((a) => isImage(a));
  const docs = shown.filter((a) => !isImage(a));
  const signed = useSignedUrls(images.map((a) => a.path));
  const previews = usePreviews(newFiles);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const ready = await prepareFiles(files, (m) => toast.error(m));
    setBusy(false);
    if (ready.length) {
      const before = files.reduce((n, f) => n + f.size, 0);
      const after = ready.reduce((n, f) => n + f.size, 0);
      if (ready.some(isImage) && before > after * 1.3) toast.show(`Compressed ${formatBytes(before)} → ${formatBytes(after)}`);
      onAdd(ready);
    }
  };

  // Paste a screenshot anywhere on the page while this list is shown.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => isImage(f));
      if (!files.length) return;
      // If a task panel is open on top of this page, the paste belongs to the panel.
      if (document.querySelector('.panel') && !boxRef.current?.closest('.panel')) return;
      e.preventDefault();
      add(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <div className="section" ref={boxRef}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); add([...e.dataTransfer.files]); } }}>
      <div className="section-h">
        Files
        <span className="muted" style={{ fontSize: 11.5 }}>PDFs & images · paste a screenshot with Ctrl+V</span>
        <button className="btn ghost sm r" disabled={busy} onClick={() => inputRef.current?.click()}>
          <IconPaperclip size={13} /> {busy ? 'Compressing…' : 'Attach'}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/*" multiple hidden
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; add(f); }} />
      </div>

      {(images.length > 0 || newFiles.some(isImage)) && (
        <div className="thumbs">
          {images.map((a) => (
            <figure key={a.id} className="thumb">
              <button className="thumb-img" onClick={() => signed[a.path] && setView({ src: signed[a.path], name: a.name, path: a.path })} aria-label={`Open ${a.name}`}>
                {signed[a.path] ? <img src={signed[a.path]} alt={a.name} loading="lazy" /> : <span className="muted">…</span>}
              </button>
              <figcaption>
                <span className="ellipsis" title={a.name}>{formatBytes(a.size)} · {firstName(personById.get(a.uploaded_by ?? ''))}</span>
                <button className="btn ghost icon sm" aria-label="Remove image" onClick={() => onRemoveSaved(a.id)}><IconTrash size={12} /></button>
              </figcaption>
            </figure>
          ))}
          {newFiles.map((f, i) => isImage(f) && (
            <figure key={`n${i}`} className="thumb pending">
              <button className="thumb-img" onClick={() => setView({ src: previews[i], name: f.name })} aria-label={`Preview ${f.name}`}>
                <img src={previews[i]} alt={f.name} />
              </button>
              <figcaption>
                <span className="ellipsis">{formatBytes(f.size)} · not saved</span>
                <button className="btn ghost icon sm" aria-label="Remove image" onClick={() => onRemoveNew(i)}><IconX size={12} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {docs.map((a) => (
        <div className="file" key={a.id}>
          <span className="fi">PDF</span>
          <button className="vbtn grow" style={{ margin: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 0 }} onClick={() => act.openAttachment(a.path).catch((e) => toast.error(e.message))}>
            <span className="ellipsis" style={{ maxWidth: '100%' }}>{a.name}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>{formatBytes(a.size)} · {firstName(personById.get(a.uploaded_by ?? ''))} · {timeAgo(a.created_at)}</span>
          </button>
          <button className="btn ghost icon sm" aria-label="Download" onClick={() => act.openAttachment(a.path, true).catch((e) => toast.error(e.message))}><IconDownload size={14} /></button>
          <button className="btn ghost icon sm" aria-label="Remove file" onClick={() => onRemoveSaved(a.id)}><IconTrash size={14} /></button>
        </div>
      ))}
      {newFiles.map((f, i) => !isImage(f) && (
        <div className="file" key={`p${i}`} style={{ borderStyle: 'dashed' }}>
          <span className="fi">PDF</span>
          <span className="grow ellipsis">{f.name} <span className="muted" style={{ fontSize: 11.5 }}>· {formatBytes(f.size)} · uploads when you save</span></span>
          <button className="btn ghost icon sm" aria-label="Remove file" onClick={() => onRemoveNew(i)}><IconX size={14} /></button>
        </div>
      ))}
      {shown.length === 0 && newFiles.length === 0 && (
        <span className="muted" style={{ fontSize: 12.5 }}>No files yet. Drop, paste or attach — images are shrunk automatically, PDFs up to 10 MB.</span>
      )}

      {view && <Lightbox src={view.src} name={view.name} onClose={() => setView(null)}
        onDownload={view.path ? () => act.openAttachment(view.path!, true).catch((e) => toast.error(e.message)) : undefined} />}
    </div>
  );
}
