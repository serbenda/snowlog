// Copied from serbenda/bsketch (js/scene.js, commit fe1613f) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// A drawing's scene: a list of elements with their style. Pure functions (no DOM) to create, measure,
// hit-test, move, rotate, resize, bind, save, open (also .excalidraw) and turn into strokes.
//
// Besides x, y, w, h and the style, an element can have:
//   angle         rotation in radians around its center (shapes and text)
//   group         group id: selected and moved together
//   containerId   (text) the shape that holds it: centered inside, follows it
//   startId/endId (arrow) the shapes each end is attached to
//   fileId        (image) its picture, kept once per scene in `scene.files` as a data: URL
//   name          (frame) the frame's title, shown above it
//   animated      (arrow, line) true: its dashes move along it, showing a flow
//   dotted        true (with dashed): a dotted line instead of a dashed one
//   rounded       (rectangle) true: round corners
//   bend          (curved arrow, line) how far it bends, as a share of its length (DEFAULT_BEND when missing)
//   locked        true: can't be selected, moved, erased or written into until unlocked
//
// A scene is { type, version, background, elements, files? }; `files` maps a file id to an image's data: URL.

import { polylinePath, ellipsePath, freehandPath, hachurePath, arrowHead } from './sketch-stroke.js';

export const TYPES = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'draw', 'text', 'image', 'frame'];
export const FORMAT = 'sketch';
export const VERSION = 1;
export const LINE_HEIGHT = 1.25;
export const FONT_NAME = 'Sketch Hand';
export const FONT = `"${FONT_NAME}", "Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive`;
// Text fonts: the handwriting one (the default, not stored) and two from the system, so nothing more is
// downloaded and the site still works offline.
export const FONTS = {
  hand: FONT,
  normal: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  code: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};
export const fontOf = (el) => FONTS[el.font] || FONT;
const ARROW_GAP = 6;
// Frames: the height of the title above them, and their colour (a neutral grey that reads on any background).
export const FRAME_TITLE = 20;
export const FRAME_COLOR = '#868e96';
export const FRAME_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// The grid: lines every GRID_SIZE drawing units. snap() rounds a coordinate to the nearest line.
export const GRID_SIZE = 20;
export const snap = (v, size = GRID_SIZE) => Math.round(v / size) * size;
export const snapPoint = (p, size = GRID_SIZE) => ({ x: snap(p.x, size), y: snap(p.y, size) });

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

// --- Images: a picture is a data: URL of one of these types, in base64, and not too big. Anything else is refused
// (no SVG: it could carry script; no remote URL: the page never connects anywhere). ---
export const IMAGE_TYPES = ['png', 'jpeg', 'gif', 'webp'];
export const MAX_IMAGE_CHARS = 10 * 1024 * 1024; // ~7.5 MB of picture
export const MAX_FILES_CHARS = 60 * 1024 * 1024; // all the pictures of one drawing
const MAX_FILES = 500;
const DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
// Names an object must never take from a file (they would reach its prototype).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const isImageData = (v) => typeof v === 'string' && v.length <= MAX_IMAGE_CHARS && DATA_URL_RE.test(v);

// The files a list of elements uses, taken from `files` (nothing else is kept).
export function filesFor(elements, files) {
  if (!files) return {};
  const used = elements.filter((e) => e.type === 'image' && !UNSAFE_KEYS.has(e.fileId) && Object.hasOwn(files, e.fileId) && isImageData(files[e.fileId]));
  return Object.fromEntries(used.map((e) => [e.fileId, files[e.fileId]]));
}

// Validated files from a file or storage: known ids, data: URLs of allowed types, within the limits.
function cleanFiles(raw) {
  const out = [];
  if (!raw || typeof raw !== 'object') return {};
  let total = 0;
  let n = 0;
  for (const [id, v] of Object.entries(raw)) {
    if (n >= MAX_FILES) break;
    const data = typeof v === 'string' ? v : v?.dataURL; // ours, or Excalidraw's { mimeType, dataURL }
    if (!ref(id) || UNSAFE_KEYS.has(id) || !isImageData(data) || total + data.length > MAX_FILES_CHARS) continue;
    out.push([id, data]);
    total += data.length;
    n += 1;
  }
  // Built from pairs (no `obj[name] = …` with a name from the file).
  return Object.fromEntries(out);
}

// Arrowheads of an arrow: at its end (the default, not stored), its start, both or none.
export const HEADS = ['end', 'start', 'both', 'none'];
// Fills: hachure (the default), cross-hatch or solid.
export const FILL_STYLES = ['hachure', 'cross-hatch', 'solid'];

// How a line or an arrow goes from one end to the other: straight (the default, not stored), with right-angle
// elbows, or along a gentle curve. Only for lines and arrows with two points (their ends).
export const ROUTES = ['straight', 'elbow', 'curve'];

// How much a curve bends: the default, or the one dragged by hand.
export const DEFAULT_BEND = 0.25;
export const bendOf = (el) => (Number.isFinite(el.bend) ? el.bend : DEFAULT_BEND);

