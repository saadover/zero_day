// Downloads: CSV (opens in Excel), PDF (jsPDF, loaded only when used), PNG/SVG pictures of processes.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutlineDiagram } from '../components/OutlineDiagram';
import { parseOutline, type ONode } from './outline';
import type { Process } from './types';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => (s || 'export').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';

/* ---------- tables ---------- */

export interface Table { title: string; subtitle?: string; columns: string[]; rows: (string | number)[][] }

export function tableToCsv(t: Table): Blob {
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns, ...t.rows].map((r) => r.map(cell).join(','));
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads accents
}

async function newPdf(landscape: boolean) {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
}

type Pdf = Awaited<ReturnType<typeof newPdf>>;

function pdfHeader(doc: Pdf, title: string, subtitle?: string) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(26, 26, 25);
  doc.text(title, 40, 48);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 105);
  doc.text(subtitle ? `${subtitle}  ·  exported ${new Date().toLocaleString()}` : `Exported ${new Date().toLocaleString()}`, 40, 64);
  return 82;
}

function pdfFooter(doc: Pdf) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150, 150, 145);
    doc.text(`Work Organizer  ·  ${i} / ${n}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
}

export async function tableToPdf(t: Table): Promise<Blob> {
  const doc = await newPdf(t.columns.length > 6);
  const { default: autoTable } = await import('jspdf-autotable');
  const y = pdfHeader(doc, t.title, t.subtitle);
  autoTable(doc, {
    startY: y, head: [t.columns], body: t.rows.map((r) => r.map(String)),
    styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', textColor: [30, 30, 28] },
    headStyles: { fillColor: [26, 26, 25], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 246, 243] },
    margin: { left: 40, right: 40 },
  });
  if (!t.rows.length) { doc.setFontSize(10); doc.text('Nothing matched.', 40, y + 40); }
  pdfFooter(doc);
  return doc.output('blob');
}

/* ---------- meetings (one block per meeting) ---------- */

export interface DocSection { title: string; meta?: string; parts: { label: string; text: string }[] }

export async function sectionsToPdf(title: string, subtitle: string, sections: DocSection[]): Promise<Blob> {
  const doc = await newPdf(false);
  const W = doc.internal.pageSize.getWidth() - 80;
  const H = doc.internal.pageSize.getHeight() - 50;
  let y = pdfHeader(doc, title, subtitle);
  const need = (h: number) => { if (y + h > H) { doc.addPage(); y = 50; } };
  for (const s of sections) {
    need(40);
    doc.setDrawColor(220, 220, 215); doc.line(40, y, 40 + W, y); y += 18;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(26, 26, 25);
    for (const l of doc.splitTextToSize(s.title, W)) { need(16); doc.text(l, 40, y); y += 16; }
    if (s.meta) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 105); need(14); doc.text(s.meta, 40, y); y += 16; }
    for (const p of s.parts) {
      if (!p.text.trim()) continue;
      need(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(80, 80, 75); doc.text(p.label.toUpperCase(), 40, y); y += 13;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 28);
      for (const l of doc.splitTextToSize(p.text, W)) { need(13); doc.text(l, 40, y); y += 13; }
      y += 6;
    }
    y += 8;
  }
  if (!sections.length) { doc.setFontSize(10); doc.text('Nothing matched.', 40, y + 20); }
  pdfFooter(doc);
  return doc.output('blob');
}

/* ---------- processes ---------- */

export type Picture = 'saved' | 'tree' | 'mindmap' | 'canvas';
export const PICTURES: { id: Picture; label: string }[] = [
  { id: 'saved', label: 'As it was saved' },
  { id: 'tree', label: 'Tree' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'canvas', label: 'Drawing' },
];

const hasDrawing = (p: Process) => (p.scene?.elements ?? []).some((e) => !(e as { isDeleted?: boolean }).isDeleted);

/** Which picture a process actually gets: falls back when it has no drawing / no steps. */
export function pictureFor(p: Process, want: Picture): 'tree' | 'mindmap' | 'canvas' | null {
  const steps = parseOutline(p.outline, p.title).children.length > 0;
  const pick = want === 'saved' ? (p.view === 'bullets' ? 'tree' : p.view) : want;
  if (pick === 'canvas') return hasDrawing(p) ? 'canvas' : steps ? 'tree' : null;
  return steps ? pick : hasDrawing(p) ? 'canvas' : null;
}

function diagramSvg(p: Process, kind: 'tree' | 'mindmap'): string {
  const root = parseOutline(p.outline, p.title);
  return renderToStaticMarkup(createElement(OutlineDiagram, { root, kind }));
}

async function drawingSvg(p: Process): Promise<SVGSVGElement> {
  const { exportToSvg, restoreElements } = await import('@excalidraw/excalidraw');
  return exportToSvg({
    elements: restoreElements((p.scene?.elements ?? []) as never, null).filter((e) => !e.isDeleted),
    appState: { exportBackground: true, viewBackgroundColor: (p.scene?.appState?.viewBackgroundColor as string) || '#ffffff', exportWithDarkMode: false },
    files: null,
    exportPadding: 24,
  });
}

/** SVG text of the process picture. */
export async function processSvg(p: Process, want: Picture): Promise<string | null> {
  const kind = pictureFor(p, want);
  if (!kind) return null;
  if (kind === 'canvas') return new XMLSerializer().serializeToString(await drawingSvg(p));
  return diagramSvg(p, kind);
}

/** Rasterise an SVG string to a PNG (2× for sharpness). */
export async function svgToPng(svg: string, scale = 2): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('Could not draw the picture')); img.src = url; });
    const width = img.naturalWidth || 800; const height = img.naturalHeight || 600;
    const c = document.createElement('canvas');
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
    return { blob, dataUrl: c.toDataURL('image/jpeg', 0.9), width, height }; // JPEG keeps PDFs small (white background)
  } finally { URL.revokeObjectURL(url); }
}

export async function processPng(p: Process, want: Picture) {
  const svg = await processSvg(p, want);
  return svg ? (await svgToPng(svg)).blob : null;
}

function outlineLines(n: ONode, depth = 0, out: { depth: number; text: string }[] = []) {
  for (const c of n.children) { out.push({ depth, text: c.text }); outlineLines(c, depth + 1, out); }
  return out;
}

/** One PDF with a page (or more) per process: title, picture, then the step list. */
export async function processesToPdf(list: Process[], want: Picture, opts: { picture: boolean; steps: boolean }): Promise<Blob> {
  const doc = await newPdf(true);
  const PW = doc.internal.pageSize.getWidth(); const PH = doc.internal.pageSize.getHeight();
  for (const [i, p] of list.entries()) {
    if (i > 0) doc.addPage();
    let y = pdfHeader(doc, p.title || 'Untitled process', `Last edited ${new Date(p.updated_at).toLocaleDateString()}`);
    if (opts.picture) {
      const svg = await processSvg(p, want);
      if (svg) {
        const png = await svgToPng(svg);
        const maxW = PW - 80; const maxH = PH - y - 40;
        const k = Math.min(maxW / png.width, maxH / png.height, 1.4);
        doc.addImage(png.dataUrl, 'JPEG', 40 + (maxW - png.width * k) / 2, y, png.width * k, png.height * k);
        y = PH; // steps go on the next page
      }
    }
    if (opts.steps) {
      const lines = outlineLines(parseOutline(p.outline, p.title));
      if (lines.length) {
        if (y > PH - 80) { doc.addPage(); y = 50; doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(26, 26, 25); doc.text(`${p.title} — steps`, 40, y); y += 24; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30, 30, 28);
        for (const l of lines) {
          const x = 48 + l.depth * 18;
          for (const [j, t] of (doc.splitTextToSize(l.text, PW - x - 50) as string[]).entries()) {
            if (y > PH - 40) { doc.addPage(); y = 50; }
            if (j === 0) doc.text(l.depth === 0 ? '•' : '–', x - 10, y);
            doc.text(t, x, y); y += 15;
          }
        }
      }
    }
  }
  pdfFooter(doc);
  return doc.output('blob');
}
