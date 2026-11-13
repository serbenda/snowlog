// Copiado de serbenda/sketch (js/escena.js, commit 80f776f) con scripts/update-sketch.mjs. No editar aquí.
// Escena de un dibujo: una lista de elementos con su estilo. Funciones puras (sin DOM) para crear,
// medir, tocar, mover, girar, redimensionar, enlazar, guardar, abrir (también .excalidraw) y
// convertir en trazos.
//
// Además de x, y, w, h y el estilo, un elemento puede llevar:
//   angle        giro en radianes alrededor de su centro (formas y texto)
//   group        id de grupo: se seleccionan y mueven juntos
//   containerId  (texto) forma que lo contiene: va centrado dentro y la sigue
//   startId/endId (flecha) formas a las que va pegada por cada punta

import { polylinePath, ellipsePath, freehandPath, hachurePath, arrowHead } from './sketch-trazo.js';

export const TYPES = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'draw', 'text'];
export const FORMAT = 'sketch';
export const VERSION = 1;
export const LINE_HEIGHT = 1.25;
export const FONT_NAME = 'Sketch Mano';
export const FONT = `"${FONT_NAME}", "Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive`;
const ARROW_GAP = 6;

export const DEFAULT_STYLE = {
  stroke: '#1e1e1e',
  fill: 'transparent',
  fillStyle: 'hachure', // 'hachure' | 'solid'
  width: 2,
  dashed: false,
  roughness: 1,
  opacity: 1,
  fontSize: 24,
};

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function emptyScene() {
  return { type: FORMAT, version: VERSION, elements: [], background: '#ffffff' };
}

export function createElement(type, x, y, style = {}) {
  const el = { id: newId(), type, x, y, w: 0, h: 0, seed: newSeed(), ...DEFAULT_STYLE, ...style };
  if (type === 'draw' || type === 'line' || type === 'arrow') el.points = [{ x: 0, y: 0 }];
  if (type === 'text') el.text = '';
  return el;
}

export const isLinear = (el) => el.type === 'line' || el.type === 'arrow' || el.type === 'draw';
export const isContainer = (el) => el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond';
export const isBoundText = (el) => el.type === 'text' && !!el.containerId;
const isBindable = (el) => isContainer(el) || (el.type === 'text' && !el.containerId);

// --- Texto: medida y líneas ---
// La medida real la pone quien pinta (canvas.measureText); sin DOM se estima.
let measure = (text, fontSize) => text.length * fontSize * 0.5;
// Los elementos no se cambian nunca en el sitio (cada cambio crea uno nuevo), así que su caja se puede
// guardar por objeto. Al cambiar la medida de los textos se empieza de cero.
let boxes = new WeakMap();
export function setTextMeasurer(fn) {
  measure = fn;
  boxes = new WeakMap();
}
export const measureText = (text, fontSize) => measure(text, fontSize);

function wrap(line, width, fontSize) {
  if (measure(line, fontSize) <= width) return [line];
  const out = [];
  let cur = '';
  for (const word of line.split(/(\s+)/)) {
    if (!word) continue;
    const next = cur + word;
    if (measure(next, fontSize) <= width || !cur.trim()) {
      cur = next;
    } else {
      out.push(cur.trimEnd());
      cur = word.trimStart();
    }
    // Palabra mucho más larga que la caja: se parte por letras (si solo se pasa un poco, se deja).
    while (measure(cur, fontSize) > width * 1.6 && cur.length > 1) {
      let n = cur.length - 1;
      while (n > 1 && measure(cur.slice(0, n), fontSize) > width) n--;
      out.push(cur.slice(0, n));
      cur = cur.slice(n);
    }
  }
  out.push(cur.trimEnd());
  return out;
}

// Líneas que se pintan: las del texto, partidas al ancho de la forma si va dentro de una.
export function textLines(el) {
  const raw = String(el.text || '').split('\n');
  if (!el.containerId || !(el.w > 0)) return raw;
  return raw.flatMap((l) => wrap(l, el.w, el.fontSize));
}

// --- Geometría ---
export function rotatePoint(p, c, a) {
  if (!a) return { x: p.x, y: p.y };
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos };
}

