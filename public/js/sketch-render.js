// Copied from serbenda/bsketch (js/render.js, commit fe1613f) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// Paints a scene on a <canvas> or turns it into SVG (text to download, or DOM nodes to embed). The
// drawing's texts never go in as HTML: they are escaped or set with textContent.

import { drawOps, sceneBounds, textLayout, setTextMeasurer, aabb, bounds, center, fontOf, isImageData, frameOwners, FONT, FONT_NAME, FRAME_TITLE, FRAME_COLOR, FRAME_FONT } from './sketch-scene.js';
import { toSvgD, tracePath } from './sketch-stroke.js';

// Measures texts with a canvas (the handwriting font is narrower than the no-DOM estimate).
let measuring = false;
export function measureWithCanvas(doc) {
  if (measuring) return;
  const ctx = doc.createElement('canvas').getContext('2d');
  if (!ctx) return;
  measuring = true;
  setTextMeasurer((text, fontSize, family = FONT) => {
    ctx.font = `${fontSize}px ${family}`;
    return ctx.measureText(text).width;
  });
}

// A promise that resolves when the handwriting font is ready (or cannot be loaded).
export function fontReady(doc) {
  try {
    return Promise.resolve(doc.fonts?.load(`24px "${FONT_NAME}"`)).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

// Pictures, decoded once per data: URL. Painting needs them decoded: until then a picture is a grey box, and
// onImageReady() tells the painter (the editor) to paint again.
const pictures = new Map();
const waiting = new Set();
export function onImageReady(fn) {
  waiting.add(fn);
  return () => waiting.delete(fn);
}
function picture(data) {
  if (!isImageData(data) || typeof Image === 'undefined') return null;
  let p = pictures.get(data);
  if (!p) {
    const img = new Image();
    p = { img, ready: false, failed: false };
    img.src = data;
    p.done = img.decode().then(() => { p.ready = true; }, () => { p.failed = true; }).then(() => { for (const fn of waiting) fn(); });
    if (pictures.size > 300) pictures.delete(pictures.keys().next().value);
    pictures.set(data, p);
  }
  return p;
}
// Waits until every picture in the scene is decoded (for exports).
export function imagesReady(scene) {
  return Promise.all(scene.elements.filter((e) => e.type === 'image').map((e) => picture(scene.files?.[e.fileId])?.done));
}
const frameTitle = (el) => el.name || 'Frame';

// Strokes prepared once per element (Path2D when available): repainting an unchanged element does not
// recompute its hand-drawn stroke or hachure. Elements are never changed in place.
const prepared = new WeakMap();
function opsOf(el) {
  let ops = prepared.get(el);
  if (!ops) {
    const P = globalThis.Path2D;
    ops = drawOps(el).map((op) => {
      if (!P) return op;
      const path = new P();
      tracePath(path, op.path);
      let clip = null;
      if (op.clip) {
        clip = new P();
        tracePath(clip, op.clip);
      }
      return { ...op, p2d: path, clip2d: clip };
    });
    prepared.set(el, ops);
  }
  return ops;
}

// `imageFilter`: a canvas filter for pictures (the editor's dark appearance inverts the canvas; pictures are
// inverted back so they keep their colours).
export function paintElement(ctx, el, files, imageFilter = '') {
  ctx.save();
  if (el.type === 'image') {
    const b = bounds(el);
    ctx.globalAlpha = el.opacity;
    if (el.angle) {
      const c = center(el);
      ctx.translate(c.x, c.y);
      ctx.rotate(el.angle);
      ctx.translate(-c.x, -c.y);
    }
    const p = picture(files?.[el.fileId]);
    if (imageFilter) ctx.filter = imageFilter;
    if (p?.ready) ctx.drawImage(p.img, b.x, b.y, b.w, b.h);
    else {
      ctx.fillStyle = 'rgba(134, 142, 150, 0.25)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
    return;
  }
  if (el.type === 'frame') {
    const b = bounds(el);
    ctx.fillStyle = FRAME_COLOR;
    ctx.font = `14px ${FRAME_FONT}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(frameTitle(el), b.x, b.y - 4, Math.max(40, b.w));
  }
  if (el.type === 'text') {
    const L = textLayout(el);
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle = el.stroke;
    ctx.font = `${el.fontSize}px ${fontOf(el)}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = L.anchor === 'middle' ? 'center' : 'left';
    if (L.angle) {
      ctx.translate(L.c.x, L.c.y);
      ctx.rotate(L.angle);
      ctx.translate(-L.c.x, -L.c.y);
    }
    for (const l of L.lines) ctx.fillText(l.t, l.x, l.y);
    ctx.restore();
    return;
  }
  for (const op of opsOf(el)) {
    ctx.save();
    ctx.globalAlpha = op.opacity ?? 1;
    if (op.clip) {
      if (op.clip2d) ctx.clip(op.clip2d);
      else {
        ctx.beginPath();
        tracePath(ctx, op.clip);
        ctx.clip();
      }
    }
    if (!op.p2d) {
      ctx.beginPath();
      tracePath(ctx, op.path);
    }
    if (op.fill) {
      ctx.fillStyle = op.fill;
      if (op.p2d) ctx.fill(op.p2d);
      else ctx.fill();
    } else {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(op.dotted ? [0.1, op.width * 2.4] : op.dashed ? [op.width * 4, op.width * 3] : []);
      // A flow moves its dashes from start to end: one pattern length per FLOW_PERIOD.
      if (op.flow) ctx.lineDashOffset = -((flowTime % FLOW_PERIOD) / FLOW_PERIOD) * op.width * 7;
      if (op.p2d) ctx.stroke(op.p2d);
      else ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// Animated lines: the time their dashes are painted at (ms), set by paintScene; 0 paints them still.
export const FLOW_PERIOD = 700;
let flowTime = 0;
export const hasFlow = (elements) => elements.some((e) => e.animated === true && (e.type === 'arrow' || e.type === 'line'));

// view: { x, y, zoom } (offset in screen pixels, and scale).
// `hideFrames`: frames still clip what lies on them but their border and title aren't painted (presenting).
export function paintScene(ctx, scene, { view = { x: 0, y: 0, zoom: 1 }, width, height, background = true, imageFilter = '', time = 0, hideFrames = false } = {}) {
  flowTime = Number.isFinite(time) ? time : 0;
  ctx.save();
  if (background) {
    ctx.fillStyle = scene.background || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  // Only what is visible (with a margin for the stroke's width and wobble).
  const m = 20 / view.zoom;
  const x1 = -view.x / view.zoom - m;
  const y1 = -view.y / view.zoom - m;
  const x2 = (width - view.x) / view.zoom + m;
  const y2 = (height - view.y) / view.zoom + m;
  const clipTo = frameOwners(scene.elements);
  for (const el of scene.elements) {
    if (hideFrames && el.type === 'frame') continue;
    const b = aabb(el);
    if (b.x > x2 || b.y > y2 || b.x + b.w < x1 || b.y + b.h < y1) continue;
    // What lies on a frame is cut at its border.
    const f = clipTo.get(el.id);
    if (f) {
      const fb = bounds(f);
      ctx.save();
      ctx.beginPath();
      ctx.rect(fb.x, fb.y, fb.w, fb.h);
      ctx.clip();
    }
    paintElement(ctx, el, scene.files, imageFilter);
    if (f) ctx.restore();
  }
  ctx.restore();
}

// Every number written into SVG markup goes through n(): a scene that skipped parseScene (an embedder's own
// object) can't slip markup in through a numeric field.
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Scene → SVG as text (to download). `padding` around the drawing.
// `background: false` leaves it out (a transparent SVG).
export function toSvgString(scene, { padding = 20, background = true, box = null } = {}) {
  const b = box || sceneBounds(scene.elements);
  const W = Math.ceil(b.w + padding * 2);
  const H = Math.ceil(b.h + padding * 2);
  const parts = [];
  let clipN = 0;
  const clipTo = frameOwners(scene.elements);
  const frameClips = new Map(); // frame id → its clipPath's id
  for (const el of scene.elements) {
    const mark = parts.length;
    // One element's markup; `continue` leaves this block (do … while (false)), then it is cut to its frame.
    do {
    if (el.type === 'text') {
      const L = textLayout(el);
      const anchor = L.anchor === 'middle' ? 'middle' : 'start';
      const lines = L.lines.map((l) => `<text x="${n(l.x)}" y="${n(l.y)}" font-size="${n(el.fontSize, 24)}" font-family="${esc(fontOf(el))}" fill="${esc(el.stroke)}" opacity="${n(el.opacity, 1)}" text-anchor="${anchor}" dominant-baseline="hanging">${esc(l.t)}</text>`).join('');
      parts.push(L.angle ? `<g transform="rotate(${(n(L.angle) * 180) / Math.PI} ${n(L.c.x)} ${n(L.c.y)})">${lines}</g>` : lines);
      continue;
    }
    if (el.type === 'image') {
      const data = scene.files?.[el.fileId];
      if (!isImageData(data)) continue; // only checked pictures go into the markup
      const ib = bounds(el);
      const c = center(el);
      const rot = el.angle ? ` transform="rotate(${(n(el.angle) * 180) / Math.PI} ${n(c.x)} ${n(c.y)})"` : '';
      parts.push(`<image href="${data}" x="${n(ib.x)}" y="${n(ib.y)}" width="${n(ib.w)}" height="${n(ib.h)}" preserveAspectRatio="none" opacity="${n(el.opacity, 1)}"${rot}/>`);
      continue;
    }
    if (el.type === 'frame') {
      const fb = bounds(el);
      parts.push(`<text x="${n(fb.x)}" y="${n(fb.y - 4)}" font-size="14" font-family="${esc(FRAME_FONT)}" fill="${FRAME_COLOR}">${esc(frameTitle(el))}</text>`);
    }
    for (const op of drawOps(el)) {
      let clip = '';
      if (op.clip) {
        clipN += 1;
        parts.push(`<clipPath id="c${clipN}"><path d="${toSvgD(op.clip)}"/></clipPath>`);
        clip = ` clip-path="url(#c${clipN})"`;
      }
      const style = op.fill
        ? `fill="${esc(op.fill)}" stroke="none"`
        : `fill="none" stroke="${esc(op.stroke)}" stroke-width="${n(op.width, 2)}" stroke-linecap="round" stroke-linejoin="round"${op.dotted ? ` stroke-dasharray="0.1 ${n(op.width, 2) * 2.4}"` : op.dashed ? ` stroke-dasharray="${n(op.width, 2) * 4} ${n(op.width, 2) * 3}"` : ''}`;
      // A flow: the dashes move with SVG's own animation (no script).
      const flow = op.flow ? `<animate attributeName="stroke-dashoffset" from="${n(op.width, 2) * 7}" to="0" dur="${FLOW_PERIOD / 1000}s" repeatCount="indefinite"/>` : '';
      parts.push(flow ? `<path d="${toSvgD(op.path)}" ${style} opacity="${n(op.opacity, 1)}"${clip}>${flow}</path>` : `<path d="${toSvgD(op.path)}" ${style} opacity="${n(op.opacity, 1)}"${clip}/>`);
    }
    } while (false);
    const f = clipTo.get(el.id);
    if (f && parts.length > mark) {
      const body = parts.splice(mark);
      let id = frameClips.get(f.id);
      if (!id) {
        id = `f${frameClips.size + 1}`;
        frameClips.set(f.id, id);
        const fb = bounds(f);
        parts.push(`<clipPath id="${id}"><rect x="${n(fb.x)}" y="${n(fb.y)}" width="${n(fb.w)}" height="${n(fb.h)}"/></clipPath>`);
      }
      parts.push(`<g clip-path="url(#${id})">${body.join('')}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="${n(b.x - padding)} ${n(b.y - padding)} ${n(W)} ${n(H)}">`
    + (background ? `<rect x="${n(b.x - padding)}" y="${n(b.y - padding)}" width="${n(W)}" height="${n(H)}" fill="${esc(scene.background || '#ffffff')}"/>` : '')
    + `${parts.join('')}</svg>\n`;
}

// Scene → an <svg> node built with the DOM (no innerHTML), to embed in another page.
export function toSvgElement(doc, scene, { padding = 20, maxWidth = null, background = true } = {}) {
  measureWithCanvas(doc);
  const NS = 'http://www.w3.org/2000/svg';
  const b = sceneBounds(scene.elements);
  const W = Math.ceil(b.w + padding * 2);
  const H = Math.ceil(b.h + padding * 2);
  const mk = (tag, attrs) => {
    const n = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const svg = mk('svg', { viewBox: `${b.x - padding} ${b.y - padding} ${W} ${H}`, width: maxWidth ? Math.min(W, maxWidth) : W, role: 'img' });
  if (background) svg.append(mk('rect', { x: b.x - padding, y: b.y - padding, width: W, height: H, fill: scene.background || '#ffffff' }));
  let clipN = 0;
  const prefix = `s${Math.random().toString(36).slice(2, 8)}`;
  const clipTo = frameOwners(scene.elements);
  const frameClips = new Map();
  for (const el of scene.elements) {
    // What lies on a frame goes in a group cut at the frame's border.
    let host = svg;
    const f = clipTo.get(el.id);
    if (f) {
      if (!frameClips.has(f.id)) {
        const fb = bounds(f);
        const cp = mk('clipPath', { id: `${prefix}f${frameClips.size + 1}` });
        cp.append(mk('rect', { x: fb.x, y: fb.y, width: fb.w, height: fb.h }));
        svg.append(cp);
        frameClips.set(f.id, cp.getAttribute('id'));
      }
      host = mk('g', { 'clip-path': `url(#${frameClips.get(f.id)})` });
      svg.append(host);
    }
    if (el.type === 'text') {
      const L = textLayout(el);
      const g = L.angle ? mk('g', { transform: `rotate(${(L.angle * 180) / Math.PI} ${L.c.x} ${L.c.y})` }) : host;
      for (const l of L.lines) {
        const t = mk('text', { x: l.x, y: l.y, 'font-size': el.fontSize, 'font-family': fontOf(el), fill: el.stroke, opacity: el.opacity, 'text-anchor': L.anchor, 'dominant-baseline': 'hanging' });
        t.textContent = l.t;
        g.append(t);
      }
      if (g !== host) host.append(g);
      continue;
    }
    if (el.type === 'image') {
      const data = scene.files?.[el.fileId];
      if (!isImageData(data)) continue;
      const ib = bounds(el);
      const c = center(el);
      const attrs = { href: data, x: ib.x, y: ib.y, width: ib.w, height: ib.h, preserveAspectRatio: 'none', opacity: el.opacity ?? 1 };
      if (el.angle) attrs.transform = `rotate(${(el.angle * 180) / Math.PI} ${c.x} ${c.y})`;
      host.append(mk('image', attrs));
      continue;
    }
    if (el.type === 'frame') {
      const fb = bounds(el);
      const t = mk('text', { x: fb.x, y: fb.y - 4, 'font-size': 14, 'font-family': FRAME_FONT, fill: FRAME_COLOR });
      t.textContent = frameTitle(el);
      svg.append(t);
    }
    for (const op of drawOps(el)) {
      const attrs = op.fill
        ? { d: toSvgD(op.path), fill: op.fill, stroke: 'none', opacity: op.opacity ?? 1 }
        : { d: toSvgD(op.path), fill: 'none', stroke: op.stroke, 'stroke-width': op.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op.opacity ?? 1 };
      if (!op.fill && op.dashed) attrs['stroke-dasharray'] = op.dotted ? `0.1 ${op.width * 2.4}` : `${op.width * 4} ${op.width * 3}`;
      if (op.clip) {
        clipN += 1;
        const cp = mk('clipPath', { id: `${prefix}c${clipN}` });
        cp.append(mk('path', { d: toSvgD(op.clip) }));
        svg.append(cp);
        attrs['clip-path'] = `url(#${prefix}c${clipN})`;
      }
      const path = mk('path', attrs);
      if (op.flow) path.append(mk('animate', { attributeName: 'stroke-dashoffset', from: op.width * 7, to: 0, dur: `${FLOW_PERIOD / 1000}s`, repeatCount: 'indefinite' }));
      host.append(path);
    }
  }
  return svg;
}

// Browsers refuse canvases that are too big (toBlob then gives null): Chrome stops at 32,767 px a
// side, Safari on the iPhone at about 16.7 million pixels. A bigger drawing is exported smaller.
export const PNG_MAX_SIDE = 16384;
export const PNG_MAX_AREA = 16777216;
export function pngScale(w, h, scale) {
  const fit = Math.min(scale, PNG_MAX_SIDE / w, PNG_MAX_SIDE / h, Math.sqrt(PNG_MAX_AREA / (w * h)));
  return Number.isFinite(fit) && fit > 0 ? fit : scale;
}

// Scene → PNG (Blob) at `scale` times its size, or less if it would not fit; null if it cannot be made.
// `background: false` gives transparent pixels outside the shapes.
export async function toPngBlob(doc, scene, { padding = 20, scale = 2, background = true, box = null } = {}) {
  measureWithCanvas(doc);
  await fontReady(doc);
  await imagesReady(scene);
  const b = box || sceneBounds(scene.elements);
  scale = pngScale(b.w + padding * 2, b.h + padding * 2, scale);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((b.w + padding * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((b.h + padding * 2) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintScene(ctx, scene, { background, width: canvas.width, height: canvas.height, view: { x: (padding - b.x) * scale, y: (padding - b.y) * scale, zoom: scale } });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
