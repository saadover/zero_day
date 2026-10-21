// A light SVG preview of a saved drawing (no need to load the full editor for a list of cards).

interface El {
  type: string; x: number; y: number; width: number; height: number; angle?: number; isDeleted?: boolean;
  strokeColor?: string; backgroundColor?: string; strokeWidth?: number; roundness?: unknown; opacity?: number;
  points?: [number, number][]; text?: string; fontSize?: number; textAlign?: string; endArrowhead?: string | null;
}

const fill = (c?: string) => (!c || c === 'transparent' ? 'none' : c);

export function DrawingThumb({ elements }: { elements: unknown[] }) {
  const els = (elements as El[]).filter((e) => e && !e.isDeleted && typeof e.x === 'number');
  if (!els.length) return null;
  // Bounds (lines/arrows can extend beyond x/y via their points)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    const pts = e.points?.length ? e.points.map(([px, py]) => [e.x + px, e.y + py]) : [[e.x, e.y], [e.x + e.width, e.y + e.height]];
    for (const [px, py] of pts) { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); }
  }
  const pad = 20;
  const w = Math.max(maxX - minX, 1) + pad * 2;
  const h = Math.max(maxY - minY, 1) + pad * 2;
  const colors = [...new Set(els.filter((e) => e.type === 'arrow').map((e) => e.strokeColor ?? '#1e1e1e'))];

  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Drawing preview"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        {colors.map((c, i) => (
          <marker key={c} id={`dt-arr-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10" fill="none" stroke={c} strokeWidth="1.6" />
          </marker>
        ))}
      </defs>
      {els.map((e, i) => {
        const stroke = e.strokeColor ?? '#1e1e1e';
        const sw = e.strokeWidth ?? 1;
        const rot = e.angle ? `rotate(${(e.angle * 180) / Math.PI} ${e.x + e.width / 2} ${e.y + e.height / 2})` : undefined;
        const common = { stroke, strokeWidth: sw, fill: fill(e.backgroundColor), opacity: (e.opacity ?? 100) / 100, transform: rot };
        switch (e.type) {
          case 'rectangle': case 'frame': case 'embeddable':
            return <rect key={i} x={e.x} y={e.y} width={e.width} height={e.height} rx={e.roundness ? Math.min(16, e.width / 4, e.height / 4) : 0} {...common} />;
          case 'ellipse':
            return <ellipse key={i} cx={e.x + e.width / 2} cy={e.y + e.height / 2} rx={e.width / 2} ry={e.height / 2} {...common} />;
          case 'diamond':
            return <polygon key={i} points={`${e.x + e.width / 2},${e.y} ${e.x + e.width},${e.y + e.height / 2} ${e.x + e.width / 2},${e.y + e.height} ${e.x},${e.y + e.height / 2}`} {...common} />;
          case 'line': case 'arrow': case 'freedraw': {
            const pts = (e.points ?? []).map(([px, py]) => `${e.x + px},${e.y + py}`).join(' ');
            const arrow = e.type === 'arrow' && e.endArrowhead !== null;
            return <polyline key={i} points={pts} {...common} fill="none" strokeLinecap="round" strokeLinejoin="round"
              markerEnd={arrow ? `url(#dt-arr-${colors.indexOf(stroke)})` : undefined} />;
          }
          case 'text': {
            const fs = e.fontSize ?? 16;
            const lines = (e.text ?? '').split('\n');
            const anchor = e.textAlign === 'center' ? 'middle' : e.textAlign === 'right' ? 'end' : 'start';
            const tx = anchor === 'middle' ? e.x + e.width / 2 : anchor === 'end' ? e.x + e.width : e.x;
            return (
              <text key={i} x={tx} y={e.y} fontSize={fs} fill={stroke} textAnchor={anchor} dominantBaseline="hanging"
                fontFamily="'Geist', system-ui, sans-serif" transform={rot} opacity={(e.opacity ?? 100) / 100}>
                {lines.map((l, j) => <tspan key={j} x={tx} dy={j === 0 ? 0 : fs * 1.25}>{l}</tspan>)}
              </text>
            );
          }
          default:
            return null;
        }
      })}
    </svg>
  );
}