// Caja del elemento sin girar: { x, y, w, h } con w y h positivos.
export function bounds(el) {
  let b = boxes.get(el);
  if (!b) {
    b = computeBounds(el);
    boxes.set(el, b);
  }
  return b;
}

function computeBounds(el) {
  if (isLinear(el) && el.points?.length) {
    const xs = el.points.map((p) => el.x + p.x);
    const ys = el.points.map((p) => el.y + p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (el.type === 'text') {
    const lines = textLines(el);
    const w = el.containerId && el.w > 0 ? el.w : Math.max(...lines.map((l) => measure(l, el.fontSize)), el.fontSize * 0.5);
    return { x: el.x, y: el.y, w, h: lines.length * el.fontSize * LINE_HEIGHT };
  }
  return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
}

export function center(el) {
  const b = bounds(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// Esquinas de la caja, ya giradas.
export function corners(el) {
  const b = bounds(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }]
    .map((p) => rotatePoint(p, c, isLinear(el) ? 0 : el.angle || 0));
}

// Caja que ocupa en pantalla (con el giro).
export function aabb(el) {
  if (isLinear(el) || !el.angle) return bounds(el);
  const ps = corners(el);
  const x = Math.min(...ps.map((p) => p.x));
  const y = Math.min(...ps.map((p) => p.y));
  return { x, y, w: Math.max(...ps.map((p) => p.x)) - x, h: Math.max(...ps.map((p) => p.y)) - y };
}

export function sceneBounds(elements) {
  if (!elements.length) return { x: 0, y: 0, w: 0, h: 0 };
  const bs = elements.map(aabb);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Punto en el sistema del elemento sin girar.
function toLocal(el, x, y) {
  if (isLinear(el) || !el.angle) return { x, y };
  return rotatePoint({ x, y }, center(el), -el.angle);
}

// ¿Toca el punto (x, y) el elemento? Las formas sin relleno solo se tocan por el borde.
export function hitTest(el, x, y, tol = 6) {
  ({ x, y } = toLocal(el, x, y));
  const b = bounds(el);
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) return false;
  const filled = el.fill && el.fill !== 'transparent';
  if (el.type === 'text') return true;
  if (isLinear(el)) {
    const pts = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
    if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= tol + el.width;
    return pts.some((p, i) => i > 0 && distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, p.x, p.y) <= tol + el.width / 2);
  }
  if (el.type === 'rectangle') {
    const inside = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (filled && inside) return true;
    const edges = [[b.x, b.y, b.x + b.w, b.y], [b.x + b.w, b.y, b.x + b.w, b.y + b.h], [b.x + b.w, b.y + b.h, b.x, b.y + b.h], [b.x, b.y + b.h, b.x, b.y]];
    return edges.some((e) => distToSegment(x, y, ...e) <= tol);
  }
  if (el.type === 'ellipse') {
    const rx = b.w / 2 || 1;
    const ry = b.h / 2 || 1;
    const d = Math.hypot((x - (b.x + rx)) / rx, (y - (b.y + ry)) / ry);
    if (filled && d <= 1) return true;
    return Math.abs(d - 1) * Math.min(rx, ry) <= tol;
  }
  if (el.type === 'diamond') {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const d = Math.abs(x - cx) / (b.w / 2 || 1) + Math.abs(y - cy) / (b.h / 2 || 1);
    if (filled && d <= 1) return true;
    const pts = diamondPoints(b);
    return pts.some((p, i) => distToSegment(x, y, p.x, p.y, pts[(i + 1) % 4].x, pts[(i + 1) % 4].y) <= tol);
  }
  return false;
}

// ¿Está el punto dentro de la forma (con o sin relleno)?
export function insideShape(el, x, y, tol = 0) {
  if (!isBindable(el)) return false;
  ({ x, y } = toLocal(el, x, y));
  const b = bounds(el);
  const hw = b.w / 2 + tol;
  const hh = b.h / 2 + tol;
  const dx = Math.abs(x - (b.x + b.w / 2));
  const dy = Math.abs(y - (b.y + b.h / 2));
  if (el.type === 'ellipse') return (dx / (hw || 1)) ** 2 + (dy / (hh || 1)) ** 2 <= 1;
  if (el.type === 'diamond') return dx / (hw || 1) + dy / (hh || 1) <= 1;
  return dx <= hw && dy <= hh;
}

function diamondPoints(b) {
  return [
    { x: b.x + b.w / 2, y: b.y }, { x: b.x + b.w, y: b.y + b.h / 2 },
    { x: b.x + b.w / 2, y: b.y + b.h }, { x: b.x, y: b.y + b.h / 2 },
  ];
}

// Elemento de más arriba bajo el punto (el último dibujado).
export function elementAt(elements, x, y, tol) {
  for (let i = elements.length - 1; i >= 0; i--) if (hitTest(elements[i], x, y, tol)) return elements[i];
  return null;
}

// Forma de más arriba que contiene el punto (para escribir dentro o pegar una flecha).
export function shapeAt(elements, x, y, { tol = 0, except = null, containersOnly = false } = {}) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.id === except || (containersOnly && !isContainer(e))) continue;
    if (insideShape(e, x, y, tol)) return e;
  }
  return null;
}