// The bend that makes a curve from a to z pass through p (its middle point goes there), as a share of the length.
export function bendThrough(a, z, p) {
  const dx = z.x - a.x;
  const dy = z.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return 0;
  // The curve's middle is halfway between the chord's middle and the control point: twice the offset, along (-dy, dx).
  const off = (p.x - (a.x + dx / 2)) * -dy + (p.y - (a.y + dy / 2)) * dx;
  return Math.max(-2, Math.min(2, (2 * off) / len2));
}

// The point in the middle of a two-point line as drawn (on the curve when it is one).
export function midPoint(el) {
  const a = { x: el.x + el.points[0].x, y: el.y + el.points[0].y };
  const z = { x: el.x + el.points[1].x, y: el.y + el.points[1].y };
  const m = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
  if (el.route !== 'curve') return m;
  const k = bendOf(el) / 2;
  return { x: m.x - (z.y - a.y) * k, y: m.y + (z.x - a.x) * k };
}

// The points a line or arrow is drawn through, from its two ends and its route (absolute coordinates).
export function routePoints(el) {
  const pts = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
  if (!el.route || el.route === 'straight' || pts.length !== 2) return pts;
  const [a, z] = pts;
  const dx = z.x - a.x;
  const dy = z.y - a.y;
  if (el.route === 'elbow') {
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return pts;
    // Along the longer direction first, turning halfway.
    if (Math.abs(dx) >= Math.abs(dy)) {
      const mx = a.x + dx / 2;
      return [a, { x: mx, y: a.y }, { x: mx, y: z.y }, z];
    }
    const my = a.y + dy / 2;
    return [a, { x: a.x, y: my }, { x: z.x, y: my }, z];
  }
  // curve: a quadratic arc whose control point sits off the middle, `bend` × the length to the left of the way from a
  // to z (right when negative)
  const len = Math.hypot(dx, dy);
  if (len < 1) return pts;
  const k = bendOf(el);
  const c = { x: a.x + dx / 2 - dy * k, y: a.y + dy / 2 + dx * k };
  const out = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * z.x, y: u * u * a.y + 2 * u * t * c.y + t * t * z.y });
  }
  return out;
}

export function createElement(type, x, y, style = {}) {
  const el = { id: newId(), type, x, y, w: 0, h: 0, seed: newSeed(), ...DEFAULT_STYLE, ...style };
  if (type !== 'arrow' || el.heads === 'end' || !HEADS.includes(el.heads)) delete el.heads;
  if ((type !== 'arrow' && type !== 'line') || el.route === 'straight' || !ROUTES.includes(el.route)) delete el.route;
  if ((type !== 'arrow' && type !== 'line') || el.animated !== true) delete el.animated;
  if (el.route !== 'curve' || !Number.isFinite(el.bend)) delete el.bend;
  if (type !== 'rectangle' || el.rounded !== true) delete el.rounded;
  if (el.dotted !== true || type === 'text' || type === 'image' || type === 'frame') delete el.dotted;
  delete el.locked;
  if (type !== 'text' || el.font === 'hand' || !Object.hasOwn(FONTS, String(el.font))) delete el.font;
  if (type === 'draw' || type === 'line' || type === 'arrow') el.points = [{ x: 0, y: 0 }];
  if (type === 'text') el.text = '';
  if (type === 'frame') el.name = '';
  return el;
}

export const isLinear = (el) => el.type === 'line' || el.type === 'arrow' || el.type === 'draw';
export const isContainer = (el) => el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond';
export const isBoundText = (el) => el.type === 'text' && !!el.containerId;
const isBindable = (el) => isContainer(el) || el.type === 'image' || (el.type === 'text' && !el.containerId);
export const isFrame = (el) => el.type === 'frame';

// --- Text: measuring and lines ---
// The real measure comes from the renderer (canvas.measureText); without a DOM it is estimated.
// measure(text, fontSize, family): `family` is one of FONTS.
let measure = (text, fontSize, family = FONT) => text.length * fontSize * (family === FONTS.code ? 0.6 : family === FONTS.normal ? 0.55 : 0.5);
// Elements are never changed in place (every change creates a new one), so their box can be cached per
// object. A new text measurer starts the cache again.
let boxes = new WeakMap();
export function setTextMeasurer(fn) {
  measure = fn;
  boxes = new WeakMap();
}
export const measureText = (text, fontSize, family = FONT) => measure(text, fontSize, family);
// Forgets the measured boxes (the font they were measured with has just changed, e.g. it loaded).
export function forgetTextBoxes() {
  boxes = new WeakMap();
}

