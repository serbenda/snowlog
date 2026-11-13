// Copiado de serbenda/sketch (js/editor.js, commit db44696) con scripts/update-sketch.mjs. No editar aquí.
// Editor de dibujos: barra de herramientas, lienzo y panel de estilo. Se monta en cualquier
// contenedor (la web de sketch o Snowlog) y no usa innerHTML: todo se crea con el DOM.
//
//   const ed = createEditor(contenedor, { scene, onChange, onExport })
//   ed.getScene() · ed.setScene(scene) · ed.zoomToFit() · ed.focus() · ed.destroy()

import * as E from './sketch-escena.js';
import { paintScene } from './sketch-pintar.js';

const NS = 'http://www.w3.org/2000/svg';

// Iconos propios, de línea.
const ICONS = {
  select: 'M5 3l14 8-6 2-3 6z',
  hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13',
  rectangle: 'M4 6h16v12H4z',
  diamond: 'M12 3l9 9-9 9-9-9z',
  ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
  arrow: 'M4 20L20 4 M10 4h10v10',
  line: 'M4 20L20 4',
  draw: 'M3 17c3-4 5-9 8-9s1 9 4 9 4-6 6-8',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  eraser: 'M8 20h12 M5 15l9-9 5 5-9 9H8z',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  minus: 'M5 12h14',
  plus: 'M12 5v14 M5 12h14',
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  front: 'M8 8h12v12H8z M4 4h10v2 M4 4v10h2',
  back: 'M4 4h12v12H4z M18 8h2v12H8v-2',
};

const TOOLS = [
  ['select', 'Seleccionar', 'V'], ['hand', 'Mover el lienzo', 'H'], ['rectangle', 'Rectángulo', 'R'],
  ['diamond', 'Rombo', 'D'], ['ellipse', 'Elipse', 'O'], ['arrow', 'Flecha', 'A'], ['line', 'Línea', 'L'],
  ['draw', 'Lápiz', 'P'], ['text', 'Texto', 'T'], ['eraser', 'Borrar', 'E'],
];

const STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
const FILLS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];

function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'sk-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}