export function elementsInBox(elements, box) {
  const x2 = box.x + box.w;
  const y2 = box.y + box.h;
  return elements.filter((el) => {
    const b = aabb(el);
    return b.x >= Math.min(box.x, x2) && b.y >= Math.min(box.y, y2) && b.x + b.w <= Math.max(box.x, x2) && b.y + b.h <= Math.max(box.y, y2);
  });
}

export function moveElement(el, dx, dy) {
  return { ...el, x: el.x + dx, y: el.y + dy };
}

// Redimensiona para que la caja del elemento pase de `from` a `to` (escala puntos, centros y tamaños).
export function resizeElement(el, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const mapX = (x) => to.x + (x - from.x) * sx;
  const mapY = (y) => to.y + (y - from.y) * sy;
  if (isLinear(el)) {
    const abs = el.points.map((p) => ({ x: mapX(el.x + p.x), y: mapY(el.y + p.y) }));
    return { ...el, x: abs[0].x, y: abs[0].y, points: abs.map((p) => ({ x: p.x - abs[0].x, y: p.y - abs[0].y })) };
  }
  if (el.type === 'text') {
    if (!el.angle) return { ...el, x: mapX(el.x), y: mapY(el.y), fontSize: Math.max(8, Math.round(el.fontSize * Math.abs(sy))) };
    const c = center(el);
    const fontSize = Math.max(8, Math.round(el.fontSize * Math.abs(sy)));
    const t = { ...el, fontSize };
    const b = bounds(t);
    return { ...t, x: mapX(c.x) - b.w / 2, y: mapY(c.y) - b.h / 2 };
  }
  const b = bounds(el);
  const c = center(el);
  const w = b.w * Math.abs(sx);
  const h = b.h * Math.abs(sy);
  return { ...el, x: mapX(c.x) - w / 2, y: mapY(c.y) - h / 2, w, h };
}

