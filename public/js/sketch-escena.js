// Copiado de serbenda/sketch (js/escena.js, commit db44696) con scripts/update-sketch.mjs. No editar aquí.
// Escena de un dibujo: una lista de elementos con su estilo. Funciones puras (sin DOM) para crear,
// medir, tocar, mover, redimensionar, guardar, abrir (también .excalidraw) y convertir en trazos.

import { polylinePath, ellipsePath, freehandPath, hachurePath, arrowHead } from './sketch-trazo.js';

export const TYPES = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'draw', 'text'];
export const FORMAT = 'sketch';
export const VERSION = 1;

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

const isLinear = (el) => el.type === 'line' || el.type === 'arrow' || el.type === 'draw';

// Caja que ocupa el elemento: { x, y, w, h } con w y h positivos.
export function bounds(el) {
  if (isLinear(el) && el.points?.length) {
    const xs = el.points.map((p) => el.x + p.x);
    const ys = el.points.map((p) => el.y + p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (el.type === 'text') {
    const lines = String(el.text || '').split('\n');
    const w = Math.max(...lines.map((l) => l.length), 1) * el.fontSize * 0.55;
    return { x: el.x, y: el.y, w, h: lines.length * el.fontSize * 1.25 };
  }
  return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
}

export function sceneBounds(elements) {
  if (!elements.length) return { x: 0, y: 0, w: 0, h: 0 };
  const bs = elements.map(bounds);
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

// ¿Toca el punto (x, y) el elemento? Las formas sin relleno solo se tocan por el borde.
export function hitTest(el, x, y, tol = 6) {
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

export function elementsInBox(elements, box) {
  const x2 = box.x + box.w;
  const y2 = box.y + box.h;
  return elements.filter((el) => {
    const b = bounds(el);
    return b.x >= Math.min(box.x, x2) && b.y >= Math.min(box.y, y2) && b.x + b.w <= Math.max(box.x, x2) && b.y + b.h <= Math.max(box.y, y2);
  });
}

export function moveElement(el, dx, dy) {
  return { ...el, x: el.x + dx, y: el.y + dy };
}

// Redimensiona para que la caja del elemento pase de `from` a `to` (escala puntos y tamaños).
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
    return { ...el, x: mapX(el.x), y: mapY(el.y), fontSize: Math.max(8, Math.round(el.fontSize * Math.abs(sy))) };
  }
  const b = bounds(el);
  return { ...el, x: mapX(b.x), y: mapY(b.y), w: b.w * sx, h: b.h * sy };
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

// --- Abrir y guardar (lo que llega de un fichero se valida: nunca se confía en él) ---
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const COLOR_RE = /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const color = (v, d) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function cleanElement(raw) {
  if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type)) return null;
  const el = {
    id: typeof raw.id === 'string' && raw.id.length <= 64 ? raw.id : newId(),
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
  }
  if (el.type === 'text') el.text = String(raw.text ?? '').slice(0, 10000);
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
    elements: data.elements.slice(0, 20000).map(cleanElement).filter(Boolean),
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
      seed: e.seed,
      stroke: e.strokeColor,
      fill: e.backgroundColor,
      fillStyle: e.fillStyle === 'solid' ? 'solid' : 'hachure',
      width: e.strokeWidth,
      dashed: e.strokeStyle === 'dashed' || e.strokeStyle === 'dotted',
      roughness: e.roughness,
      opacity: e.opacity != null ? num(e.opacity, 100) / 100 : 1,
      fontSize: e.fontSize,
      text: e.text ?? e.originalText,
      points: Array.isArray(e.points) ? e.points.map((p) => ({ x: p?.[0], y: p?.[1] })) : undefined,
    });
    if (el) elements.push(el);
  }
  return { type: FORMAT, version: VERSION, background: color(data.appState?.viewBackgroundColor, '#ffffff'), elements };
}

// --- Elemento → trazos a pintar: [{ path, stroke?, fill?, width, dashed, opacity, clip? }] y textos ---
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
  return ops;
}

export const FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive';
