import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { firstName } from '../components/Atoms';
import { ActionMenu, useAnchor } from '../components/Popover';
import { IconChevronLeft, IconDownload, IconLock, IconPlus, IconTrash, IconUsers } from '../components/Icons';
import { DrawingThumb } from '../components/DrawingThumb';
import { OutlineBullets, OutlineDiagram } from '../components/OutlineDiagram';
import { useToast } from '../components/Toast';
import { timeAgo } from '../lib/dates';
import { DRAWING_CHAR_W, layoutToSkeleton, mindmapLayout, parseOutline, SAMPLE_OUTLINE, treeLayout } from '../lib/outline';
import type { Picture } from '../lib/exporter';
import type { Process } from '../lib/types';
import { useData } from '../store/data';
import type { Scene } from '../components/ProcessCanvas';

const ProcessCanvas = lazy(() => import('../components/ProcessCanvas'));

type View = Process['view'];
const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'bullets', label: 'Bullet points', hint: 'Write the steps as an indented list' },
  { id: 'tree', label: 'Tree', hint: 'Top-down diagram built from the list' },
  { id: 'mindmap', label: 'Mind map', hint: 'Branches around the centre, built from the list' },
  { id: 'canvas', label: 'Drawing', hint: 'Free editor: shapes, arrows, colours, fonts, flowcharts' },
];

