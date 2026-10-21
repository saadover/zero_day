// Bullet-point outline → tree / mind-map layouts → editable drawing.

export interface ONode { id: string; text: string; children: ONode[]; depth: number; branch: number }
export interface Placed { node: ONode; x: number; y: number; w: number; h: number; lines: string[] }
export interface Layout { boxes: Placed[]; links: { from: Placed; to: Placed }[]; width: number; height: number; minX: number; minY: number }

export const BRANCH_COLORS = ['#2F5FD0', '#0F766E', '#B4441B', '#7C3AED', '#BE185D', '#4D7C0F', '#A16207', '#0369A1'];

/** "- item" lines with indentation (2 spaces or a tab per level). The first top line is the centre. */
export function parseOutline(text: string, fallbackTitle: string): ONode {
  let seq = 0;
  const rows = text.split(/\r?\n/).map((raw) => {
    const indentRaw = raw.match(/^[\t ]*/)?.[0] ?? '';
    const indent = indentRaw.replace(/\t/g, '  ').length;
    const bulleted = /^([-*•+]|\d+[.)])\s+/.test(raw.trim());
    const label = raw.trim().replace(/^([-*•+]|\d+[.)])\s+/, '').trim();
    return { indent, label, bulleted };
  }).filter((r) => r.label);

  const root: ONode = { id: 'n0', text: fallbackTitle || 'Process', children: [], depth: 0, branch: -1 };
  const tops = rows.filter((r) => r.indent === Math.min(...rows.map((x) => x.indent)));
  let start = 0;
  // A first line without a bullet, followed by bullets, is the title/centre.
  if ((tops.length === 1 && rows.length) || (rows.length > 1 && !rows[0].bulleted && rows[1].bulleted)) { root.text = rows[0].label; start = 1; }

  const stack: { indent: number; node: ONode }[] = [{ indent: -1, node: root }];
  for (const r of rows.slice(start)) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= r.indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const node: ONode = { id: `n${++seq}`, text: r.label, children: [], depth: parent.depth + 1, branch: parent.depth === 0 ? parent.children.length : parent.branch };
    parent.children.push(node);
    stack.push({ indent: r.indent, node });
  }
  return root;
}

let CHAR_W = 7.1;
const LINE_H = 18;
const PAD_X = 14;
const PAD_Y = 10;

function wrap(text: string, max = 24): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function measure(n: ONode) {
  const lines = wrap(n.text, n.depth === 0 ? 22 : 26);
  const w = Math.max(...lines.map((l) => l.length)) * CHAR_W + PAD_X * 2 + (n.depth === 0 ? 12 : 0);
  return { lines, w: Math.max(w, 70), h: lines.length * LINE_H + PAD_Y * 2 + (n.depth === 0 ? 8 : 0) };
}