export function createEditor(container, { scene: initial, onChange = () => {}, readOnly = false } = {}) {
  let scene = initial ? structuredClone(initial) : E.emptyScene();
  let selected = new Set();
  let tool = 'select';
  let view = { x: 0, y: 0, zoom: 1 };
  let style = { ...E.DEFAULT_STYLE };
  const undo = [];
  const redo = [];
  let action = null; // lo que se está haciendo con el puntero
  let editingText = null;
  let raf = 0;
  let clipboard = null;

  // --- DOM ---
  const root = el('div', { class: `sk-editor${readOnly ? ' sk-readonly' : ''}`, tabindex: '0' });
  const canvas = el('canvas', { class: 'sk-canvas', 'aria-label': 'Lienzo de dibujo' });
  const textBox = el('textarea', { class: 'sk-textbox', 'aria-label': 'Texto', spellcheck: 'false', hidden: true });
  const toolButtons = new Map();
  const toolbar = el('div', { class: 'sk-toolbar', role: 'toolbar', 'aria-label': 'Herramientas' },
    ...TOOLS.map(([id, label, key]) => {
      const b = el('button', { class: 'sk-btn', type: 'button', title: `${label} (${key})`, 'aria-label': label, 'aria-pressed': 'false', onclick: () => setTool(id) }, icon(id));
      toolButtons.set(id, b);
      return b;
    }));
  const swatch = (color, onPick, label) => {
    const b = el('button', {
      class: `sk-swatch${color === 'transparent' ? ' sk-none' : ''}`, type: 'button', title: label, 'aria-label': label, 'data-color': color, onclick: () => onPick(color),
    });
    if (color !== 'transparent') b.style.backgroundColor = color;
    return b;
  };
  const strokeColor = el('input', { type: 'color', class: 'sk-color', 'aria-label': 'Otro color de trazo', value: style.stroke });
  const fillColor = el('input', { type: 'color', class: 'sk-color', 'aria-label': 'Otro color de relleno', value: '#a5d8ff' });
  const seg = (name, options, onPick) => el('div', { class: 'sk-seg', role: 'group', 'aria-label': name },
    ...options.map(([value, label]) => el('button', { class: 'sk-segbtn', type: 'button', 'data-value': String(value), onclick: () => onPick(value) }, label)));
  const panel = el('div', { class: 'sk-panel', 'aria-label': 'Estilo' },
    el('div', { class: 'sk-label' }, 'Trazo'),
    el('div', { class: 'sk-row', 'data-prop': 'stroke' }, ...STROKES.map((c) => swatch(c, (v) => setStyle({ stroke: v }), `Trazo ${c}`)), strokeColor),
    el('div', { class: 'sk-label' }, 'Relleno'),
    el('div', { class: 'sk-row', 'data-prop': 'fill' }, ...FILLS.map((c) => swatch(c, (v) => setStyle({ fill: v }), c === 'transparent' ? 'Sin relleno' : `Relleno ${c}`)), fillColor),
    seg('Tipo de relleno', [['hachure', 'Rayado'], ['solid', 'Sólido']], (v) => setStyle({ fillStyle: v })),
    el('div', { class: 'sk-label' }, 'Grosor'),
    seg('Grosor', [[1, 'Fino'], [2, 'Medio'], [4, 'Grueso']], (v) => setStyle({ width: v })),
    el('div', { class: 'sk-label' }, 'Línea'),
    seg('Línea', [[false, 'Continua'], [true, 'Discontinua']], (v) => setStyle({ dashed: v })),
    el('div', { class: 'sk-label' }, 'Trazo a mano'),
    seg('Trazo a mano', [[0, 'Recto'], [1, 'A mano'], [2, 'Muy a mano']], (v) => setStyle({ roughness: v })),
    el('div', { class: 'sk-label' }, 'Texto'),
    seg('Tamaño del texto', [[16, 'S'], [24, 'M'], [36, 'L'], [56, 'XL']], (v) => setStyle({ fontSize: v })),
    el('div', { class: 'sk-label' }, 'Capas y acciones'),
    el('div', { class: 'sk-row' },
      el('button', { class: 'sk-btn', type: 'button', title: 'Traer al frente', 'aria-label': 'Traer al frente', onclick: () => reorder(1) }, icon('front')),
      el('button', { class: 'sk-btn', type: 'button', title: 'Enviar al fondo', 'aria-label': 'Enviar al fondo', onclick: () => reorder(-1) }, icon('back')),
      el('button', { class: 'sk-btn', type: 'button', title: 'Duplicar (Ctrl+D)', 'aria-label': 'Duplicar', onclick: () => duplicate() }, icon('copy')),
      el('button', { class: 'sk-btn', type: 'button', title: 'Eliminar (Supr)', 'aria-label': 'Eliminar', onclick: () => removeSelected() }, icon('trash'))));
  const zoomLabel = el('button', { class: 'sk-zoomlabel', type: 'button', title: 'Volver al 100 %', 'aria-label': 'Volver al 100 %', onclick: () => zoomAt(1 / view.zoom) }, '100 %');
  const bottom = el('div', { class: 'sk-bottom' },
    el('div', { class: 'sk-group' },
      el('button', { class: 'sk-btn', type: 'button', title: 'Alejar', 'aria-label': 'Alejar', onclick: () => zoomAt(1 / 1.2) }, icon('minus')),
      zoomLabel,
      el('button', { class: 'sk-btn', type: 'button', title: 'Acercar', 'aria-label': 'Acercar', onclick: () => zoomAt(1.2) }, icon('plus')),
      el('button', { class: 'sk-btn', type: 'button', title: 'Ver todo', 'aria-label': 'Ver todo el dibujo', onclick: () => zoomToFit() }, icon('fit'))),
    el('div', { class: 'sk-group' },
      el('button', { class: 'sk-btn', type: 'button', title: 'Deshacer (Ctrl+Z)', 'aria-label': 'Deshacer', onclick: () => doUndo() }, icon('undo')),
      el('button', { class: 'sk-btn', type: 'button', title: 'Rehacer (Ctrl+Y)', 'aria-label': 'Rehacer', onclick: () => doRedo() }, icon('redo'))));
  const stage = el('div', { class: 'sk-stage' }, canvas, textBox);
  if (readOnly) root.append(stage);
  else root.append(stage, toolbar, panel, bottom);
  container.append(root);
  const ctx = canvas.getContext('2d');

  // --- Dibujo ---
  const toWorld = (sx, sy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (sx - r.left - view.x) / view.zoom, y: (sy - r.top - view.y) / view.zoom };
  };
  const byId = (id) => scene.elements.find((e) => e.id === id);
  const selection = () => scene.elements.filter((e) => selected.has(e.id));

  function selectionBox() {
    const s = selection();
    return s.length ? E.sceneBounds(s) : null;
  }

  function handles(b) {
    const pad = 6 / view.zoom;
    const x1 = b.x - pad;
    const y1 = b.y - pad;
    const x2 = b.x + b.w + pad;
    const y2 = b.y + b.h + pad;
    return { nw: [x1, y1], ne: [x2, y1], sw: [x1, y2], se: [x2, y2], n: [(x1 + x2) / 2, y1], s: [(x1 + x2) / 2, y2], w: [x1, (y1 + y2) / 2], e: [x2, (y1 + y2) / 2] };
  }

  function render() {
    raf = 0;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hidden = editingText ? { ...scene, elements: scene.elements.filter((e) => e.id !== editingText) } : scene;
    paintScene(ctx, hidden, { view, width: r.width, height: r.height });
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    const accent = getComputedStyle(root).getPropertyValue('--sk-accent').trim() || '#6965db';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1 / view.zoom;
    if (selected.size && !readOnly) {
      for (const e of selection()) {
        const b = E.bounds(e);
        ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
        ctx.strokeRect(b.x - 4 / view.zoom, b.y - 4 / view.zoom, b.w + 8 / view.zoom, b.h + 8 / view.zoom);
      }
      ctx.setLineDash([]);
      const b = selectionBox();
      if (b && !(action && action.kind === 'move')) {
        ctx.fillStyle = '#ffffff';
        for (const [, [hx, hy]] of Object.entries(handles(b))) {
          const s = 8 / view.zoom;
          ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
          ctx.strokeRect(hx - s / 2, hy - s / 2, s, s);
        }
      }
    }
    if (action?.kind === 'marquee') {
      ctx.fillStyle = `${accent}22`;
      const m = action.box;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    }
    ctx.restore();
    zoomLabel.textContent = `${Math.round(view.zoom * 100)} %`;
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };

  // --- Historial ---
  function commit() {
    undo.push(JSON.stringify(scene.elements));
    if (undo.length > 200) undo.shift();
    redo.length = 0;
  }
  function changed() {
    redraw();
    syncPanel();
    onChange(getScene());
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(JSON.stringify(scene.elements));
    scene.elements = JSON.parse(undo.pop());
    selected = new Set([...selected].filter((id) => byId(id)));
    changed();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(JSON.stringify(scene.elements));
    scene.elements = JSON.parse(redo.pop());
    selected = new Set([...selected].filter((id) => byId(id)));
    changed();
  }

  // --- Herramientas y estilo ---
  function setTool(t) {
    finishText();
    tool = t;
    if (t !== 'select') selected.clear();
    for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(id === t));
    canvas.style.cursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    redraw();
    syncPanel();
  }

  function setStyle(patch) {
    style = { ...style, ...patch };
    if (selected.size) {
      commit();
      scene.elements = scene.elements.map((e) => (selected.has(e.id) ? { ...e, ...patch } : e));
      changed();
    } else {
      syncPanel();
    }
  }

  // El panel muestra el estilo de lo seleccionado (o el que se usará al dibujar).
  function syncPanel() {
    const s = selection();
    const cur = s.length ? s[s.length - 1] : style;
    panel.hidden = readOnly || (tool === 'select' && !s.length) || tool === 'hand' || tool === 'eraser';
    for (const b of panel.querySelectorAll('.sk-swatch')) {
      const prop = b.parentElement.dataset.prop;
      b.setAttribute('aria-pressed', String(cur[prop] === b.dataset.color));
    }
    const segs = panel.querySelectorAll('.sk-seg');
    const props = ['fillStyle', 'width', 'dashed', 'roughness', 'fontSize'];
    segs.forEach((g, i) => {
      for (const b of g.children) b.setAttribute('aria-pressed', String(String(cur[props[i]]) === b.dataset.value));
    });
  }

  function addElement(e) {
    scene.elements.push(e);
  }

  function removeSelected() {
    if (!selected.size) return;
    commit();
    scene.elements = scene.elements.filter((e) => !selected.has(e.id));
    selected.clear();
    changed();
  }

  function duplicate() {
    if (!selected.size) return;
    commit();
    const copies = selection().map((e) => ({ ...structuredClone(e), id: E.newId(), seed: E.newSeed(), x: e.x + 16, y: e.y + 16 }));
    scene.elements.push(...copies);
    selected = new Set(copies.map((c) => c.id));
    changed();
  }

  function reorder(dir) {
    if (!selected.size) return;
    commit();
    const sel = selection();
    const rest = scene.elements.filter((e) => !selected.has(e.id));
    scene.elements = dir > 0 ? [...rest, ...sel] : [...sel, ...rest];
    changed();
  }

  // --- Texto ---
  function editText(id) {
    const t = byId(id);
    if (!t) return;
    editingText = id;
    const r = canvas.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    textBox.hidden = false;
    textBox.value = t.text || '';
    textBox.style.left = `${t.x * view.zoom + view.x + (r.left - sr.left)}px`;
    textBox.style.top = `${t.y * view.zoom + view.y + (r.top - sr.top)}px`;
    textBox.style.fontSize = `${t.fontSize * view.zoom}px`;
    textBox.style.color = t.stroke;
    textBox.style.lineHeight = '1.25';
    fitTextBox();
    redraw();
    textBox.focus({ preventScroll: true });
    setTimeout(() => { if (editingText === id) textBox.focus({ preventScroll: true }); }, 0);
  }
  function fitTextBox() {
    textBox.style.width = '1px';
    textBox.style.height = '1px';
    textBox.style.width = `${Math.max(40, textBox.scrollWidth + 8)}px`;
    textBox.style.height = `${textBox.scrollHeight}px`;
  }
  function finishText() {
    if (!editingText) return;
    const id = editingText;
    editingText = null;
    textBox.hidden = true;
    const t = byId(id);
    if (!t) return;
    const text = textBox.value.replace(/\s+$/, '');
    if (!text.trim()) {
      scene.elements = scene.elements.filter((e) => e.id !== id);
      selected.delete(id);
    } else if (text !== t.text) {
      scene.elements = scene.elements.map((e) => (e.id === id ? { ...e, text } : e));
    }
    changed();
  }
  textBox.addEventListener('input', fitTextBox);
  textBox.addEventListener('blur', finishText);
  textBox.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) {
      ev.preventDefault();
      finishText();
      root.focus();
    }
    ev.stopPropagation();
  });

  // --- Zoom y vista ---
  function zoomAt(factor, sx, sy) {
    const r = canvas.getBoundingClientRect();
    const px = sx ?? r.left + r.width / 2;
    const py = sy ?? r.top + r.height / 2;
    const z = Math.max(0.1, Math.min(8, view.zoom * factor));
    const k = z / view.zoom;
    view = { zoom: z, x: px - r.left - (px - r.left - view.x) * k, y: py - r.top - (py - r.top - view.y) * k };
    redraw();
  }

  function zoomToFit() {
    const r = canvas.getBoundingClientRect();
    if (!scene.elements.length || !r.width) {
      view = { x: r.width / 2, y: r.height / 2, zoom: 1 };
      redraw();
      return;
    }
    const b = E.sceneBounds(scene.elements);
    const z = Math.max(0.1, Math.min(2, Math.min((r.width - 80) / (b.w || 1), (r.height - 80) / (b.h || 1))));
    view = { zoom: z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
    redraw();
  }

  // --- Puntero ---
  const pointers = new Map();
  function handleAt(wx, wy) {
    const b = selectionBox();
    if (!b) return null;
    const tol = 8 / view.zoom;
    for (const [name, [hx, hy]] of Object.entries(handles(b))) if (Math.abs(wx - hx) <= tol && Math.abs(wy - hy) <= tol) return name;
    return null;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (tool !== 'text') root.focus({ preventScroll: true });
    else ev.preventDefault(); // que el clic no quite el foco al cuadro de texto que se va a abrir
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      // Dos dedos: pellizcar para acercar y arrastrar para mover.
      const [a, b] = [...pointers.values()];
      action = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view } };
      return;
    }
    if (editingText) finishText();
    const p = toWorld(ev.clientX, ev.clientY);
    if (readOnly || tool === 'hand' || ev.button === 1 || spaceDown) {
      action = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, view: { ...view } };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (tool === 'eraser') {
      action = { kind: 'erase', started: false };
      eraseAt(p);
      return;
    }
    if (tool === 'select') {
      const h = handleAt(p.x, p.y);
      if (h) {
        commit();
        action = { kind: 'resize', handle: h, start: p, box: selectionBox(), orig: selection().map((e) => structuredClone(e)) };
        return;
      }
      const hit = E.elementAt(scene.elements, p.x, p.y, 6 / view.zoom);
      if (hit) {
        if (ev.shiftKey) {
          if (selected.has(hit.id)) selected.delete(hit.id);
          else selected.add(hit.id);
        } else if (!selected.has(hit.id)) {
          selected = new Set([hit.id]);
        }
        commit();
        action = { kind: 'move', start: p, orig: selection().map((e) => structuredClone(e)), moved: false };
      } else {
        if (!ev.shiftKey) selected.clear();
        action = { kind: 'marquee', start: p, box: { x: p.x, y: p.y, w: 0, h: 0 } };
      }
      syncPanel();
      redraw();
      return;
    }
    if (tool === 'text') {
      commit();
      const t = E.createElement('text', p.x, p.y - style.fontSize * 0.6, { ...style, fill: 'transparent' });
      addElement(t);
      selected = new Set([t.id]);
      editText(t.id);
      return;
    }
    commit();
    const e = E.createElement(tool, p.x, p.y, tool === 'draw' ? { ...style, fill: 'transparent' } : style);
    addElement(e);
    action = { kind: 'create', id: e.id, start: p };
    redraw();
  });

  function eraseAt(p) {
    const hit = E.elementAt(scene.elements, p.x, p.y, 8 / view.zoom);
    if (!hit) return;
    if (!action.started) {
      commit();
      action.started = true;
    }
    scene.elements = scene.elements.filter((e) => e.id !== hit.id);
    selected.delete(hit.id);
    redraw();
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!action) {
      if (tool === 'select') {
        const p = toWorld(ev.clientX, ev.clientY);
        const h = handleAt(p.x, p.y);
        canvas.style.cursor = h ? (h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize')
          : E.elementAt(scene.elements, p.x, p.y, 6 / view.zoom) ? 'move' : 'default';
      }
      return;
    }
    if (action.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = canvas.getBoundingClientRect();
      const z = Math.max(0.1, Math.min(8, action.view.zoom * (dist / action.dist)));
      const k = z / action.view.zoom;
      view = {
        zoom: z,
        x: mid.x - r.left - (action.mid.x - r.left - action.view.x) * k,
        y: mid.y - r.top - (action.mid.y - r.top - action.view.y) * k,
      };
      redraw();
      return;
    }
    const p = toWorld(ev.clientX, ev.clientY);
    if (action.kind === 'pan') {
      view = { ...action.view, x: action.view.x + ev.clientX - action.sx, y: action.view.y + ev.clientY - action.sy };
    } else if (action.kind === 'erase') {
      eraseAt(p);
    } else if (action.kind === 'move') {
      const dx = p.x - action.start.x;
      const dy = p.y - action.start.y;
      action.moved = action.moved || Math.abs(dx) + Math.abs(dy) > 1 / view.zoom;
      const orig = new Map(action.orig.map((o) => [o.id, o]));
      scene.elements = scene.elements.map((e) => (orig.has(e.id) ? E.moveElement(orig.get(e.id), dx, dy) : e));
    } else if (action.kind === 'marquee') {
      action.box = { x: Math.min(action.start.x, p.x), y: Math.min(action.start.y, p.y), w: Math.abs(p.x - action.start.x), h: Math.abs(p.y - action.start.y) };
      selected = new Set(E.elementsInBox(scene.elements, action.box).map((e) => e.id));
    } else if (action.kind === 'resize') {
      const b = action.box;
      let { x, y } = b;
      let x2 = b.x + b.w;
      let y2 = b.y + b.h;
      if (action.handle.includes('w')) x = p.x;
      if (action.handle.includes('e')) x2 = p.x;
      if (action.handle.includes('n')) y = p.y;
      if (action.handle.includes('s')) y2 = p.y;
      if (ev.shiftKey && b.w && b.h) {
        // Mantener la proporción.
        const k = Math.max((x2 - x) / b.w, (y2 - y) / b.h);
        if (action.handle.includes('w')) x = x2 - b.w * k;
        else x2 = x + b.w * k;
        if (action.handle.includes('n')) y = y2 - b.h * k;
        else y2 = y + b.h * k;
      }
      const to = { x: Math.min(x, x2), y: Math.min(y, y2), w: Math.max(1, Math.abs(x2 - x)), h: Math.max(1, Math.abs(y2 - y)) };
      const orig = new Map(action.orig.map((o) => [o.id, o]));
      scene.elements = scene.elements.map((e) => (orig.has(e.id) ? E.resizeElement(orig.get(e.id), b, to) : e));
    } else if (action.kind === 'create') {
      scene.elements = scene.elements.map((e) => {
        if (e.id !== action.id) return e;
        let dx = p.x - action.start.x;
        let dy = p.y - action.start.y;
        if (e.type === 'draw') return { ...e, points: [...e.points, { x: dx, y: dy }] };
        if (e.type === 'line' || e.type === 'arrow') {
          if (ev.shiftKey) {
            // Ángulos de 15 en 15 grados.
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
            const d = Math.hypot(dx, dy);
            dx = Math.cos(a) * d;
            dy = Math.sin(a) * d;
          }
          return { ...e, points: [{ x: 0, y: 0 }, { x: dx, y: dy }] };
        }
        if (ev.shiftKey) {
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * s;
          dy = Math.sign(dy || 1) * s;
        }
        return { ...e, w: dx, h: dy };
      });
    }
    redraw();
  });

  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (!action) return;
    if (action.kind === 'pinch') {
      if (pointers.size < 2) action = null;
      return;
    }
    if (action.kind === 'create') {
      const e = byId(action.id);
      if (e && E.isEmpty(e)) {
        scene.elements = scene.elements.filter((x) => x.id !== e.id);
        undo.pop();
      } else if (e) {
        scene.elements = scene.elements.map((x) => (x.id === e.id ? E.normalize(x) : x));
        selected = new Set(tool === 'draw' ? [] : [e.id]);
        if (tool !== 'draw') setTool('select');
        action = null;
        changed();
        return;
      }
    } else if (action.kind === 'move' && !action.moved) {
      undo.pop();
    } else if (action.kind === 'pan') {
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
    const kind = action.kind;
    action = null;
    if (kind === 'move' || kind === 'resize' || (kind === 'erase')) changed();
    else {
      syncPanel();
      redraw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('dblclick', (ev) => {
    if (readOnly) return;
    const p = toWorld(ev.clientX, ev.clientY);
    const hit = E.elementAt(scene.elements, p.x, p.y, 6 / view.zoom);
    if (hit?.type === 'text') {
      commit();
      editText(hit.id);
    } else if (!hit) {
      commit();
      const t = E.createElement('text', p.x, p.y - style.fontSize * 0.6, { ...style, fill: 'transparent' });
      addElement(t);
      selected = new Set([t.id]);
      editText(t.id);
    }
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), ev.clientX, ev.clientY);
    else {
      view = { ...view, x: view.x - ev.deltaX, y: view.y - ev.deltaY };
      redraw();
    }
  }, { passive: false });

  // --- Teclado ---
  let spaceDown = false;
  const KEYS = Object.fromEntries(TOOLS.map(([id, , key]) => [key.toLowerCase(), id]));
  root.addEventListener('keydown', (ev) => {
    // Los atajos valen en todo el editor salvo al escribir en un campo.
    if (ev.target.closest('input, textarea, select')) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (ev.key === ' ') { spaceDown = true; canvas.style.cursor = 'grab'; ev.preventDefault(); return; }
    if (readOnly) return;
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); doUndo(); return; }
    if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); doRedo(); return; }
    if (mod && k === 'a') { ev.preventDefault(); selected = new Set(scene.elements.map((e) => e.id)); setTool('select'); selected = new Set(scene.elements.map((e) => e.id)); syncPanel(); redraw(); return; }
    if (mod && k === 'd') { ev.preventDefault(); duplicate(); return; }
    if (mod && k === 'c') { clipboard = selection().map((e) => structuredClone(e)); return; }
    if (mod && k === 'v' && clipboard?.length) {
      ev.preventDefault();
      commit();
      const copies = clipboard.map((e) => ({ ...structuredClone(e), id: E.newId(), seed: E.newSeed(), x: e.x + 24, y: e.y + 24 }));
      scene.elements.push(...copies);
      clipboard = copies;
      selected = new Set(copies.map((c) => c.id));
      changed();
      return;
    }
    if (mod && (k === '+' || k === '=')) { ev.preventDefault(); zoomAt(1.2); return; }
    if (mod && k === '-') { ev.preventDefault(); zoomAt(1 / 1.2); return; }
    if (mod && k === '0') { ev.preventDefault(); zoomAt(1 / view.zoom); return; }
    if (mod) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected.size) { ev.preventDefault(); removeSelected(); return; }
    if (ev.key === 'Escape') { selected.clear(); setTool('select'); return; }
    if (ev.key === 'Enter' && selected.size === 1) {
      const s = selection()[0];
      if (s.type === 'text') { ev.preventDefault(); commit(); editText(s.id); return; }
    }
    if (ev.key.startsWith('Arrow') && selected.size) {
      ev.preventDefault();
      const d = ev.shiftKey ? 10 : 1;
      const dx = ev.key === 'ArrowLeft' ? -d : ev.key === 'ArrowRight' ? d : 0;
      const dy = ev.key === 'ArrowUp' ? -d : ev.key === 'ArrowDown' ? d : 0;
      commit();
      scene.elements = scene.elements.map((e) => (selected.has(e.id) ? E.moveElement(e, dx, dy) : e));
      changed();
      return;
    }
    if (KEYS[k]) { ev.preventDefault(); setTool(KEYS[k]); }
  });
  root.addEventListener('keyup', (ev) => {
    if (ev.key === ' ') {
      spaceDown = false;
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
  });

  strokeColor.addEventListener('input', () => setStyle({ stroke: strokeColor.value }));
  fillColor.addEventListener('input', () => setStyle({ fill: fillColor.value }));

  const ro = new ResizeObserver(() => redraw());
  ro.observe(canvas);

  // --- API ---
  function getScene() {
    return structuredClone(scene);
  }
  function setScene(next, { fit = true } = {}) {
    finishText();
    scene = structuredClone(next);
    selected.clear();
    undo.length = 0;
    redo.length = 0;
    if (fit) requestAnimationFrame(() => zoomToFit());
    redraw();
    syncPanel();
  }

  setTool(readOnly ? 'hand' : 'select');
  requestAnimationFrame(() => zoomToFit());
  return {
    root,
    getScene,
    setScene,
    zoomToFit,
    focus: () => root.focus(),
    setTool,
    destroy() {
      ro.disconnect();
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
