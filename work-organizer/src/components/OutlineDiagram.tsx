import { forwardRef } from 'react';
import { BRANCH_COLORS, mindmapLayout, nodeColor, treeLayout, type Layout, type ONode } from '../lib/outline';

const FONT = "'Geist', system-ui, sans-serif";

function Links({ layout, kind }: { layout: Layout; kind: 'tree' | 'mindmap' }) {
  return (
    <>
      {layout.links.map((k, i) => {
        const c = nodeColor(k.to.node);
        if (kind === 'tree') {
          const x1 = k.from.x + k.from.w / 2; const y1 = k.from.y + k.from.h;
          const x2 = k.to.x + k.to.w / 2; const y2 = k.to.y;
          const my = (y1 + y2) / 2;
          return <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 6}`} fill="none" stroke={c} strokeWidth={1.6} markerEnd={`url(#arr-${Math.max(0, BRANCH_COLORS.indexOf(c))})`} />;
        }
        const right = k.to.x > k.from.x;
        const x1 = right ? k.from.x + k.from.w : k.from.x; const y1 = k.from.y + k.from.h / 2;
        const x2 = right ? k.to.x : k.to.x + k.to.w; const y2 = k.to.y + k.to.h / 2;
        const mx = (x1 + x2) / 2;
        return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={c} strokeWidth={k.from.node.depth === 0 ? 2.4 : 1.6} />;
      })}
    </>
  );
}

/** Read-only SVG of an outline as a tree or mind map (also used for export). */
export const OutlineDiagram = forwardRef<SVGSVGElement, { root: ONode; kind: 'tree' | 'mindmap'; zoom?: number | 'fit' }>(({ root, kind, zoom = 1 }, ref) => {
  const layout = kind === 'tree' ? treeLayout(root) : mindmapLayout(root);
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={zoom === 'fit' ? layout.width : layout.width * zoom} height={zoom === 'fit' ? layout.height : layout.height * zoom}
      viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`} role="img" aria-label={`${kind === 'tree' ? 'Tree diagram' : 'Mind map'}: ${root.text}`}
      style={zoom === 'fit' ? { display: 'block', width: '100%', height: 'auto' } : { maxWidth: 'none', display: 'block' }}>
      <defs>
        {[...BRANCH_COLORS, '#1A1A19'].map((c, i) => (
          <marker key={c} id={`arr-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <rect x={layout.minX} y={layout.minY} width={layout.width} height={layout.height} fill="#ffffff" />
      <Links layout={layout} kind={kind} />
      {layout.boxes.map((b) => {
        const c = nodeColor(b.node);
        const root = b.node.depth === 0;
        return (
          <g key={b.node.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={root ? 12 : 8}
              fill={root ? '#1A1A19' : b.node.depth === 1 ? c : '#ffffff'} stroke={c} strokeWidth={root ? 0 : 1.5} />
            {b.lines.map((line, i) => (
              <text key={i} x={b.x + b.w / 2} y={b.y + 10 + (root ? 4 : 0) + 13 + i * 18} textAnchor="middle"
                fontFamily={FONT} fontSize={root ? 15 : 13} fontWeight={root || b.node.depth === 1 ? 600 : 400}
                fill={root || b.node.depth === 1 ? '#ffffff' : '#1A1A19'}>{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
});
OutlineDiagram.displayName = 'OutlineDiagram';

/** Bullet view of the outline, nested and numbered by branch colour. */
export function OutlineBullets({ root }: { root: ONode }) {
  const render = (n: ONode) => (
    <li key={n.id}>
      <span className="ob-text" style={{ borderLeftColor: nodeColor(n) }}>{n.text}</span>
      {n.children.length > 0 && <ul>{n.children.map(render)}</ul>}
    </li>
  );
  return (
    <div className="outline-bullets">
      <h2>{root.text}</h2>
      {root.children.length ? <ul>{root.children.map(render)}</ul> : <p className="muted">Nothing here yet — write your steps in the outline.</p>}
    </div>
  );
}