function bounds(boxes: Placed[], links: Layout['links']): Layout {
  const minX = Math.min(...boxes.map((b) => b.x)) - 30;
  const minY = Math.min(...boxes.map((b) => b.y)) - 30;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 30;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 30;
  return { boxes, links, minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Top-down tree: leaves side by side, parents centred above their children. */
export function treeLayout(root: ONode, charW = 7.1): Layout {
  CHAR_W = charW;
  const boxes: Placed[] = [];
  const links: Layout['links'] = [];
  const GAP_X = 24;
  const levelH: number[] = [];
  const walkH = (n: ONode) => { const m = measure(n); levelH[n.depth] = Math.max(levelH[n.depth] ?? 0, m.h); n.children.forEach(walkH); };
  walkH(root);
  const levelY = levelH.reduce<number[]>((acc, _h, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + levelH[i - 1] + 64); return acc; }, []);
  let cursor = 0;
  const place = (n: ONode): Placed => {
    const m = measure(n);
    let x: number;
    const kids = n.children.map(place);
    if (!kids.length) { x = cursor; cursor += m.w + GAP_X; }
    else {
      const left = kids[0].x + kids[0].w / 2;
      const right = kids[kids.length - 1].x + kids[kids.length - 1].w / 2;
      x = (left + right) / 2 - m.w / 2;
      if (x < cursor - m.w - GAP_X && kids.length === 1) x = kids[0].x;
    }
    const p: Placed = { node: n, x, y: levelY[n.depth], w: m.w, h: m.h, lines: m.lines };
    boxes.push(p);
    kids.forEach((k) => links.push({ from: p, to: k }));
    return p;
  };
  place(root);
  return bounds(boxes, links);
}

/** Mind map: centre in the middle, branches split to the right and left. */
export function mindmapLayout(root: ONode, charW = 7.1): Layout {
  CHAR_W = charW;
  const boxes: Placed[] = [];
  const links: Layout['links'] = [];
  const COL = 70;
  const GAP_Y = 14;
  const leaves = (n: ONode): number => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
  // Balance branches between the two sides by size.
  const right: ONode[] = []; const left: ONode[] = [];
  let r = 0; let l = 0;
  for (const c of root.children) { if (r <= l) { right.push(c); r += leaves(c); } else { left.push(c); l += leaves(c); } }

  const rm = measure(root);
  const rootBox: Placed = { node: root, x: -rm.w / 2, y: -rm.h / 2, w: rm.w, h: rm.h, lines: rm.lines };
  boxes.push(rootBox);

  const side = (list: ONode[], dir: 1 | -1) => {
    let cursor = 0;
    const out: Placed[] = [];
    const place = (n: ONode, parentEdge: number): Placed => {
      const m = measure(n);
      const x = dir === 1 ? parentEdge + COL : parentEdge - COL - m.w;
      const kids = n.children.map((c) => place(c, dir === 1 ? x + m.w : x));
      let y: number;
      if (!kids.length) { y = cursor; cursor += m.h + GAP_Y; }
      else y = (kids[0].y + kids[kids.length - 1].y + kids[kids.length - 1].h) / 2 - m.h / 2;
      const p: Placed = { node: n, x, y, w: m.w, h: m.h, lines: m.lines };
      out.push(p);
      kids.forEach((k) => links.push({ from: p, to: k }));
      return p;
    };
    const tops = list.map((n) => place(n, dir === 1 ? rootBox.x + rootBox.w : rootBox.x));
    const shift = -cursor / 2;
    out.forEach((p) => { p.y += shift; });
    tops.forEach((t) => links.push({ from: rootBox, to: t }));
    boxes.push(...out);
  };
  side(right, 1);
  side(left, -1);
  return bounds(boxes, links);
}

export const nodeColor = (n: ONode) => (n.depth === 0 ? '#1A1A19' : BRANCH_COLORS[Math.max(0, n.branch) % BRANCH_COLORS.length]);

/** Character width used when laying out for the drawing editor (its fonts are larger than the preview's). */
export const DRAWING_CHAR_W = 9.6;

/** Turn a layout into Excalidraw "skeleton" elements (boxes with labels + bound arrows). Lay out with DRAWING_CHAR_W. */
export function layoutToSkeleton(layout: Layout, kind: 'tree' | 'mindmap') {
  const els: Record<string, unknown>[] = [];
  for (const b of layout.boxes) {
    const color = nodeColor(b.node);
    els.push({
      type: 'rectangle', id: b.node.id, x: b.x, y: b.y, width: b.w + 10, height: b.h + 6,
      strokeColor: color, backgroundColor: b.node.depth === 0 ? '#e9ecef' : `${color}1f`, fillStyle: 'solid',
      roundness: { type: 3 }, strokeWidth: b.node.depth === 0 ? 2 : 1,
      label: { text: b.lines.join('\n'), fontSize: b.node.depth === 0 ? 18 : 16, fontFamily: 2, strokeColor: '#1e1e1e' },
    });
  }
  for (const [i, k] of layout.links.entries()) {
    const fx = kind === 'tree' ? k.from.x + k.from.w / 2 : k.to.x > k.from.x ? k.from.x + k.from.w : k.from.x;
    const fy = kind === 'tree' ? k.from.y + k.from.h : k.from.y + k.from.h / 2;
    const tx = kind === 'tree' ? k.to.x + k.to.w / 2 : k.to.x > k.from.x ? k.to.x : k.to.x + k.to.w;
    const ty = kind === 'tree' ? k.to.y : k.to.y + k.to.h / 2;
    els.push({
      type: 'arrow', id: `a${i}`, x: fx, y: fy, width: tx - fx, height: ty - fy, points: [[0, 0], [tx - fx, ty - fy]],
      strokeColor: nodeColor(k.to.node), start: { id: k.from.node.id }, end: { id: k.to.node.id },
    });
  }
  return els;
}

export const SAMPLE_OUTLINE = `Partner onboarding
- Receive request
  - Check the partner is in the CRM
  - Ask for missing documents
- Prepare the contract
  - Draft from template
  - Legal review
  - Signature
- Set up access
  - Create accounts
  - Send welcome pack
- Follow up after 2 weeks`;
