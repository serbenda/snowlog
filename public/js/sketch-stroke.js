// Copied from serbenda/bsketch (js/stroke.js, commit 0a573ca) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// "Hand-drawn" strokes: turns geometric shapes into paths with a slight wobble, always the same for the
// same shape (seeded pseudo-random generator). Our own implementation.
//
// A path is a list of commands: { op: 'M', x, y } | { op: 'Q', cx, cy, x, y } | { op: 'L', x, y } | { op: 'Z' }.
// It works the same for drawing on a <canvas> and for generating SVG.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wobbly line from (x1,y1) to (x2,y2): a smooth curve with its middle slightly off.
function wobblyLine(rand, x1, y1, x2, y2, rough) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const amp = Math.min(rough * 1.6, len / 12 + 0.3) * rough;
  const j = () => (rand() - 0.5) * 2 * amp;
  const mx = x1 + (x2 - x1) * (0.45 + rand() * 0.1) + j();
  const my = y1 + (y2 - y1) * (0.45 + rand() * 0.1) + j();
  return [
    { op: 'M', x: x1 + j() * 0.5, y: y1 + j() * 0.5 },
    { op: 'Q', cx: mx, cy: my, x: x2 + j() * 0.5, y: y2 + j() * 0.5 },
  ];
}

// Closed or open outline through points: each side is drawn twice (like a pencil).
export function polylinePath(points, { seed = 1, roughness = 1, closed = false, passes = 2 } = {}) {
  const rand = rng(seed);
  const out = [];
  const pts = closed ? [...points, points[0]] : points;
  for (let p = 0; p < (roughness > 0 ? passes : 1); p++) {
    for (let i = 0; i < pts.length - 1; i++) {
      if (roughness > 0) out.push(...wobblyLine(rand, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, roughness));
      else out.push({ op: 'M', x: pts[i].x, y: pts[i].y }, { op: 'L', x: pts[i + 1].x, y: pts[i + 1].y });
    }
  }
  return out;
}

// Ellipse inside the box (x, y, w, h): points around it with some variation, joined with curves.
export function ellipsePath(x, y, w, h, { seed = 1, roughness = 1, passes = 2 } = {}) {
  const rand = rng(seed);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.abs(w) / 2;
  const ry = Math.abs(h) / 2;
  const n = Math.max(12, Math.min(40, Math.round((rx + ry) / 6)));
  const out = [];
  for (let p = 0; p < (roughness > 0 ? passes : 1); p++) {
    const start = rand() * Math.PI * 2;
    const extra = roughness > 0 ? 0.25 + rand() * 0.2 : 0; // overshoots the closing point a little, like a hand would
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = start + (i / n) * (Math.PI * 2 + extra);
      const d = roughness > 0 ? 1 + (rand() - 0.5) * 0.04 * roughness : 1;
      pts.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d });
    }
    out.push({ op: 'M', x: pts[0].x, y: pts[0].y });
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      out.push({ op: 'Q', cx: pts[i].x, cy: pts[i].y, x: mx, y: my });
    }
    const last = pts[pts.length - 1];
    out.push({ op: 'L', x: last.x, y: last.y });
  }
  return out;
}

// Freehand stroke (pencil): a smooth curve through the points, with no added wobble.
export function freehandPath(points) {
  if (!points.length) return [];
  const out = [{ op: 'M', x: points[0].x, y: points[0].y }];
  if (points.length === 1) return [...out, { op: 'L', x: points[0].x + 0.1, y: points[0].y + 0.1 }];
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    out.push({ op: 'Q', cx: points[i].x, cy: points[i].y, x: mx, y: my });
  }
  const last = points[points.length - 1];
  out.push({ op: 'L', x: last.x, y: last.y });
  return out;
}

// Hachure fill: parallel lines at 45° covering the box; clipped to the shape when painted.
export const MAX_HACHURE_LINES = 2000;
export function hachurePath(x, y, w, h, { gap = 8, seed = 1, roughness = 1, maxLines = MAX_HACHURE_LINES } = {}) {
  const rand = rng(seed + 7);
  const out = [];
  const x0 = Math.min(x, x + w);
  const y0 = Math.min(y, y + h);
  const W = Math.abs(w);
  const H = Math.abs(h);
  // Lines x + y = c crossing the box, `gap` apart perpendicularly. A huge box gets wider gaps, so one shape never
  // makes more than MAX_HACHURE_LINES lines (a small file with a giant shape must not hang the page).
  const step = Math.max(gap * Math.SQRT2, (W + H) / Math.max(1, Math.min(MAX_HACHURE_LINES, maxLines)));
  for (let c = x0 + y0 + step / 2; c < x0 + y0 + W + H; c += step) {
    const xa = Math.max(x0, c - (y0 + H));
    const xb = Math.min(x0 + W, c - y0);
    if (xb - xa < 0.5) continue;
    out.push(...wobblyLine(rand, xa, c - xa, xb, c - xb, roughness * 0.6));
  }
  return out;
}

// Arrowhead at (x2,y2) coming from (x1,y1).
export function arrowHead(x1, y1, x2, y2, size, opts) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = Math.min(size, Math.hypot(x2 - x1, y2 - y1) * 0.5);
  const p1 = { x: x2 - s * Math.cos(a - Math.PI / 7), y: y2 - s * Math.sin(a - Math.PI / 7) };
  const p2 = { x: x2 - s * Math.cos(a + Math.PI / 7), y: y2 - s * Math.sin(a + Math.PI / 7) };
  return [...polylinePath([p1, { x: x2, y: y2 }], opts), ...polylinePath([p2, { x: x2, y: y2 }], { ...opts, seed: (opts.seed || 1) + 3 })];
}

// Path → SVG d attribute.
export function toSvgD(path) {
  const f = (n) => Math.round(n * 100) / 100;
  return path.map((c) => {
    if (c.op === 'M') return `M${f(c.x)} ${f(c.y)}`;
    if (c.op === 'L') return `L${f(c.x)} ${f(c.y)}`;
    if (c.op === 'Q') return `Q${f(c.cx)} ${f(c.cy)} ${f(c.x)} ${f(c.y)}`;
    return 'Z';
  }).join(' ');
}

// Path → commands on a 2D canvas context (or a Path2D).
export function tracePath(ctx, path) {
  for (const c of path) {
    if (c.op === 'M') ctx.moveTo(c.x, c.y);
    else if (c.op === 'L') ctx.lineTo(c.x, c.y);
    else if (c.op === 'Q') ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
    else ctx.closePath();
  }
}
