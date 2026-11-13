// Copiado de serbenda/sketch (js/pintar.js, commit 80f776f) con scripts/update-sketch.mjs. No editar aquí.
// Pinta una escena en un <canvas> o la convierte en SVG (texto para descargar o nodos DOM para
// incrustar). Los textos del dibujo nunca se meten como HTML: se escapan o van con textContent.

import { drawOps, sceneBounds, textLayout, setTextMeasurer, aabb, FONT, FONT_NAME } from './sketch-escena.js';
import { toSvgD, tracePath } from './sketch-trazo.js';

// Mide los textos con un canvas (la letra a mano es más estrecha que la estimación sin DOM).
let measuring = false;
export function measureWithCanvas(doc) {
  if (measuring) return;
  const ctx = doc.createElement('canvas').getContext('2d');
  if (!ctx) return;
  measuring = true;
  setTextMeasurer((text, fontSize) => {
    ctx.font = `${fontSize}px ${FONT}`;
    return ctx.measureText(text).width;
  });
}

// Promesa que se cumple cuando la letra a mano está lista (o no se puede cargar).
export function fontReady(doc) {
  try {
    return Promise.resolve(doc.fonts?.load(`24px "${FONT_NAME}"`)).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

// Trazos ya preparados por elemento (Path2D si existe): pintar de nuevo un elemento que no ha cambiado
// no vuelve a calcular su trazo a mano ni su rayado. Los elementos nunca se cambian en el sitio.
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

export function paintElement(ctx, el) {
  ctx.save();
  if (el.type === 'text') {
    const L = textLayout(el);
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle = el.stroke;
    ctx.font = `${el.fontSize}px ${FONT}`;
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
      ctx.setLineDash(op.dashed ? [op.width * 4, op.width * 3] : []);
      if (op.p2d) ctx.stroke(op.p2d);
      else ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// view: { x, y, zoom } (desplazamiento en píxeles de pantalla y escala).
export function paintScene(ctx, scene, { view = { x: 0, y: 0, zoom: 1 }, width, height, background = true } = {}) {
  ctx.save();
  if (background) {
    ctx.fillStyle = scene.background || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  // Solo lo que se ve (con margen para el grosor y el temblor del trazo).
  const m = 20 / view.zoom;
  const x1 = -view.x / view.zoom - m;
  const y1 = -view.y / view.zoom - m;
  const x2 = (width - view.x) / view.zoom + m;
  const y2 = (height - view.y) / view.zoom + m;
  for (const el of scene.elements) {
    const b = aabb(el);
    if (b.x > x2 || b.y > y2 || b.x + b.w < x1 || b.y + b.h < y1) continue;
    paintElement(ctx, el);
  }
  ctx.restore();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Escena → SVG como texto (para descargar). `padding` alrededor del dibujo.
export function toSvgString(scene, { padding = 20 } = {}) {
  const b = sceneBounds(scene.elements);
  const W = Math.ceil(b.w + padding * 2);
  const H = Math.ceil(b.h + padding * 2);
  const parts = [];
  let clipN = 0;
  for (const el of scene.elements) {
    if (el.type === 'text') {
      const L = textLayout(el);
      const lines = L.lines.map((l) => `<text x="${l.x}" y="${l.y}" font-size="${el.fontSize}" font-family="${esc(FONT)}" fill="${esc(el.stroke)}" opacity="${el.opacity}" text-anchor="${L.anchor}" dominant-baseline="hanging">${esc(l.t)}</text>`).join('');
      parts.push(L.angle ? `<g transform="rotate(${(L.angle * 180) / Math.PI} ${L.c.x} ${L.c.y})">${lines}</g>` : lines);
      continue;
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
        : `fill="none" stroke="${esc(op.stroke)}" stroke-width="${op.width}" stroke-linecap="round" stroke-linejoin="round"${op.dashed ? ` stroke-dasharray="${op.width * 4} ${op.width * 3}"` : ''}`;
      parts.push(`<path d="${toSvgD(op.path)}" ${style} opacity="${op.opacity ?? 1}"${clip}/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${b.x - padding} ${b.y - padding} ${W} ${H}">`
    + `<rect x="${b.x - padding}" y="${b.y - padding}" width="${W}" height="${H}" fill="${esc(scene.background || '#ffffff')}"/>`
    + `${parts.join('')}</svg>\n`;
}

// Escena → nodo <svg> creado con el DOM (sin innerHTML), para incrustarlo en otra página.
export function toSvgElement(doc, scene, { padding = 20, maxWidth = null } = {}) {
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
  svg.append(mk('rect', { x: b.x - padding, y: b.y - padding, width: W, height: H, fill: scene.background || '#ffffff' }));
  let clipN = 0;
  const prefix = `s${Math.random().toString(36).slice(2, 8)}`;
  for (const el of scene.elements) {
    if (el.type === 'text') {
      const L = textLayout(el);
      const g = L.angle ? mk('g', { transform: `rotate(${(L.angle * 180) / Math.PI} ${L.c.x} ${L.c.y})` }) : svg;
      for (const l of L.lines) {
        const t = mk('text', { x: l.x, y: l.y, 'font-size': el.fontSize, 'font-family': FONT, fill: el.stroke, opacity: el.opacity, 'text-anchor': L.anchor, 'dominant-baseline': 'hanging' });
        t.textContent = l.t;
        g.append(t);
      }
      if (g !== svg) svg.append(g);
      continue;
    }
    for (const op of drawOps(el)) {
      const attrs = op.fill
        ? { d: toSvgD(op.path), fill: op.fill, stroke: 'none', opacity: op.opacity ?? 1 }
        : { d: toSvgD(op.path), fill: 'none', stroke: op.stroke, 'stroke-width': op.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op.opacity ?? 1 };
      if (!op.fill && op.dashed) attrs['stroke-dasharray'] = `${op.width * 4} ${op.width * 3}`;
      if (op.clip) {
        clipN += 1;
        const cp = mk('clipPath', { id: `${prefix}c${clipN}` });
        cp.append(mk('path', { d: toSvgD(op.clip) }));
        svg.append(cp);
        attrs['clip-path'] = `url(#${prefix}c${clipN})`;
      }
      svg.append(mk('path', attrs));
    }
  }
  return svg;
}

// Escena → PNG (Blob) a `scale` veces su tamaño.
export async function toPngBlob(doc, scene, { padding = 20, scale = 2 } = {}) {
  measureWithCanvas(doc);
  await fontReady(doc);
  const b = sceneBounds(scene.elements);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((b.w + padding * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((b.h + padding * 2) * scale));
  const ctx = canvas.getContext('2d');
  paintScene(ctx, scene, { width: canvas.width, height: canvas.height, view: { x: (padding - b.x) * scale, y: (padding - b.y) * scale, zoom: scale } });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