function wrap(line, width, fontSize, family) {
  if (measure(line, fontSize, family) <= width) return [line];
  const out = [];
  let cur = '';
  for (const word of line.split(/(\s+)/)) {
    if (!word) continue;
    const next = cur + word;
    if (measure(next, fontSize, family) <= width || !cur.trim()) {
      cur = next;
    } else {
      out.push(cur.trimEnd());
      cur = word.trimStart();
    }
    // A word much wider than the box is split by letters (if it is only a little wider, it stays).
    while (measure(cur, fontSize, family) > width * 1.6 && cur.length > 1) {
      // The longest start that fits, found by halving (not letter by letter: a long word stays fast).
      let lo = 1;
      let hi = cur.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (measure(cur.slice(0, mid), fontSize, family) <= width) lo = mid;
        else hi = mid - 1;
      }
      out.push(cur.slice(0, lo));
      cur = cur.slice(lo);
    }
  }
  out.push(cur.trimEnd());
  return out;
}

// Lines to paint: the text's own, wrapped to the shape's width when it is inside one.
export function textLines(el) {
  const raw = String(el.text || '').split('\n');
  if (!el.containerId || !(el.w > 0)) return raw;
  return raw.flatMap((l) => wrap(l, el.w, el.fontSize, fontOf(el)));
}

// --- Geometry ---
export function rotatePoint(p, c, a) {
  if (!a) return { x: p.x, y: p.y };
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos };
}

// The element's unrotated box: { x, y, w, h } with positive w and h.
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
    const rp = el.type === 'draw' ? el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y })) : routePoints(el);
    const xs = rp.map((p) => p.x);
    const ys = rp.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (el.type === 'text') {
    const lines = textLines(el);
    const w = el.containerId && el.w > 0 ? el.w : Math.max(...lines.map((l) => measure(l, el.fontSize, fontOf(el))), el.fontSize * 0.5);
    return { x: el.x, y: el.y, w, h: lines.length * el.fontSize * LINE_HEIGHT };
  }
  return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
}

export function center(el) {
  const b = bounds(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// The box's corners, rotated.
export function corners(el) {
  const b = bounds(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }]
    .map((p) => rotatePoint(p, c, isLinear(el) ? 0 : el.angle || 0));
}

// The box it takes on screen (with its rotation).
export function aabb(el) {
  if (el.type === 'frame') {
    const b = bounds(el);
    return { x: b.x, y: b.y - FRAME_TITLE, w: b.w, h: b.h + FRAME_TITLE };
  }
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

// A point in the element's unrotated frame.
function toLocal(el, x, y) {
  if (isLinear(el) || !el.angle) return { x, y };
  return rotatePoint({ x, y }, center(el), -el.angle);
}

// Does the point (x, y) hit the element? Shapes without fill are only hit on their outline.
export function hitTest(el, x, y, tol = 6) {
  ({ x, y } = toLocal(el, x, y));
  const b = bounds(el);
  const top = el.type === 'frame' ? FRAME_TITLE : 0;
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - top - tol || y > b.y + b.h + tol) return false;
  const filled = (el.fill && el.fill !== 'transparent') || el.type === 'image';
  if (el.type === 'text') return true;
  if (el.type === 'frame') {
    // A frame is taken by its border or its title, so what is drawn inside it stays easy to pick.
    if (y < b.y && y >= b.y - FRAME_TITLE - tol && x <= b.x + Math.max(60, b.w / 2)) return true;
    const edges = [[b.x, b.y, b.x + b.w, b.y], [b.x + b.w, b.y, b.x + b.w, b.y + b.h], [b.x + b.w, b.y + b.h, b.x, b.y + b.h], [b.x, b.y + b.h, b.x, b.y]];
    return edges.some((e) => distToSegment(x, y, ...e) <= tol);
  }
  if (isLinear(el)) {
    const pts = el.type === 'draw' ? el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y })) : routePoints(el);
    if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= tol + el.width;
    return pts.some((p, i) => i > 0 && distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, p.x, p.y) <= tol + el.width / 2);
  }
  if (el.type === 'rectangle' || el.type === 'image') {
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

// Is the point inside the shape (filled or not)?
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

// The topmost element under the point (the last one drawn).
export function elementAt(elements, x, y, tol) {
  for (let i = elements.length - 1; i >= 0; i--) if (hitTest(elements[i], x, y, tol)) return elements[i];
  return null;
}

// The topmost shape containing the point (to write inside it or attach an arrow).
export function shapeAt(elements, x, y, { tol = 0, except = null, containersOnly = false } = {}) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.id === except || (containersOnly && !isContainer(e))) continue;
    if (insideShape(e, x, y, tol)) return e;
  }
  return null;
}

// Frames hold what lies on them: an element belongs to a frame when the centre of its box is inside it (the smallest
// frame, when they nest); a frame belongs to one only when it lies wholly inside it. Worked out per list of elements
// and kept while that list is the same.
const centreOf = (e) => {
  const a = aabb(e);
  return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
};
const inside = (p, b) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
const owners = new WeakMap();
// id → the frame that clips it.
export function frameOwners(elements) {
  let map = owners.get(elements);
  if (map) return map;
  map = new Map();
  const frames = elements.filter((e) => e.type === 'frame').map((f) => ({ f, b: bounds(f) })).sort((x, y) => x.b.w * x.b.h - y.b.w * y.b.h);
  if (frames.length) {
    for (const e of elements) {
      if (e.type === 'frame') continue;
      const c = centreOf(e);
      const hit = frames.find((x) => inside(c, x.b));
      if (hit) map.set(e.id, hit.f);
    }
  }
  owners.set(elements, map);
  return map;
}

