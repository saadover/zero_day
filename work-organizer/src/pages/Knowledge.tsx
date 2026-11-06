import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Attachments } from '../components/Attachments';
import { firstName } from '../components/Atoms';
import { IconCopy, IconLink, IconPaperclip, IconPlus, IconSearch, IconTrash, IconX } from '../components/Icons';
import { useToast } from '../components/Toast';
import { fmtDay, timeAgo, toDateStr } from '../lib/dates';
import { isHit, queryWords, scoreFields } from '../lib/search';
import type { Knowledge } from '../lib/types';
import { useActions } from '../store/actions';
import { useData } from '../store/data';

interface Draft { id?: string; question: string; answer: string; tags: string; source: string; newFiles: File[]; removedFiles: string[] }
const blank: Draft = { question: '', answer: '', tags: '', source: '', newFiles: [], removedFiles: [] };
const toDraft = (k: Knowledge): Draft => ({ id: k.id, question: k.question, answer: k.answer, tags: k.tags.join(', '), source: k.source, newFiles: [], removedFiles: [] });
const parseTags = (s: string) => [...new Set(s.split(/[,;#]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** Text with the searched words marked. */
function Hl({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const m = part.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
        if (!m || !m[2] || !isHit(m[2], words)) return <Fragment key={i}>{part}</Fragment>;
        return <Fragment key={i}>{m[1]}<mark>{m[2]}</mark>{m[3]}</Fragment>;
      })}
    </>
  );
}

/** ~240 characters of the answer around the first searched word. */
function snippet(answer: string, words: string[]): string {
  const flat = answer.replace(/\s+/g, ' ').trim();
  if (flat.length <= 240) return flat;
  let at = 0;
  if (words.length) {
    const parts = flat.split(' ');
    let pos = 0;
    for (const p of parts) { if (isHit(p, words)) { at = pos; break; } pos += p.length + 1; }
  }
  const start = Math.max(0, at - 60);
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + 240)}${start + 240 < flat.length ? '…' : ''}`;
}

export function KnowledgePage() {
  const { db, can, personById, remove } = useData();
  const act = useActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(params.get('id') ? [params.get('id')!] : []));
  const [editing, setEditing] = useState<Draft | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canEdit = can('knowledge_edit');

  // "/" jumps to the search box from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Keep the search in the address bar, so a search can be shared or come back after a refresh
  useEffect(() => {
    const t = setTimeout(() => setParams((p) => { const n = new URLSearchParams(p); if (q.trim()) n.set('q', q.trim()); else n.delete('q'); return n; }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [q, setParams]);

  const filesOf = useMemo(() => {
    const m = new Map<string, typeof db.attachments>();
    for (const a of db.attachments) if (a.knowledge_id) m.set(a.knowledge_id, [...(m.get(a.knowledge_id) ?? []), a]);
    return m;
  }, [db.attachments]);

  const words = useMemo(() => queryWords(q), [q]);
  const results = useMemo(() => {
    const list = db.knowledge.filter((k) => !tag || k.tags.includes(tag));
    if (!words.length) return [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((k) => ({ k, score: 0 }));
    return list
      .map((k) => ({ k, score: scoreFields(words, [
        { text: k.question, weight: 3 },
        { text: k.tags.join(' '), weight: 3 },
        { text: k.answer, weight: 1.5 },
        { text: k.source, weight: 1 },
        { text: (filesOf.get(k.id) ?? []).map((f) => f.name.replace(/\.[a-z0-9]+$/i, '')).join(' '), weight: 1 },
      ], q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.k.updated_at.localeCompare(a.k.updated_at));
  }, [db.knowledge, words, q, tag, filesOf]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of db.knowledge) for (const t of k.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14);
  }, [db.knowledge]);

  // Opened from a shared link (/knowledge?id=…): scroll to that entry once it's loaded
  const linked = params.get('id');
  const scrolled = useRef(false);
  useEffect(() => {
    if (!linked || scrolled.current || !db.knowledge.some((k) => k.id === linked)) return;
    scrolled.current = true;
    setTimeout(() => document.getElementById(`kb-${linked}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, [linked, db.knowledge]);

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text); toast.show(`${what} copied`); };
  const del = async (k: Knowledge) => {
    if (!confirm(`Delete “${k.question}” and its files?`)) return;
    const files = filesOf.get(k.id) ?? [];
    for (const f of files) await act.deleteAttachment(f.id, f.path);
    await remove('knowledge', { id: k.id });
    toast.show('Deleted');
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <h1>Knowledge base</h1>
        <span className="muted" style={{ fontSize: 13 }}>Questions the team already answered — search before you ask</span>
        <div className="actions">
          {canEdit && !editing && <button className="btn primary" onClick={() => setEditing({ ...blank, question: q.trim() && words.length > 2 ? q.trim() : '' })}><IconPlus size={14} /> New question</button>}
        </div>
      </div>

      {editing && <Editor key={editing.id ?? 'new'} initial={editing} onClose={(savedId) => { setEditing(null); if (savedId) setOpen((s) => new Set(s).add(savedId)); }} />}

      <div className="kb-search">
        <IconSearch size={18} />
        <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the knowledge base"
          placeholder="Type keywords — e.g. “dsa partner”, “accelerate onboarding”, “invoice template”" />
        {q && <button className="btn ghost sm icon" aria-label="Clear search" onClick={() => { setQ(''); searchRef.current?.focus(); }}><IconX size={14} /></button>}
        <span className="kbd" title="Press / to search">/</span>
      </div>
      {tagCounts.length > 0 && (
        <div className="kb-tags">
          {tagCounts.map(([t, n]) => (
            <button key={t} className={`kb-tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t} <span>{n}</span></button>
          ))}
          {tag && <button className="linkish" style={{ fontSize: 12 }} onClick={() => setTag(null)}>clear</button>}
        </div>
      )}
      <div className="kb-count muted">
        {words.length ? `${results.length} ${results.length === 1 ? 'answer' : 'answers'} for “${q.trim()}”` : `${results.length} ${results.length === 1 ? 'question' : 'questions'}${tag ? ` tagged #${tag}` : ''} · newest first`}
      </div>

      {db.knowledge.length === 0 ? (
        <div className="empty">
          Nothing saved yet. When someone answers a question in the group (“how do we send the DSA to…”, “can we accelerate…”),
          {canEdit ? ' click “New question” and save it here — next time, just search.' : ' ask someone with access to save it here.'}
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          No answer matches “{q.trim()}”. Try fewer or other words{canEdit && <>, or <button className="linkish" onClick={() => setEditing({ ...blank, question: q.trim() })}>save this as a new question</button></>}.
        </div>
      ) : (
        <div className="kb-list">
          {results.map(({ k }) => {
            const isOpen = open.has(k.id);
            const files = filesOf.get(k.id) ?? [];
            return (
              <article key={k.id} className={`kb-item ${isOpen ? 'open' : ''}`} id={`kb-${k.id}`}>
                <button className="kb-q" onClick={() => toggle(k.id)} aria-expanded={isOpen}>
                  <span className="kb-mark">Q</span>
                  <span className="grow"><Hl text={k.question} words={words} /></span>
                  {files.length > 0 && <span className="muted kb-files"><IconPaperclip size={12} /> {files.length}</span>}
                </button>
                <div className="kb-a">
                  <span className="kb-mark a">A</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    {isOpen
                      ? <div className="kb-answer"><Hl text={k.answer || '(no written answer — see the files)'} words={words} /></div>
                      : <div className="kb-snippet" onClick={() => toggle(k.id)}><Hl text={snippet(k.answer, words) || '(see the files)'} words={words} /></div>}
                    {isOpen && files.length > 0 && (
                      <Attachments saved={files} newFiles={[]} removed={[]} readOnly onAdd={() => undefined} onRemoveSaved={() => undefined} onRemoveNew={() => undefined} />
                    )}
                    <div className="kb-meta">
                      {k.tags.map((t) => <button key={t} className={`kb-tag sm ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}
                      {k.source && <span>From: {k.source}</span>}
                      <span>Saved by {firstName(personById.get(k.created_by ?? '')) || 'someone'} · {fmtDay(toDateStr(new Date(k.created_at)))}</span>
                      {k.updated_at !== k.created_at && <span>edited {timeAgo(k.updated_at)}</span>}
                      {isOpen && (
                        <span className="kb-actions">
                          <button className="btn ghost sm" onClick={() => copy(k.answer, 'Answer')}><IconCopy size={13} /> Copy answer</button>
                          <button className="btn ghost sm" onClick={() => copy(`${location.origin}/knowledge?id=${k.id}`, 'Link')}><IconLink size={13} /> Copy link</button>
                          {canEdit && <button className="btn ghost sm" onClick={() => { setEditing(toDraft(k)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>}
                          {canEdit && <button className="btn ghost sm icon danger" aria-label="Delete" onClick={() => del(k)}><IconTrash size={13} /></button>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Editor({ initial, onClose }: { initial: Draft; onClose: (savedId?: string) => void }) {
  const { db, insert, update, can } = useData();
  const act = useActions();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify({ ...d, newFiles: d.newFiles.length }) !== JSON.stringify({ ...initial, newFiles: initial.newFiles.length });

  // Already answered? Show close matches while typing a new question.
  const similar = useMemo(() => {
    const w = queryWords(d.question);
    if (d.id || w.length < 2) return [];
    return db.knowledge
      .map((k) => ({ k, s: scoreFields(w, [{ text: k.question, weight: 3 }, { text: k.tags.join(' '), weight: 2 }, { text: k.answer, weight: 1 }]) }))
      .filter((r) => r.s >= w.length * 1.5)
      .sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.k);
  }, [d.question, d.id, db.knowledge]);

  const save = async () => {
    if (!d.question.trim()) { toast.error('Write the question.'); return; }
    setBusy(true);
    try {
      const row = { question: d.question.trim(), answer: d.answer.trim(), tags: parseTags(d.tags), source: d.source.trim() };
      let id = d.id;
      if (id) await update('knowledge', { id }, row);
      else id = (await insert('knowledge', row))[0].id;
      for (const f of d.newFiles) {
        try { await act.uploadPdf(f, { knowledge_id: id }); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      }
      for (const fid of d.removedFiles) {
        const a = db.attachments.find((x) => x.id === fid);
        if (a) await act.deleteAttachment(a.id, a.path);
      }
      toast.show(d.id ? 'Saved' : 'Added to the knowledge base');
      onClose(id);
    } catch { /* the error toast is already shown */ } finally { setBusy(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="card-box kb-editor">
      <h2>{d.id ? 'Edit question' : 'New question'}</h2>
      <label className="field">Question
        <input className="input" autoFocus={!d.id} value={d.question} placeholder="e.g. How do we send the DSA to a new partner?"
          onChange={(e) => setD({ ...d, question: e.target.value })} />
      </label>
      {similar.length > 0 && (
        <div className="kb-similar">
          <span className="muted">Already in the knowledge base — maybe one of these?</span>
          {similar.map((k) => <a key={k.id} href={`/knowledge?id=${k.id}`} target="_blank" rel="noreferrer">{k.question}</a>)}
        </div>
      )}
      <label className="field">Answer
        <textarea className="textarea" rows={6} value={d.answer} placeholder="The answer, steps, who to contact… (screenshots and PDFs below)"
          onChange={(e) => setD({ ...d, answer: e.target.value })} />
      </label>
      <div className="grid-2">
        <label className="field">Tags <span className="muted" style={{ fontWeight: 400 }}>(optional, separated by commas)</span>
          <input className="input" value={d.tags} placeholder="dsa, partner, legal" onChange={(e) => setD({ ...d, tags: e.target.value })} />
        </label>
        <label className="field">Where it came from <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          <input className="input" value={d.source} placeholder="e.g. Karim (BDM) in the Teams group" onChange={(e) => setD({ ...d, source: e.target.value })} />
        </label>
      </div>
      <Attachments
        saved={d.id ? db.attachments.filter((a) => a.knowledge_id === d.id) : []}
        newFiles={d.newFiles} removed={d.removedFiles}
        readOnly={!can('files_upload')}
        onAdd={(files) => setD((x) => ({ ...x, newFiles: [...x.newFiles, ...files] }))}
        onRemoveSaved={(fid) => setD((x) => ({ ...x, removedFiles: [...x.removedFiles, fid] }))}
        onRemoveNew={(i) => setD((x) => ({ ...x, newFiles: x.newFiles.filter((_, j) => j !== i) }))}
      />
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        {dirty && <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>Unsaved · Ctrl+S to save</span>}
        <button className="btn" disabled={busy} onClick={() => { if (!dirty || confirm('Discard this question?')) onClose(); }}>Cancel</button>
        <button className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

/** Search used by the command palette: best few entries for what was typed. */
export function searchKnowledge(list: Knowledge[], q: string, max = 5): Knowledge[] {
  const w = queryWords(q);
  if (!w.length) return [];
  return list.map((k) => ({ k, s: scoreFields(w, [{ text: k.question, weight: 3 }, { text: k.tags.join(' '), weight: 3 }, { text: k.answer, weight: 1.5 }], q) }))
    .filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((r) => r.k);
}