// Redimensiona un solo elemento arrastrando un tirador (n, s, e, w, ne…) hasta el punto p, en el
// sistema del propio elemento (sirve igual si está girado).
export function resizeByHandle(el, handle, p, { keepRatio = false } = {}) {
  const b = bounds(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const q = rotatePoint(p, c, -(el.angle || 0));
  let x1 = b.x;
  let y1 = b.y;
  let x2 = b.x + b.w;
  let y2 = b.y + b.h;
  if (handle.includes('w')) x1 = q.x;
  if (handle.includes('e')) x2 = q.x;
  if (handle.includes('n')) y1 = q.y;
  if (handle.includes('s')) y2 = q.y;
  if ((keepRatio || el.type === 'text') && b.w && b.h) {
    const corner = handle.length === 2;
    const k = corner ? Math.max(Math.abs(x2 - x1) / b.w, Math.abs(y2 - y1) / b.h) : handle === 'n' || handle === 's' ? Math.abs(y2 - y1) / b.h : Math.abs(x2 - x1) / b.w;
    const nw = b.w * k;
    const nh = b.h * k;
    if (handle.includes('w')) x1 = x2 - nw; else if (handle.includes('e')) x2 = x1 + nw; else { x1 = c.x - nw / 2; x2 = c.x + nw / 2; }
    if (handle.includes('n')) y1 = y2 - nh; else if (handle.includes('s')) y2 = y1 + nh; else { y1 = c.y - nh / 2; y2 = c.y + nh / 2; }
  }
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  // Centro nuevo, de vuelta al sistema del dibujo.
  const nc = rotatePoint({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, c, el.angle || 0);
  if (el.type === 'text') {
    const t = { ...el, fontSize: Math.max(8, Math.round(el.fontSize * (h / (b.h || 1)))) };
    const tb = bounds(t);
    return { ...t, x: nc.x - tb.w / 2, y: nc.y - tb.h / 2 };
  }
  return { ...el, x: nc.x - w / 2, y: nc.y - h / 2, w, h };
}

const TAU = Math.PI * 2;
const normAngle = (a) => {
  const r = a >= 0 && a < TAU ? a : ((a % TAU) + TAU) % TAU;
  return r < 1e-9 || TAU - r < 1e-9 ? 0 : r;
};

// Gira el elemento `delta` radianes alrededor del punto c.
export function rotateElement(el, c, delta) {
  if (isLinear(el)) {
    const abs = el.points.map((p) => rotatePoint({ x: el.x + p.x, y: el.y + p.y }, c, delta));
    return { ...el, x: abs[0].x, y: abs[0].y, points: abs.map((p) => ({ x: p.x - abs[0].x, y: p.y - abs[0].y })) };
  }
  const b = bounds(el);
  const nc = rotatePoint(center(el), c, delta);
  const angle = normAngle((el.angle || 0) + delta);
  const out = { ...el, x: nc.x - b.w / 2, y: nc.y - b.h / 2 };
  if (angle) out.angle = angle;
  else delete out.angle;
  return out;
}

// Agranda (o encoge) un elemento sin mover su centro. Los textos cambian de tamaño de letra.
export function growElement(el, dw, dh) {
  if (el.type === 'text') {
    const fontSize = clamp(el.fontSize + Math.sign(dw || dh) * 2, 6, 400);
    const c = center(el);
    const t = { ...el, fontSize };
    const b = bounds(t);
    return { ...t, x: c.x - b.w / 2, y: c.y - b.h / 2 };
  }
  const b = bounds(el);
  if (isLinear(el)) return resizeElement(el, b, { x: b.x, y: b.y, w: Math.max(1, b.w + dw), h: Math.max(b.h ? 1 : 0, b.h + dh) });
  const w = Math.max(4, b.w + dw);
  const h = Math.max(4, b.h + dh);
  const c = center(el);
  return { ...el, x: c.x - w / 2, y: c.y - h / 2, w, h };
}

// Normaliza: anchos y altos positivos (tras dibujar hacia arriba o a la izquierda).
export function normalize(el) {
  if (isLinear(el) || el.type === 'text') return el;
  const b = bounds(el);
  return { ...el, x: b.x, y: b.y, w: b.w, h: b.h };
}

export function isEmpty(el) {
  if (el.type === 'text') return !String(el.text || '').trim();
  if (el.type === 'draw') return el.points.length < 2;
  const b = bounds(el);
  return b.w < 2 && b.h < 2;
}

// --- Enlaces: texto dentro de formas y flechas pegadas ---

// Punto del borde de la forma en la dirección de `toward`, separado `gap`.
export function outlinePoint(el, toward, gap = ARROW_GAP) {
  const b = bounds(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const q = toLocal(el, toward.x, toward.y);
  let dx = q.x - c.x;
  let dy = q.y - c.y;
  if (Math.hypot(dx, dy) < 1e-6) { dx = 1; dy = 0; }
  const hw = b.w / 2 || 0.5;
  const hh = b.h / 2 || 0.5;
  let t;
  if (el.type === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (el.type === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const k = t + gap / Math.hypot(dx, dy);
  return rotatePoint({ x: c.x + dx * k, y: c.y + dy * k }, c, isLinear(el) ? 0 : el.angle || 0);
}

// Hueco para el texto dentro de cada forma.
function innerBox(el) {
  const b = bounds(el);
  const k = el.type === 'ellipse' ? Math.SQRT1_2 : el.type === 'diamond' ? 0.5 : 1;
  const pad = 8;
  return { w: Math.max(10, b.w * k - pad * 2), cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

// Vuelve a colocar lo enlazado: textos dentro de su forma y puntas de flecha en el borde de la suya.
// Quita los enlaces a elementos que ya no existen. No cambia el array recibido.
export function syncBindings(elements) {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return elements.map((el) => {
    if (el.type === 'text' && el.containerId) {
      const c = byId.get(el.containerId);
      if (!c || !isContainer(c)) {
        const { containerId, align, ...rest } = el;
        return rest;
      }
      const inner = innerBox(c);
      const t = { ...el, w: inner.w, align: 'center' };
      const h = textLines(t).length * t.fontSize * LINE_HEIGHT;
      const out = { ...t, x: inner.cx - inner.w / 2, y: inner.cy - h / 2 };
      if (c.angle) out.angle = c.angle;
      else delete out.angle;
      return out;
    }
    if ((el.type === 'arrow' || el.type === 'line') && (el.startId || el.endId)) {
      let s = el.startId ? byId.get(el.startId) : null;
      let e = el.endId ? byId.get(el.endId) : null;
      if (s && !isBindable(s)) s = null;
      if (e && (!isBindable(e) || e === s)) e = null;
      const out = { ...el };
      if (!s) delete out.startId;
      if (!e) delete out.endId;
      if (!s && !e) return out;
      const pts = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
      const n = pts.length;
      if (n < 2) return out;
      const refStart = n > 2 ? pts[1] : e ? center(e) : pts[n - 1];
      const refEnd = n > 2 ? pts[n - 2] : s ? center(s) : pts[0];
      if (s) pts[0] = outlinePoint(s, refStart);
      if (e) pts[n - 1] = outlinePoint(e, refEnd);
      out.x = pts[0].x;
      out.y = pts[0].y;
      out.points = pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y }));
      return out;
    }
    return el;
  });
}

// Fusión a tres bandas de dos versiones de un dibujo (la mía y la de otro dispositivo) desde la que
// ambas partieron, elemento a elemento por id. Si los dos cambiaron el mismo elemento de forma
// distinta gana el mío y `conflict` es true (quien llama puede guardar la otra versión aparte).
export function mergeScenes(base, mine, theirs) {
  const key = (e) => JSON.stringify(e);
  const B = new Map(base.elements.map((e) => [e.id, key(e)]));
  const T = new Map(theirs.elements.map((e) => [e.id, e]));
  const M = new Set(mine.elements.map((e) => e.id));
  let conflict = false;
  const out = [];
  for (const m of mine.elements) {
    const t = T.get(m.id);
    const b = B.get(m.id);
    const km = key(m);
    if (!t) {
      // Lo borraron allí: se va si aquí no se tocó; si aquí se cambió, se queda.
      if (b === undefined || km !== b) out.push(m);
      continue;
    }
    const kt = key(t);
    if (km === kt || kt === b) out.push(m);
    else if (km === b) out.push(t);
    else {
      conflict = true;
      out.push(m);
    }
  }
  // Lo nuevo de allí, en su sitio relativo (detrás del elemento que lo precede allí).
  let prev = null;
  for (const t of theirs.elements) {
    if (!M.has(t.id)) {
      const b = B.get(t.id);
      // Si aquí se borró y allí no cambió, sigue borrado.
      if (b === undefined || key(t) !== b) {
        const at = prev ? out.findIndex((e) => e.id === prev) + 1 : 0;
        out.splice(at, 0, t);
      } else {
        continue;
      }
    }
    prev = t.id;
  }
  const bg = mine.background === theirs.background || theirs.background === base.background ? mine.background : theirs.background;
  return { scene: { ...mine, background: bg, elements: syncBindings(out) }, conflict };
}

// Copias de unos elementos, desplazadas: ids nuevos y enlaces y grupos rehechos entre las copias.
export function cloneElements(list, dx = 0, dy = 0) {
  const ids = new Map(list.map((e) => [e.id, newId()]));
  const groups = new Map();
  const gid = (g) => {
    if (!groups.has(g)) groups.set(g, newId());
    return groups.get(g);
  };
  return list.map((e) => {
    const c = { ...structuredClone(e), id: ids.get(e.id), seed: newSeed(), x: e.x + dx, y: e.y + dy };
    if (c.group) c.group = gid(c.group);
    for (const k of ['containerId', 'startId', 'endId']) {
      if (!c[k]) continue;
      if (ids.has(c[k])) c[k] = ids.get(c[k]);
      else delete c[k];
    }
    return c;
  });
}

// --- Abrir y guardar (lo que llega de un fichero se valida: nunca se confía en él) ---
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const COLOR_RE = /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const color = (v, d) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ref = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);

export function cleanElement(raw) {
  if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type)) return null;
  const el = {
    id: ref(raw.id) || newId(),
    type: raw.type,
    x: num(raw.x),
    y: num(raw.y),
    w: num(raw.w),
    h: num(raw.h),
    seed: Math.floor(num(raw.seed, newSeed())) >>> 0,
    stroke: color(raw.stroke, DEFAULT_STYLE.stroke),
    fill: color(raw.fill, DEFAULT_STYLE.fill),
    fillStyle: raw.fillStyle === 'solid' ? 'solid' : 'hachure',
    width: clamp(num(raw.width, 2), 0.5, 40),
    dashed: raw.dashed === true,
    roughness: clamp(num(raw.roughness, 1), 0, 3),
    opacity: clamp(num(raw.opacity, 1), 0.05, 1),
    fontSize: clamp(num(raw.fontSize, 24), 6, 400),
  };
  if (isLinear(el)) {
    const pts = Array.isArray(raw.points) ? raw.points.slice(0, 5000).map((p) => ({ x: num(p?.x), y: num(p?.y) })) : [];
    if (!pts.length) return null;
    el.points = pts;
  } else {
    const angle = normAngle(num(raw.angle));
    if (angle) el.angle = angle;
  }
  if (el.type === 'text') {
    el.text = String(raw.text ?? '').slice(0, 10000);
    if (ref(raw.containerId)) {
      el.containerId = ref(raw.containerId);
      el.align = 'center';
    }
  }
  if (el.type === 'arrow' || el.type === 'line') {
    if (ref(raw.startId)) el.startId = ref(raw.startId);
    if (ref(raw.endId)) el.endId = ref(raw.endId);
  }
  if (ref(raw.group)) el.group = ref(raw.group);
  return el;
}

export function parseScene(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('bad_file');
  }
  if (data?.type === 'excalidraw') return fromExcalidraw(data);
  if (data?.type !== FORMAT || !Array.isArray(data.elements)) throw new Error('bad_file');
  return {
    type: FORMAT,
    version: VERSION,
    background: color(data.background, '#ffffff'),
    elements: syncBindings(data.elements.slice(0, 20000).map(cleanElement).filter(Boolean)),
  };
}