// What a frame carries when it moves: the elements on it (also inside frames nested in it) and those frames.
export function inFrame(elements, frame) {
  const b = bounds(frame);
  return elements.filter((e) => {
    if (e === frame || e.id === frame.id) return false;
    if (e.type !== 'frame') return inside(centreOf(e), b);
    const a = aabb(e);
    return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  });
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

// Resizes so the element's box goes from `from` to `to` (scales points, centers and sizes).
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

// Resizes one element by dragging a handle (n, s, e, w, ne…) to the point p, in the element's own frame
// (so it works the same when rotated).
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
  // Texts and pictures keep their proportions (Shift lets a picture stretch).
  const ratio = el.type === 'image' ? !keepRatio : keepRatio || el.type === 'text';
  if (ratio && b.w && b.h) {
    const corner = handle.length === 2;
    const k = corner ? Math.max(Math.abs(x2 - x1) / b.w, Math.abs(y2 - y1) / b.h) : handle === 'n' || handle === 's' ? Math.abs(y2 - y1) / b.h : Math.abs(x2 - x1) / b.w;
    const nw = b.w * k;
    const nh = b.h * k;
    if (handle.includes('w')) x1 = x2 - nw; else if (handle.includes('e')) x2 = x1 + nw; else { x1 = c.x - nw / 2; x2 = c.x + nw / 2; }
    if (handle.includes('n')) y1 = y2 - nh; else if (handle.includes('s')) y2 = y1 + nh; else { y1 = c.y - nh / 2; y2 = c.y + nh / 2; }
  }
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  // New center, back in the drawing's frame.
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

// Rotates the element `delta` radians around the point c.
export function rotateElement(el, c, delta) {
  if (el.type === 'frame') return el; // frames stay upright
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

// Grows (or shrinks) an element without moving its center. Texts change their font size.
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

// Normalizes: positive width and height (after drawing upwards or to the left).
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

// --- Bindings: text inside shapes and attached arrows ---

// The point on the shape's outline in the direction of `toward`, `gap` away from it.
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

// The room for text inside each shape.
function innerBox(el) {
  const b = bounds(el);
  const k = el.type === 'ellipse' ? Math.SQRT1_2 : el.type === 'diamond' ? 0.5 : 1;
  const pad = 8;
  return { w: Math.max(10, b.w * k - pad * 2), cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

// Lays out what is bound: texts inside their shape and arrow ends on their shape's outline. Drops
// bindings to elements that no longer exist. Does not change the array it receives.
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
      return sameAs(el, out);
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
      // Every point within ±MAX_COORD, like anything read from a file (before and after laying out the ends), so
      // saving and opening again changes nothing.
      const lim = (v) => Math.max(-MAX_COORD, Math.min(MAX_COORD, v));
      const keep = (list) => {
        for (let i = 0; i < list.length; i++) list[i] = { x: lim(list[i].x), y: lim(list[i].y) };
        return list;
      };
      const pts = keep(el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y })));
      const n = pts.length;
      if (n < 2) return out;
      const refStart = n > 2 ? pts[1] : e ? center(e) : pts[n - 1];
      const refEnd = n > 2 ? pts[n - 2] : s ? center(s) : pts[0];
      if (s) pts[0] = outlinePoint(s, refStart);
      if (e) pts[n - 1] = outlinePoint(e, refEnd);
      keep(pts);
      out.x = pts[0].x;
      out.y = pts[0].y;
      out.points = pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y }));
      return sameAs(el, out);
    }
    return el;
  });
}

// The element as it was if nothing changed, so the caches kept per object (boxes, prepared strokes)
// still hold: moving one box does not recompute every attached arrow and text in the drawing.
function sameAs(el, out) {
  const keys = Object.keys(out);
  if (keys.length !== Object.keys(el).length) return out;
  for (const k of keys) {
    if (k === 'points') {
      const a = el.points;
      const b = out.points;
      if (!a || a.length !== b.length || a.some((p, i) => p.x !== b[i].x || p.y !== b[i].y)) return out;
    } else if (out[k] !== el[k]) {
      return out;
    }
  }
  return el;
}

