// Copiado de serbenda/sketch (js/trazo.js, commit 80f776f) con scripts/update-sketch.mjs. No editar aquí.
// Trazo "a mano": convierte formas geométricas en caminos con un ligero temblor, siempre igual
// para la misma figura (generador pseudoaleatorio con semilla). Implementación propia.
//
// Un camino es una lista de órdenes: { op: 'M', x, y } | { op: 'Q', cx, cy, x, y } | { op: 'L', x, y } | { op: 'Z' }.
// Sirve igual para dibujar en un <canvas> que para generar SVG.

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

// Línea temblorosa de (x1,y1) a (x2,y2): una curva suave con el centro algo desviado.
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

// Contorno cerrado o abierto por puntos: cada lado se dibuja dos veces (como a lápiz).
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

// Elipse dentro de la caja (x, y, w, h): puntos alrededor con algo de variación, unidos con curvas.
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
    const extra = roughness > 0 ? 0.25 + rand() * 0.2 : 0; // se pasa un poco del cierre, como al dibujar
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

// Trazo libre (lápiz): curva suave que pasa por los puntos, sin temblor añadido.
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

// Rayado de relleno: líneas paralelas a 45° que cubren la caja; se recortan con la forma al pintar.
export function hachurePath(x, y, w, h, { gap = 8, seed = 1, roughness = 1 } = {}) {
  const rand = rng(seed + 7);
  const out = [];
  const x0 = Math.min(x, x + w);
  const y0 = Math.min(y, y + h);
  const W = Math.abs(w);
  const H = Math.abs(h);
  // Rectas x + y = c que cruzan la caja, separadas `gap` en perpendicular.
  const step = gap * Math.SQRT2;
  for (let c = x0 + y0 + step / 2; c < x0 + y0 + W + H; c += step) {
    const xa = Math.max(x0, c - (y0 + H));
    const xb = Math.min(x0 + W, c - y0);
    if (xb - xa < 0.5) continue;
    out.push(...wobblyLine(rand, xa, c - xa, xb, c - xb, roughness * 0.6));
  }
  return out;
}

// Punta de flecha en (x2,y2) viniendo de (x1,y1).
export function arrowHead(x1, y1, x2, y2, size, opts) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = Math.min(size, Math.hypot(x2 - x1, y2 - y1) * 0.5);
  const p1 = { x: x2 - s * Math.cos(a - Math.PI / 7), y: y2 - s * Math.sin(a - Math.PI / 7) };
  const p2 = { x: x2 - s * Math.cos(a + Math.PI / 7), y: y2 - s * Math.sin(a + Math.PI / 7) };
  return [...polylinePath([p1, { x: x2, y: y2 }], opts), ...polylinePath([p2, { x: x2, y: y2 }], { ...opts, seed: (opts.seed || 1) + 3 })];
}

// Camino → atributo d de SVG.
export function toSvgD(path) {
  const f = (n) => Math.round(n * 100) / 100;
  return path.map((c) => {
    if (c.op === 'M') return `M${f(c.x)} ${f(c.y)}`;
    if (c.op === 'L') return `L${f(c.x)} ${f(c.y)}`;
    if (c.op === 'Q') return `Q${f(c.cx)} ${f(c.cy)} ${f(c.x)} ${f(c.y)}`;
    return 'Z';
  }).join(' ');
}

// Camino → órdenes sobre un contexto 2D de canvas (o un Path2D).
export function tracePath(ctx, path) {
  for (const c of path) {
    if (c.op === 'M') ctx.moveTo(c.x, c.y);
    else if (c.op === 'L') ctx.lineTo(c.x, c.y);
    else if (c.op === 'Q') ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
    else ctx.closePath();
  }
}