export function serializeScene(scene) {
  return `${JSON.stringify({ type: FORMAT, version: VERSION, background: scene.background, elements: scene.elements })}\n`;
}

// Formato .excalidraw (JSON público): se traducen los tipos y estilos que tienen equivalente.
export function fromExcalidraw(data) {
  const map = { rectangle: 'rectangle', ellipse: 'ellipse', diamond: 'diamond', line: 'line', arrow: 'arrow', freedraw: 'draw', text: 'text' };
  const elements = [];
  for (const e of Array.isArray(data.elements) ? data.elements.slice(0, 20000) : []) {
    if (!e || e.isDeleted || !map[e.type]) continue;
    const el = cleanElement({
      id: e.id,
      type: map[e.type],
      x: e.x,
      y: e.y,
      w: e.width,
      h: e.height,
      angle: e.angle,
      seed: e.seed,
      stroke: e.strokeColor,
      fill: e.backgroundColor,
      fillStyle: e.fillStyle === 'solid' ? 'solid' : 'hachure',
      width: e.strokeWidth,
      dashed: e.strokeStyle === 'dashed' || e.strokeStyle === 'dotted',
      roughness: e.roughness,
      opacity: e.opacity != null ? num(e.opacity, 100) / 100 : 1,
      fontSize: e.fontSize,
      text: e.originalText ?? e.text,
      containerId: e.containerId,
      startId: e.startBinding?.elementId,
      endId: e.endBinding?.elementId,
      group: Array.isArray(e.groupIds) ? e.groupIds[e.groupIds.length - 1] : undefined,
      points: Array.isArray(e.points) ? e.points.map((p) => ({ x: p?.[0], y: p?.[1] })) : undefined,
    });
    if (el) elements.push(el);
  }
  return { type: FORMAT, version: VERSION, background: color(data.appState?.viewBackgroundColor, '#ffffff'), elements: syncBindings(elements) };
}