// Three-way merge of two versions of a drawing (mine and another device's) from the one both started
// from, element by element by id. If both changed the same element differently, mine wins and
// `conflict` is true (the caller can keep the other version separately).
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
      // Deleted there: it goes if it was not touched here; if it changed here, it stays.
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
  // What is new there, in its relative place (after the element that precedes it there).
  let prev = null;
  for (const t of theirs.elements) {
    if (!M.has(t.id)) {
      const b = B.get(t.id);
      // Deleted here and unchanged there: it stays deleted.
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
  const elements = syncBindings(out);
  const files = filesFor(elements, { ...(theirs.files || {}), ...(mine.files || {}) });
  const scene = { ...mine, background: bg, elements };
  if (Object.keys(files).length) scene.files = files;
  else delete scene.files;
  return { scene, conflict };
}

// Copies of some elements, offset: new ids, and bindings and groups remapped between the copies.
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

// --- Open and save (whatever comes from a file is validated: it is never trusted) ---
// Only numbers and numeric strings count: converting anything else (an object whose toString isn't a function) could throw.
const num = (v, d = 0) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(x) ? x : d;
};
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const COLOR_RE = /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const color = (v, d) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : d);
export const isColor = (v) => typeof v === 'string' && COLOR_RE.test(v) && v === v.trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Coordinates and sizes from a file stay within ±1e6: far bigger than any real drawing, small enough that
// nothing built from them (strokes, fills, exports) can grow without bound.
export const MAX_COORD = 1e6;
const coord = (v) => clamp(num(v), -MAX_COORD, MAX_COORD);
const ref = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);

export function cleanElement(raw) {
  if (!raw || typeof raw !== 'object' || !TYPES.includes(raw.type)) return null;
  const el = {
    id: ref(raw.id) || newId(),
    type: raw.type,
    x: coord(raw.x),
    y: coord(raw.y),
    w: coord(raw.w),
    h: coord(raw.h),
    seed: Math.floor(num(raw.seed, newSeed())) >>> 0,
    stroke: color(raw.stroke, DEFAULT_STYLE.stroke),
    fill: color(raw.fill, DEFAULT_STYLE.fill),
    fillStyle: FILL_STYLES.includes(raw.fillStyle) ? raw.fillStyle : 'hachure',
    width: clamp(num(raw.width, 2), 0.5, 40),
    dashed: raw.dashed === true,
    roughness: clamp(num(raw.roughness, 1), 0, 3),
    opacity: clamp(num(raw.opacity, 1), 0.05, 1),
    fontSize: clamp(num(raw.fontSize, 24), 6, 400),
  };
  if (el.type === 'image') {
    if (!ref(raw.fileId)) return null;
    el.fileId = raw.fileId;
  }
  if (el.type === 'frame') el.name = str(raw.name).replace(/\s+/g, ' ').trim().slice(0, 100);
  if (isLinear(el)) {
    // Points are relative to x, y; where they land stays within ±MAX_COORD like any coordinate.
    const pts = Array.isArray(raw.points) ? raw.points.slice(0, 5000).map((p) => ({ x: coord(el.x + num(p?.x)) - el.x, y: coord(el.y + num(p?.y)) - el.y })) : [];
    if (!pts.length) return null;
    el.points = pts;
  } else if (el.type !== 'frame') {
    const angle = normAngle(num(raw.angle));
    if (angle) el.angle = angle;
  }
  if (el.type === 'text') {
    el.text = str(raw.text).slice(0, 10000);
    if (raw.font !== 'hand' && typeof raw.font === 'string' && Object.hasOwn(FONTS, raw.font)) el.font = raw.font;
    if (ref(raw.containerId)) {
      el.containerId = ref(raw.containerId);
      el.align = 'center';
    }
  }
  if (el.type === 'arrow' || el.type === 'line') {
    if (ref(raw.startId)) el.startId = ref(raw.startId);
    if (ref(raw.endId)) el.endId = ref(raw.endId);
  }
  if (el.type === 'arrow' && HEADS.includes(raw.heads) && raw.heads !== 'end') el.heads = raw.heads;
  if ((el.type === 'arrow' || el.type === 'line') && ROUTES.includes(raw.route) && raw.route !== 'straight' && el.points.length === 2) el.route = raw.route;
  if ((el.type === 'arrow' || el.type === 'line') && raw.animated === true) el.animated = true;
  if (el.route === 'curve' && typeof raw.bend === 'number' && Number.isFinite(raw.bend) && raw.bend !== DEFAULT_BEND) el.bend = clamp(raw.bend, -2, 2);
  if (el.type === 'rectangle' && raw.rounded === true) el.rounded = true;
  if (raw.dotted === true && raw.dashed === true && el.type !== 'text' && el.type !== 'image' && el.type !== 'frame') el.dotted = true;
  if (raw.locked === true) el.locked = true;
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
  return withFiles({
    type: FORMAT,
    version: VERSION,
    background: color(data.background, '#ffffff'),
    elements: data.elements.slice(0, 20000).map(cleanElement).filter(Boolean),
  }, cleanFiles(data.files));
}

// Keeps the pictures the elements use; a picture element whose file is missing or refused is dropped.
function withFiles(scene, files) {
  const elements = syncBindings(scene.elements.filter((e) => e.type !== 'image' || Object.hasOwn(files, e.fileId)));
  const used = filesFor(elements, files);
  const out = { ...scene, elements };
  if (Object.keys(used).length) out.files = used;
  return out;
}