export function useCanEditProcesses() {
  return useData().can('process_edit');
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ───────────────────────────── List ─────────────────────────────

export function ProcessesPage() {
  const { db, personById, meId } = useData();
  const canEdit = useCanEditProcesses();
  const canExport = useData().can('export');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const list = db.processes
    .filter((p) => !q || `${p.title} ${p.outline}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const mine = list.filter((p) => p.visibility === 'private');
  const team = list.filter((p) => p.visibility === 'team');

  const Card = ({ p }: { p: Process }) => {
    const steps = p.outline.split(/\n/).filter((l) => l.trim()).length;
    const drawn = (p.scene?.elements ?? []).some((e) => !(e as { isDeleted?: boolean }).isDeleted);
    return (
      <Link to={`/processes/${p.id}`} className="proc-card">
        <div className="proc-thumb">
          {/* The drawing when it's what the process shows (or all it has), otherwise the tree / mind map */}
          {drawn && (p.view === 'canvas' || !p.outline.trim()) ? <DrawingThumb elements={p.scene!.elements!} />
            : p.outline.trim() ? <OutlineDiagram root={parseOutline(p.outline, p.title)} kind={p.view === 'tree' ? 'tree' : 'mindmap'} />
              : <span className="muted" style={{ fontSize: 12 }}>Empty</span>}
        </div>
        <div className="proc-meta">
          <strong className="ellipsis">{p.title}</strong>
          <span className="muted ellipsis" style={{ fontSize: 12 }}>
            {p.visibility === 'private' ? 'Private · ' : ''}{steps ? `${steps} steps · ` : ''}{(p.scene?.elements?.length ?? 0) > 0 ? 'drawing · ' : ''}
            {firstName(personById.get(p.updated_by ?? ''))} {timeAgo(p.updated_at)}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Processes</h1>
        <span className="sub">How we do things — as lists, trees, mind maps or free drawings</span>
        <div className="actions">
          <input className="input" style={{ width: 200 }} placeholder="Search processes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search processes" />
          {canExport && <button className="btn" onClick={() => nav('/export?what=processes')}><IconDownload size={13} /> Export…</button>}
          {canEdit && <button className="btn primary" onClick={() => nav('/processes/new')}><IconPlus size={14} /> New process</button>}
        </div>
      </div>
      {!canEdit && <p className="view-hint">You have view access to processes.</p>}
      {mine.filter((p) => p.owner_id === meId).length > 0 && (
        <>
          <div className="side-label" style={{ paddingLeft: 2 }}><IconLock size={11} /> My private space</div>
          <div className="proc-grid">{mine.map((p) => <Card key={p.id} p={p} />)}</div>
        </>
      )}
      <div className="side-label" style={{ paddingLeft: 2 }}><IconUsers size={11} /> Team processes</div>
      <div className="proc-grid">
        {team.map((p) => <Card key={p.id} p={p} />)}
        {team.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No team processes yet.{canEdit ? ' Click “New process” to document your first one.' : ''}</div>}
      </div>
    </div>
  );
}

// ───────────────────────────── Editor ─────────────────────────────

interface Draft { title: string; outline: string; scene: Scene; view: View; visibility: 'team' | 'private' }

export function ProcessPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { db, insert, update, remove, personById, meId } = useData();
  const canEdit = useCanEditProcesses();
  const canExport = useData().can('export');
  const toast = useToast();
  const nav = useNavigate();
  const proc = isNew ? undefined : db.processes.find((p) => p.id === id);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasApi = useRef<ExcalidrawImperativeAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [fitCanvas, setFitCanvas] = useState(false);

  const saved = useMemo<Draft>(() => proc ? {
    title: proc.title, outline: proc.outline, view: proc.view, visibility: proc.visibility,
    scene: { elements: proc.scene?.elements ?? [], appState: proc.scene?.appState ?? {} },
  } : { title: '', outline: '', view: 'bullets', visibility: 'team', scene: { elements: [] } }, [proc]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const d = draft ?? saved;
  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== JSON.stringify(saved));
  const edit = (patch: Partial<Draft>) => setDraft((cur) => ({ ...(cur ?? saved), ...patch }));

  // Someone else saved while you were editing.
  const [stale, setStale] = useState(false);
  const seenUpdate = useRef(proc?.updated_at);
  useEffect(() => {
    if (!proc) return;
    if (seenUpdate.current && proc.updated_at !== seenUpdate.current && proc.updated_by !== meId && draft) setStale(true);
    seenUpdate.current = proc.updated_at;
  }, [proc, meId, draft]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty && (draft || isNew) && canEdit) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, draft, isNew, canEdit]);

  const root = useMemo(() => parseOutline(d.outline, d.title || 'Process'), [d.outline, d.title]);
  const onCanvasChange = useCallback((scene: Scene) => setDraft((cur) => ({ ...(cur ?? saved), scene })), [saved]);

  const exportMenu = useAnchor();
  const [zoom, setZoom] = useState<number | 'fit'>('fit');

  if (!isNew && !proc) return <div className="page"><div className="empty">Process not found. <Link to="/processes">Back</Link></div></div>;

  const save = async () => {
    if (!d.title.trim()) { toast.error('Give the process a name.'); return; }
    setBusy(true);
    try {
      const row = { title: d.title.trim(), outline: d.outline, scene: d.scene as Process['scene'], view: d.view, visibility: d.visibility };
      if (isNew) {
        const [created] = await insert('processes', { ...row, owner_id: meId });
        setDraft(null);
        nav(`/processes/${created.id}`, { replace: true });
      } else {
        await update('processes', { id: proc!.id }, row);
        setDraft(null);
      }
      setStale(false);
      toast.show('Process saved');
    } finally { setBusy(false); }
  };
  const cancel = () => {
    if (isNew) { nav('/processes'); return; }
    setDraft(null); setStale(false); setCanvasKey((k) => k + 1);
  };

  const toDrawing = async (kind: 'tree' | 'mindmap') => {
    if (!root.children.length) { toast.error('Write some steps in the list first.'); return; }
    const layout = kind === 'tree' ? treeLayout(root, DRAWING_CHAR_W) : mindmapLayout(root, DRAWING_CHAR_W);
    const skeleton = layoutToSkeleton(layout, kind);
    const existing = d.scene.elements as { x: number; width: number; isDeleted?: boolean }[];
    if (existing.length && !confirm('The drawing already has content. Add the diagram next to it?')) return;
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    const added = convertToExcalidrawElements(skeleton as never, { regenerateIds: true });
    const dx = existing.length ? Math.max(...existing.map((e) => e.x + e.width)) + 120 - layout.minX : 0;
    const moved = added.map((e) => ({ ...e, x: e.x + dx }));
    edit({ view: 'canvas', scene: { ...d.scene, elements: [...existing, ...moved] } });
    setFitCanvas(true);
    setCanvasKey((k) => k + 1); // remount the editor with the new drawing
  };

  // Exports what is on screen, unsaved changes included.
  const exportAs = async (format: 'png' | 'svg' | 'pdf') => {
    const ex = await import('../lib/exporter');
    const current: Process = { ...(proc ?? { id: 'new', owner_id: meId, created_by: meId, updated_by: meId, created_at: new Date().toISOString() }), ...d, updated_at: new Date().toISOString() };
    if (d.view === 'canvas' && canvasApi.current) current.scene = { ...d.scene, elements: canvasApi.current.getSceneElements() as unknown[] };
    const picture: Picture = d.view === 'bullets' ? 'tree' : d.view;
    const name = ex.safeName(d.title || 'process');
    try {
      if (format === 'pdf') { ex.download(`${name}.pdf`, await ex.processesToPdf([current], picture, { picture: true, steps: true })); return; }
      const blob = format === 'png' ? await ex.processPng(current, picture)
        : await ex.processSvg(current, picture).then((x) => (x ? new Blob([x], { type: 'image/svg+xml' }) : null));
      if (!blob) { toast.error('Nothing to export yet — add some steps or draw something.'); return; }
      ex.download(`${name}.${format}`, blob);
    } catch (e) { toast.error(`Export failed: ${(e as Error).message}`); }
  };
  const zoomBy = (dir: 1 | -1) => setZoom((z) => {
    const cur = z === 'fit' ? 1 : z;
    const i = ZOOMS.findIndex((v) => v >= cur);
    return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? ZOOMS.length - 1 : i) + dir))];
  });

  return (
    <div className="page wide proc-page">
      <div className="row-gap" style={{ marginBottom: 10 }}>
        <button className="btn ghost sm" onClick={() => { if (!(dirty && draft && canEdit) || confirm('Leave without saving?')) nav('/processes'); }}><IconChevronLeft size={14} /> Processes</button>
        {proc && <span className="muted" style={{ fontSize: 12 }}>Edited by {firstName(personById.get(proc.updated_by ?? ''))} {timeAgo(proc.updated_at)}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && (
            <div className="seg" aria-label="Who can see it">
              <button className={d.visibility === 'team' ? 'on' : ''} onClick={() => edit({ visibility: 'team' })}><IconUsers size={13} /> Team</button>
              <button className={d.visibility === 'private' ? 'on' : ''} onClick={() => edit({ visibility: 'private' })}><IconLock size={13} /> Private</button>
            </div>
          )}
          {canExport && <button className="btn sm" onClick={exportMenu.open} aria-haspopup="menu"><IconDownload size={13} /> Export</button>}
          {exportMenu.anchor && (
            <ActionMenu anchor={exportMenu.anchor} onClose={exportMenu.close} items={[
              { label: 'PDF (picture + steps)', run: () => exportAs('pdf') },
              { label: d.view === 'canvas' ? 'PNG image of the drawing' : `PNG image (${d.view === 'mindmap' ? 'mind map' : 'tree'})`, run: () => exportAs('png') },
              { label: 'SVG (sharp at any size)', run: () => exportAs('svg') },
              'sep',
              { label: 'Export several processes…', run: () => nav(`/export?what=processes${proc ? `&id=${proc.id}` : ''}`) },
            ]} />
          )}
          {canEdit && proc && (
            <button className="btn ghost sm danger" onClick={async () => { if (confirm(`Delete “${proc.title}”?`)) { await remove('processes', { id: proc.id }); nav('/processes'); } }}><IconTrash size={13} /> Delete</button>
          )}
        </span>
      </div>

      <input className="panel-title" style={{ fontSize: 22, marginBottom: 8 }} value={d.title} placeholder="Process name, e.g. Partner onboarding"
        readOnly={!canEdit} autoFocus={isNew} onChange={(e) => edit({ title: e.target.value })} aria-label="Process name" />

      {stale && (
        <div className="notice" style={{ marginBottom: 10, background: 'var(--late-soft)', borderColor: 'var(--late)' }}>
          Someone else saved a newer version while you were editing.
          <button className="btn sm" onClick={cancel}>Load theirs (drop my changes)</button>
          <span className="muted" style={{ fontSize: 12 }}>or Save to keep yours.</span>
        </div>
      )}

      <div className="row-gap" style={{ marginBottom: 12 }}>
        <div className="seg" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={d.view === v.id} className={d.view === v.id ? 'on' : ''} title={v.hint}
              onClick={() => (canEdit ? edit({ view: v.id }) : setDraft({ ...d, view: v.id }))}>{v.label}</button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>{VIEWS.find((v) => v.id === d.view)?.hint}</span>
        {canEdit && (d.view === 'tree' || d.view === 'mindmap') && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => toDrawing(d.view as 'tree' | 'mindmap')}>Edit as drawing →</button>
        )}
      </div>

      {d.view !== 'canvas' && (
        <div className="proc-split">
          {canEdit && (
            <div className="proc-editor">
              <div className="section-h" style={{ marginBottom: 6 }}>
                Steps <span className="muted">— one per line, indent with Tab or 2 spaces for sub-steps</span>
                {!d.outline.trim() && <button className="btn ghost sm r" onClick={() => edit({ outline: SAMPLE_OUTLINE, title: d.title || 'Partner onboarding' })}>Try an example</button>}
              </div>
              <textarea className="textarea mono outline-input" value={d.outline} spellCheck={false}
                placeholder={'Main step\n  Sub-step\n  Sub-step\nNext main step'}
                onChange={(e) => edit({ outline: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return;
                  e.preventDefault();
                  const el = e.currentTarget; const { selectionStart: s0, selectionEnd: s1, value } = el;
                  const lineStart = value.lastIndexOf('\n', s0 - 1) + 1;
                  const next = e.shiftKey
                    ? value.slice(0, lineStart) + value.slice(lineStart).replace(/^ {1,2}/, '')
                    : value.slice(0, lineStart) + '  ' + value.slice(lineStart);
                  edit({ outline: next });
                  requestAnimationFrame(() => { const shift = e.shiftKey ? -Math.min(2, s0 - lineStart) : 2; el.selectionStart = s0 + shift; el.selectionEnd = s1 + shift; });
                }} />
            </div>
          )}
          <div className="proc-view">
            {d.view === 'bullets' && <OutlineBullets root={root} />}
            {(d.view === 'tree' || d.view === 'mindmap') && (
              root.children.length ? (
                <>
                  <div className="zoom-ctl">
                    <button className="btn ghost sm" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
                    <button className={`btn ghost sm ${zoom === 'fit' ? 'on' : ''}`} onClick={() => setZoom('fit')} title="Fit to the window">{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</button>
                    <button className="btn ghost sm" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
                  </div>
                  <div className={`diagram-scroll ${zoom === 'fit' ? 'fit' : ''}`}><OutlineDiagram ref={svgRef} root={root} kind={d.view} zoom={zoom} /></div>
                </>
              )
                : <div className="empty">Write some steps{canEdit ? ' on the left' : ''} to see the {d.view === 'tree' ? 'tree' : 'mind map'}.</div>
            )}
          </div>
        </div>
      )}

      {d.view === 'canvas' && (
        <Suspense fallback={<div className="empty">Loading the drawing editor…</div>}>
          <ProcessCanvas key={`${proc?.id ?? 'new'}-${canvasKey}`} scene={d.scene} onChange={onCanvasChange} readOnly={!canEdit} apiRef={canvasApi} fit={fitCanvas} />
          {canEdit && <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
            Tips: pick shapes from the toolbar · double-click a shape to type in it · drag from a shape's edge to connect an arrow ·
            colours, fonts and line styles appear on the left when something is selected · flowchart from text: toolbar “More tools” → Mermaid.
          </p>}
        </Suspense>
      )}

      {canEdit && (
        <div className="save-bar">
          <span className="muted" style={{ fontSize: 12.5 }}>{isNew ? 'New process — not saved yet' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" disabled={!dirty || busy} onClick={cancel}>Cancel</button>
            <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </span>
        </div>
      )}
    </div>
  );
}