// --- Elemento → trazos a pintar: [{ path, stroke?, fill?, width, dashed, opacity, clip? }] ---
const turnPath = (path, c, a) => path.map((cmd) => {
  if (cmd.op === 'Z') return cmd;
  const p = rotatePoint(cmd, c, a);
  if (cmd.op !== 'Q') return { ...cmd, x: p.x, y: p.y };
  const q = rotatePoint({ x: cmd.cx, y: cmd.cy }, c, a);
  return { ...cmd, x: p.x, y: p.y, cx: q.x, cy: q.y };
});

export function drawOps(el) {
  const opts = { seed: el.seed, roughness: el.roughness };
  const base = { stroke: el.stroke, width: el.width, dashed: el.dashed, opacity: el.opacity };
  const b = bounds(el);
  const ops = [];
  const filled = el.fill && el.fill !== 'transparent';
  let outline = null;
  let shape = null; // contorno limpio para rellenar o recortar el rayado
  if (el.type === 'rectangle') {
    const pts = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    outline = polylinePath(pts, { ...opts, closed: true });
    shape = [{ op: 'M', ...pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L', ...p })), { op: 'Z' }];
  } else if (el.type === 'diamond') {
    const pts = diamondPoints(b);
    outline = polylinePath(pts, { ...opts, closed: true });
    shape = [{ op: 'M', ...pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L', ...p })), { op: 'Z' }];
  } else if (el.type === 'ellipse') {
    outline = ellipsePath(b.x, b.y, b.w, b.h, opts);
    shape = ellipsePath(b.x, b.y, b.w, b.h, { seed: el.seed, roughness: 0, passes: 1 });
  } else if (el.type === 'draw') {
    ops.push({ ...base, path: freehandPath(el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }))) });
    return ops;
  } else if (el.type === 'line' || el.type === 'arrow') {
    const pts = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
    ops.push({ ...base, path: polylinePath(pts, opts) });
    if (el.type === 'arrow' && pts.length > 1) {
      const a = pts[pts.length - 2];
      const z = pts[pts.length - 1];
      ops.push({ ...base, dashed: false, path: arrowHead(a.x, a.y, z.x, z.y, 10 + el.width * 3, opts) });
    }
    return ops;
  } else {
    return ops;
  }
  if (filled) {
    if (el.fillStyle === 'solid') ops.push({ fill: el.fill, opacity: el.opacity, path: shape });
    else ops.push({ stroke: el.fill, width: Math.max(1, el.width / 2), opacity: el.opacity, path: hachurePath(b.x, b.y, b.w, b.h, opts), clip: shape });
  }
  ops.push({ ...base, path: outline });
  if (!el.angle) return ops;
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return ops.map((op) => ({ ...op, path: turnPath(op.path, c, el.angle), ...(op.clip ? { clip: turnPath(op.clip, c, el.angle) } : {}) }));
}

// Texto → líneas con su posición, anclaje (start | middle) y giro alrededor de c.
export function textLayout(el) {
  const b = bounds(el);
  const lh = el.fontSize * LINE_HEIGHT;
  const mid = el.align === 'center';
  return {
    anchor: mid ? 'middle' : 'start',
    angle: el.angle || 0,
    c: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    lines: textLines(el).map((t, i) => ({ t, x: mid ? b.x + b.w / 2 : b.x, y: b.y + i * lh })),
  };
}