export function serializeScene(scene) {
  const files = filesFor(scene.elements, scene.files);
  const data = { type: FORMAT, version: VERSION, background: scene.background, elements: scene.elements };
  if (Object.keys(files).length) data.files = files;
  return `${JSON.stringify(data)}\n`;
}

// Excalidraw's font numbers: handwriting (Virgil, Excalifont), normal (Helvetica, Nunito), code (Cascadia,
// Comic Shanns). Anything else stays in the handwriting font.
const EXCALIDRAW_FONTS = { 1: 'hand', 5: 'hand', 2: 'normal', 6: 'normal', 3: 'code', 8: 'code' };

// Excalidraw keeps one arrowhead setting per end (null means none; a missing end one means the default arrow).
function excalidrawHeads(e) {
  const start = !!e.startArrowhead;
  const end = e.endArrowhead === undefined ? true : !!e.endArrowhead;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}

// The .excalidraw format (public JSON): the types and styles with an equivalent are translated.
export function fromExcalidraw(data) {
  const map = { rectangle: 'rectangle', ellipse: 'ellipse', diamond: 'diamond', line: 'line', arrow: 'arrow', freedraw: 'draw', text: 'text', image: 'image', frame: 'frame', magicframe: 'frame' };
  const elements = [];
  for (const e of Array.isArray(data.elements) ? data.elements.slice(0, 20000) : []) {
    if (!e || e.isDeleted || typeof e.type !== 'string' || !Object.hasOwn(map, e.type)) continue;
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
      fillStyle: FILL_STYLES.includes(e.fillStyle) ? e.fillStyle : 'hachure',
      width: e.strokeWidth,
      dashed: e.strokeStyle === 'dashed' || e.strokeStyle === 'dotted',
      dotted: e.strokeStyle === 'dotted',
      rounded: e.type === 'rectangle' && !!e.roundness,
      locked: e.locked === true,
      roughness: e.roughness,
      opacity: e.opacity != null ? num(e.opacity, 100) / 100 : 1,
      fontSize: e.fontSize,
      font: typeof e.fontFamily === 'number' ? EXCALIDRAW_FONTS[e.fontFamily] : undefined,
      text: e.originalText ?? e.text,
      containerId: e.containerId,
      heads: excalidrawHeads(e),
      route: e.elbowed === true ? 'elbow' : undefined,
      startId: e.startBinding?.elementId,
      endId: e.endBinding?.elementId,
      group: Array.isArray(e.groupIds) ? e.groupIds[e.groupIds.length - 1] : undefined,
      points: Array.isArray(e.points) ? e.points.map((p) => ({ x: p?.[0], y: p?.[1] })) : undefined,
      fileId: e.fileId,
      name: e.name,
    });
    if (el) elements.push(el);
  }
  return withFiles({ type: FORMAT, version: VERSION, background: color(data.appState?.viewBackgroundColor, '#ffffff'), elements }, cleanFiles(data.files));
}

// A scene in the .excalidraw format, to open it in Excalidraw. Hand, Normal and Code become Excalidraw's handwriting,
// normal and code fonts; elbow and curved routes go as the points they are drawn through; animation has no
// equivalent and is left out.
const TO_EXCALIDRAW_FONT = { hand: 1, normal: 2, code: 3 };
export function toExcalidraw(scene) {
  const els = scene.elements;
  const bound = new Map(); // shape id → [{ id, type }] of the texts and arrows attached to it
  const attach = (shapeId, id, type) => {
    if (!shapeId) return;
    if (!bound.has(shapeId)) bound.set(shapeId, []);
    bound.get(shapeId).push({ id, type });
  };
  for (const e of els) {
    if (e.type === 'text' && e.containerId) attach(e.containerId, e.id, 'text');
    if (e.type === 'arrow') {
      attach(e.startId, e.id, 'arrow');
      if (e.endId !== e.startId) attach(e.endId, e.id, 'arrow');
    }
  }
  const frameOf = new Map([...frameOwners(els)].map(([id, f]) => [id, f.id]));
  let nonce = 1;
  const out = els.map((e) => {
    const b = bounds(e);
    const base = {
      id: e.id, type: e.type === 'draw' ? 'freedraw' : e.type, x: e.x, y: e.y, width: b.w, height: b.h,
      angle: isLinear(e) ? 0 : e.angle || 0, strokeColor: e.stroke, backgroundColor: e.fill,
      fillStyle: FILL_STYLES.includes(e.fillStyle) ? e.fillStyle : 'hachure', strokeWidth: e.width, strokeStyle: e.dotted ? 'dotted' : e.dashed ? 'dashed' : 'solid',
      roughness: e.roughness, opacity: Math.round(e.opacity * 100), seed: e.seed, version: 1, versionNonce: nonce++,
      isDeleted: false, groupIds: e.group ? [e.group] : [], frameId: frameOf.get(e.id) || null,
      boundElements: bound.get(e.id) || null, updated: 0, link: null, locked: e.locked === true, roundness: e.rounded ? { type: 3 } : null,
    };
    if (isLinear(e)) {
      const pts = e.type === 'draw' ? e.points.map((p) => ({ x: e.x + p.x, y: e.y + p.y })) : routePoints(e);
      const x0 = pts[0].x;
      const y0 = pts[0].y;
      Object.assign(base, { x: x0, y: y0, width: b.w, height: b.h, points: pts.map((p) => [p.x - x0, p.y - y0]) });
      if (e.type === 'draw') Object.assign(base, { pressures: [], simulatePressure: true });
      else {
        const heads = e.type === 'arrow' ? e.heads || 'end' : 'none';
        Object.assign(base, {
          lastCommittedPoint: null,
          startBinding: e.startId ? { elementId: e.startId, focus: 0, gap: ARROW_GAP } : null,
          endBinding: e.endId ? { elementId: e.endId, focus: 0, gap: ARROW_GAP } : null,
          startArrowhead: heads === 'start' || heads === 'both' ? 'arrow' : null,
          endArrowhead: heads === 'end' || heads === 'both' ? 'arrow' : null,
          elbowed: false,
          ...(e.route === 'curve' ? { roundness: { type: 2 } } : {}),
        });
      }
    } else if (e.type === 'text') {
      Object.assign(base, {
        x: b.x, y: b.y, text: e.text, originalText: e.text, fontSize: e.fontSize, fontFamily: TO_EXCALIDRAW_FONT[e.font || 'hand'],
        textAlign: e.containerId ? 'center' : 'left', verticalAlign: e.containerId ? 'middle' : 'top',
        containerId: e.containerId || null, lineHeight: LINE_HEIGHT, autoResize: true,
      });
    } else if (e.type === 'image') {
      Object.assign(base, { fileId: e.fileId, status: 'saved', scale: [1, 1], backgroundColor: 'transparent' });
    } else if (e.type === 'frame') {
      Object.assign(base, { name: e.name || null, strokeColor: '#bbb', backgroundColor: 'transparent' });
    }
    return base;
  });
  const files = {};
  for (const [id, dataURL] of Object.entries(filesFor(els, scene.files))) {
    files[id] = { id, mimeType: dataURL.slice(5, dataURL.indexOf(';')), dataURL, created: 0 };
  }
  return {
    type: 'excalidraw', version: 2, source: 'https://bendi.dev/bsketch/', elements: out,
    appState: { viewBackgroundColor: scene.background || '#ffffff', gridSize: null }, files,
  };
}

// --- Element → strokes to paint: [{ path, stroke?, fill?, width, dashed, opacity, clip? }] ---
const turnPath = (path, c, a) => path.map((cmd) => {
  if (cmd.op === 'Z') return cmd;
  const p = rotatePoint(cmd, c, a);
  if (cmd.op !== 'Q') return { ...cmd, x: p.x, y: p.y };
  const q = rotatePoint({ x: cmd.cx, y: cmd.cy }, c, a);
  return { ...cmd, x: p.x, y: p.y, cx: q.x, cy: q.y };
});

// A rectangle's outline with round corners: the straight sides and a few points along each corner.
function roundedCorners(b) {
  const r = Math.min(32, Math.min(b.w, b.h) * 0.2);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  corner(b.x + b.w - r, b.y + r, -Math.PI / 2);
  corner(b.x + b.w - r, b.y + b.h - r, 0);
  corner(b.x + r, b.y + b.h - r, Math.PI / 2);
  corner(b.x + r, b.y + r, Math.PI);
  return pts;
}

// A path mirrored left to right around x = axis / 2.
const mirrorX = (path, axis) => path.map((c) => (c.op === 'Z' ? c : c.op === 'Q' ? { ...c, x: axis - c.x, cx: axis - c.cx } : { ...c, x: axis - c.x }));

export function drawOps(el) {
  const opts = { seed: el.seed, roughness: el.roughness };
  const base = { stroke: el.stroke, width: el.width, dashed: el.dashed, opacity: el.opacity, ...(el.dotted ? { dotted: true } : {}) };
  const b = bounds(el);
  const ops = [];
  const filled = el.fill && el.fill !== 'transparent';
  let outline = null;
  let shape = null; // clean outline to fill or to clip the hachure
  if (el.type === 'rectangle') {
    const pts = el.rounded ? roundedCorners(b) : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    outline = polylinePath(pts, { ...opts, closed: true });
    shape = [{ op: 'M', ...pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L', ...p })), { op: 'Z' }];
  } else if (el.type === 'diamond') {
    const pts = diamondPoints(b);
    outline = polylinePath(pts, { ...opts, closed: true });
    shape = [{ op: 'M', ...pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L', ...p })), { op: 'Z' }];
  } else if (el.type === 'ellipse') {
    outline = ellipsePath(b.x, b.y, b.w, b.h, opts);
    shape = ellipsePath(b.x, b.y, b.w, b.h, { seed: el.seed, roughness: 0, passes: 1 });
  } else if (el.type === 'frame') {
    // A clean, thin border (not hand-drawn): it frames the drawing rather than being part of it.
    const pts = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    return [{ stroke: FRAME_COLOR, width: 1, dashed: false, opacity: 1, path: [{ op: 'M', ...pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L', ...p })), { op: 'Z' }] }];
  } else if (el.type === 'draw') {
    ops.push({ ...base, path: freehandPath(el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }))) });
    return ops;
  } else if (el.type === 'line' || el.type === 'arrow') {
    const pts = routePoints(el);
    // A curve is drawn smooth (the hand-drawn wobble is for straight strokes); straight and elbow lines wobble.
    // An animated line is dashed and its dashes move (`flow`); its arrowheads stay solid.
    ops.push({ ...base, ...(el.animated ? { flow: true, dashed: true } : {}), path: el.route === 'curve' ? freehandPath(pts) : polylinePath(pts, opts) });
    if (el.type === 'arrow' && pts.length > 1) {
      const heads = el.heads || 'end';
      const size = 10 + el.width * 3;
      if (heads === 'end' || heads === 'both') {
        const a = pts[pts.length - 2];
        const z = pts[pts.length - 1];
        ops.push({ ...base, dashed: false, path: arrowHead(a.x, a.y, z.x, z.y, size, opts) });
      }
      if (heads === 'start' || heads === 'both') {
        ops.push({ ...base, dashed: false, path: arrowHead(pts[1].x, pts[1].y, pts[0].x, pts[0].y, size, { ...opts, seed: opts.seed + 1 }) });
      }
    }
    return ops;
  } else {
    return ops;
  }
  if (filled) {
    if (el.fillStyle === 'solid') ops.push({ fill: el.fill, opacity: el.opacity, path: shape });
    else {
      ops.push({ stroke: el.fill, width: Math.max(1, el.width / 2), opacity: el.opacity, path: hachurePath(b.x, b.y, b.w, b.h, opts), clip: shape });
      // Cross-hatch: the same lines again, mirrored, so they cross.
      if (el.fillStyle === 'cross-hatch') ops.push({ stroke: el.fill, width: Math.max(1, el.width / 2), opacity: el.opacity, path: mirrorX(hachurePath(b.x, b.y, b.w, b.h, { ...opts, seed: opts.seed + 11 }), b.x * 2 + b.w), clip: shape });
    }
  }
  ops.push({ ...base, path: outline });
  if (!el.angle) return ops;
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return ops.map((op) => ({ ...op, path: turnPath(op.path, c, el.angle), ...(op.clip ? { clip: turnPath(op.clip, c, el.angle) } : {}) }));
}

// Text → lines with their position, anchor (start | middle) and rotation around c.
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

// --- Library: pieces of drawings kept to use again ---
// A library file is { type: 'bsketchlib', version: 1, items: [{ id, name, elements, files }] }. Excalidraw's
// libraries are read too (version 2: { type: 'excalidrawlib', libraryItems: [{ name, elements }] }, version 1:
// { library: [[elements]] }). Each item is validated as a scene of its own; empty ones are dropped.
export const LIBRARY_FORMAT = 'bsketchlib';
export const MAX_LIBRARY_ITEMS = 200;

export function parseLibrary(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('bad_file');
  }
  let raw;
  if (data?.type === LIBRARY_FORMAT && Array.isArray(data.items)) {
    raw = data.items.map((it) => ({ name: it?.name, scene: { type: FORMAT, elements: Array.isArray(it?.elements) ? it.elements : [], files: it?.files } }));
  } else if (data?.type === 'excalidrawlib' && (Array.isArray(data.libraryItems) || Array.isArray(data.library))) {
    const list = Array.isArray(data.libraryItems) ? data.libraryItems.map((it) => ({ name: it?.name, elements: it?.elements })) : data.library.map((els) => ({ elements: els }));
    raw = list.map((it) => ({ name: it.name, scene: { type: 'excalidraw', elements: Array.isArray(it.elements) ? it.elements : [], files: data.files } }));
  } else {
    throw new Error('bad_file');
  }
  const items = [];
  for (const r of raw.slice(0, MAX_LIBRARY_ITEMS)) {
    let s;
    try {
      s = parseScene(JSON.stringify(r.scene));
    } catch {
      continue;
    }
    if (!s.elements.length) continue;
    const item = { id: newId(), name: typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '', elements: s.elements };
    if (s.files) item.files = s.files;
    items.push(item);
  }
  return items;
}

export function serializeLibrary(items) {
  return `${JSON.stringify({ type: LIBRARY_FORMAT, version: 1, items: items.map((it) => ({ name: it.name || '', elements: it.elements, ...(it.files ? { files: filesFor(it.elements, it.files) } : {}) })) })}\n`;
}
