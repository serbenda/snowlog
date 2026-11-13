// Copiado de serbenda/sketch (js/editor.js, commit 80f776f) con scripts/update-sketch.mjs. No editar aquí.
// Editor de dibujos: barra de herramientas, lienzo y panel de estilo. Se monta en cualquier
// contenedor (la web de sketch o Snowlog) y no usa innerHTML: todo se crea con el DOM.
//
//   const ed = createEditor(contenedor, { scene, onChange, readOnly })
//   ed.getScene() · ed.setScene(scene) · ed.zoomToFit() · ed.focus() · ed.destroy()

import * as E from './sketch-escena.js';
import { paintScene, measureWithCanvas, fontReady } from './sketch-pintar.js';

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
  alignLeft: 'M4 4v16 M8 7h10v4H8z M8 14h6v4H8z',
  alignCenter: 'M12 4v3 M12 11v3 M12 18v2 M6 7h12v4H6z M8 14h8v4H8z',
  alignRight: 'M20 4v16 M6 7h10v4H6z M10 14h6v4h-6z',
  alignTop: 'M4 4h16 M7 8h4v10H7z M14 8h4v6h-4z',
  alignMiddle: 'M4 12h3 M11 12h3 M18 12h2 M7 6h4v12H7z M14 8h4v8h-4z',
  alignBottom: 'M4 20h16 M7 6h4v10H7z M14 10h4v6h-4z',
  distH: 'M4 4v16 M20 4v16 M10 8h4v8h-4z',
  distV: 'M4 4h16 M4 20h16 M8 10h8v4H8z',
  group: 'M3 3h18v18H3z M7 7h5v5H7z M12 12h5v5h-5z',
  ungroup: 'M4 4h7v7H4z M13 13h7v7h-7z',
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
  measureWithCanvas(document);
  let scene = initial ? structuredClone(initial) : E.emptyScene();
  scene.elements = E.syncBindings(scene.elements);
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
  const helpId = `sk-ayuda-${Math.random().toString(36).slice(2, 8)}`;
  const root = el('div', { class: `sk-editor${readOnly ? ' sk-readonly' : ''}`, tabindex: '0', role: 'application', 'aria-label': readOnly ? 'Dibujo' : 'Pizarra', 'aria-describedby': readOnly ? null : helpId });
  const help = el('p', { class: 'sk-sr', id: helpId },
    'Herramientas: V seleccionar, R rectángulo, D rombo, O elipse, A flecha, L línea, P lápiz, T texto, E borrar. '
    + 'Intro crea la forma elegida en el centro o escribe dentro de la seleccionada. Tab y Mayús+Tab recorren los elementos; '
    + 'flechas los mueven; Alt+flechas cambian su tamaño; [ y ] los giran; Supr los borra; Escape quita la selección.');
  const canvas = el('canvas', { class: 'sk-canvas', 'aria-label': 'Lienzo de dibujo' });
  const textBox = el('textarea', { class: 'sk-textbox', 'aria-label': 'Texto', spellcheck: 'false', hidden: true });
  const status = el('div', { class: 'sk-sr', 'aria-live': 'polite' });
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
  const btn = (name, label, onclick) => el('button', { class: 'sk-btn', type: 'button', title: label, 'aria-label': label.replace(/ \(.*\)$/, ''), onclick }, icon(name));
  const strokeColor = el('input', { type: 'color', class: 'sk-color', 'aria-label': 'Otro color de trazo', value: style.stroke });
  const fillColor = el('input', { type: 'color', class: 'sk-color', 'aria-label': 'Otro color de relleno', value: '#a5d8ff' });
  const seg = (name, options, onPick) => el('div', { class: 'sk-seg', role: 'group', 'aria-label': name },
    ...options.map(([value, label]) => el('button', { class: 'sk-segbtn', type: 'button', 'data-value': String(value), onclick: () => onPick(value) }, label)));
  const groupBtn = btn('group', 'Agrupar (Ctrl+G)', () => groupSelected());
  const ungroupBtn = btn('ungroup', 'Desagrupar (Ctrl+Mayús+G)', () => ungroupSelected());
  const distH = btn('distH', 'Repartir en horizontal', () => distribute('x'));
  const distV = btn('distV', 'Repartir en vertical', () => distribute('y'));
  const alignBlock = el('div', {},
    el('div', { class: 'sk-label' }, 'Alinear'),
    el('div', { class: 'sk-row' },
      btn('alignLeft', 'Alinear a la izquierda', () => align('left')),
      btn('alignCenter', 'Centrar en horizontal', () => align('center')),
      btn('alignRight', 'Alinear a la derecha', () => align('right')),
      btn('alignTop', 'Alinear arriba', () => align('top')),
      btn('alignMiddle', 'Centrar en vertical', () => align('middle')),
      btn('alignBottom', 'Alinear abajo', () => align('bottom')),
      distH, distV));
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
    alignBlock,
    el('div', { class: 'sk-label' }, 'Capas y acciones'),
    el('div', { class: 'sk-row' },
      btn('front', 'Traer al frente', () => reorder(1)),
      btn('back', 'Enviar al fondo', () => reorder(-1)),
      btn('copy', 'Duplicar (Ctrl+D)', () => duplicate()),
      groupBtn, ungroupBtn,
      btn('trash', 'Eliminar (Supr)', () => removeSelected())));
  const zoomLabel = el('button', { class: 'sk-zoomlabel', type: 'button', title: 'Volver al 100 %', 'aria-label': 'Volver al 100 %', onclick: () => zoomAt(1 / view.zoom) }, '100 %');
  const bottom = el('div', { class: 'sk-bottom' },
    el('div', { class: 'sk-group' },
      btn('minus', 'Alejar', () => zoomAt(1 / 1.2)),
      zoomLabel,
      btn('plus', 'Acercar', () => zoomAt(1.2)),
      btn('fit', 'Ver todo el dibujo', () => zoomToFit())),
    el('div', { class: 'sk-group' },
      btn('undo', 'Deshacer (Ctrl+Z)', () => doUndo()),
      btn('redo', 'Rehacer (Ctrl+Y)', () => doRedo())));
  const stage = el('div', { class: 'sk-stage' }, canvas, textBox);
  if (readOnly) root.append(stage);
  else root.append(stage, toolbar, panel, bottom, status, help);
  container.append(root);
  const ctx = canvas.getContext('2d');

  // --- Escena y selección ---
  const toWorld = (sx, sy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (sx - r.left - view.x) / view.zoom, y: (sy - r.top - view.y) / view.zoom };
  };
  const byId = (id) => scene.elements.find((e) => e.id === id);
  const selection = () => scene.elements.filter((e) => selected.has(e.id));
  const primary = () => selection().filter((e) => !E.isBoundText(e));
  const update = (elements) => { scene.elements = E.syncBindings(elements); };

  // El texto de dentro de una forma se elige con su forma.
  const owner = (e) => (e && E.isBoundText(e) ? byId(e.containerId) || e : e);
  // Añade a unos ids el resto de su grupo y los textos de dentro de sus formas.
  function expand(ids) {
    const set = new Set(ids);
    const groups = new Set(scene.elements.filter((e) => set.has(e.id) && e.group).map((e) => e.group));
    for (const e of scene.elements) if (e.group && groups.has(e.group)) set.add(e.id);
    for (const e of scene.elements) if (E.isBoundText(e) && set.has(e.containerId)) set.add(e.id);
    return set;
  }
  function select(ids) {
    selected = expand(ids);
    announce();
  }
  const NAMES = { rectangle: 'rectángulo', ellipse: 'elipse', diamond: 'rombo', line: 'línea', arrow: 'flecha', draw: 'trazo', text: 'texto' };
  function announce() {
    const p = primary();
    status.textContent = !p.length ? '' : p.length === 1 ? `Seleccionado: ${NAMES[p[0].type]}` : `Seleccionados: ${p.length} elementos`;
  }

  // Marco de lo seleccionado: un elemento (con su giro), los extremos de una línea o una caja.
  function frame() {
    const s = primary();
    if (!s.length) return null;
    if (s.length === 1) {
      const e = s[0];
      if ((e.type === 'line' || e.type === 'arrow') && e.points.length === 2) return { kind: 'ends', el: e };
      if (!E.isLinear(e)) return { kind: 'one', el: e, ...E.bounds(e), angle: e.angle || 0 };
    }
    return { kind: 'many', ...E.sceneBounds(s), angle: 0 };
  }

  function handles(f) {
    if (f.kind === 'ends') {
      const e = f.el;
      return { p0: [e.x + e.points[0].x, e.y + e.points[0].y], p1: [e.x + e.points[1].x, e.y + e.points[1].y] };
    }
    const pad = 6 / view.zoom;
    const x1 = f.x - pad;
    const y1 = f.y - pad;
    const x2 = f.x + f.w + pad;
    const y2 = f.y + f.h + pad;
    const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    const raw = { nw: [x1, y1], ne: [x2, y1], sw: [x1, y2], se: [x2, y2], n: [c.x, y1], s: [c.x, y2], w: [x1, c.y], e: [x2, c.y], rot: [c.x, y1 - 22 / view.zoom] };
    // Con cajas pequeñas, solo las esquinas.
    if (f.w * view.zoom < 30 || f.h * view.zoom < 30) for (const k of ['n', 's', 'e', 'w']) delete raw[k];
    const out = {};
    for (const [k, [x, y]] of Object.entries(raw)) {
      const p = E.rotatePoint({ x, y }, c, f.angle);
      out[k] = [p.x, p.y];
    }
    return out;
  }

  // --- Dibujo ---
  function outlineOf(e, grow) {
    const c = E.center(e);
    const b = E.bounds(e);
    const g = grow / view.zoom;
    const pts = E.isLinear(e)
      ? [{ x: b.x - g, y: b.y - g }, { x: b.x + b.w + g, y: b.y - g }, { x: b.x + b.w + g, y: b.y + b.h + g }, { x: b.x - g, y: b.y + b.h + g }]
      : [{ x: b.x - g, y: b.y - g }, { x: b.x + b.w + g, y: b.y - g }, { x: b.x + b.w + g, y: b.y + b.h + g }, { x: b.x - g, y: b.y + b.h + g }].map((p) => E.rotatePoint(p, c, e.angle || 0));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
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
    const f = !readOnly && selected.size ? frame() : null;
    if (f) {
      ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
      if (f.kind !== 'ends') for (const e of primary()) outlineOf(e, 4);
      ctx.setLineDash([]);
      if (!(action && action.kind === 'move')) {
        ctx.fillStyle = '#ffffff';
        const hs = handles(f);
        if (hs.rot) {
          const [rx, ry] = hs.rot;
          const top = hs.n || [(hs.nw[0] + hs.ne[0]) / 2, (hs.nw[1] + hs.ne[1]) / 2];
          ctx.beginPath();
          ctx.moveTo(top[0], top[1]);
          ctx.lineTo(rx, ry);
          ctx.stroke();
        }
        for (const [k, [hx, hy]] of Object.entries(hs)) {
          const sz = 8 / view.zoom;
          ctx.beginPath();
          if (k === 'rot' || k === 'p0' || k === 'p1') ctx.arc(hx, hy, sz / 1.6, 0, Math.PI * 2);
          else ctx.rect(hx - sz / 2, hy - sz / 2, sz, sz);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    if (action?.target) {
      // Forma a la que se va a pegar la flecha.
      ctx.lineWidth = 3 / view.zoom;
      ctx.globalAlpha = 0.5;
      const t = byId(action.target);
      if (t) outlineOf(t, 6);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1 / view.zoom;
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
  function restore(json) {
    scene.elements = JSON.parse(json);
    selected = new Set([...selected].filter((id) => byId(id)));
    announce();
    changed();
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(JSON.stringify(scene.elements));
    restore(undo.pop());
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(JSON.stringify(scene.elements));
    restore(redo.pop());
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
      update(scene.elements.map((e) => (selected.has(e.id) ? { ...e, ...patch } : e)));
      changed();
    } else {
      syncPanel();
    }
  }

  // Unidades para alinear y repartir: cada grupo cuenta como una.
  function units() {
    const map = new Map();
    for (const e of primary()) {
      const k = e.group || e.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return [...map.values()].map((els) => ({ ids: els.map((e) => e.id), box: E.sceneBounds(els) }));
  }

  // El panel muestra el estilo de lo seleccionado (o el que se usará al dibujar).
  function syncPanel() {
    const s = primary();
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
    const n = s.length ? units().length : 0;
    alignBlock.hidden = n < 2;
    distH.hidden = n < 3;
    distV.hidden = n < 3;
    groupBtn.hidden = n < 2;
    ungroupBtn.hidden = !s.some((e) => e.group);
  }

  function addElement(e) {
    scene.elements.push(e);
  }

  // Mueve unos elementos. Una flecha que se mueve sin su forma deja de estar pegada a ella.
  function moved(list, ids, dx, dy) {
    return list.map((e) => {
      if (!ids.has(e.id)) return e;
      const m = E.moveElement(e, dx, dy);
      if (m.startId && !ids.has(m.startId)) delete m.startId;
      if (m.endId && !ids.has(m.endId)) delete m.endId;
      return m;
    });
  }

  function removeIds(ids) {
    const gone = expand(ids);
    update(scene.elements.filter((e) => !gone.has(e.id)));
    for (const id of gone) selected.delete(id);
  }

  function removeSelected() {
    if (!selected.size) return;
    commit();
    removeIds(selected);
    announce();
    changed();
  }

  function pasteCopies(list, d) {
    const copies = E.cloneElements(list, d, d);
    update([...scene.elements, ...copies]);
    select(copies.map((c) => c.id));
    return copies;
  }

  function duplicate() {
    if (!selected.size) return;
    commit();
    pasteCopies(selection(), 16);
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

  function groupSelected() {
    if (units().length < 2) return;
    commit();
    const g = E.newId();
    update(scene.elements.map((e) => (selected.has(e.id) && !E.isBoundText(e) ? { ...e, group: g } : e)));
    changed();
  }

  function ungroupSelected() {
    if (!primary().some((e) => e.group)) return;
    commit();
    update(scene.elements.map((e) => {
      if (!selected.has(e.id) || !e.group) return e;
      const { group, ...rest } = e;
      return rest;
    }));
    changed();
  }

  function align(where) {
    const us = units();
    if (us.length < 2) return;
    const all = E.sceneBounds(primary());
    commit();
    let list = scene.elements;
    for (const u of us) {
      const b = u.box;
      const dx = where === 'left' ? all.x - b.x : where === 'right' ? all.x + all.w - (b.x + b.w) : where === 'center' ? all.x + all.w / 2 - (b.x + b.w / 2) : 0;
      const dy = where === 'top' ? all.y - b.y : where === 'bottom' ? all.y + all.h - (b.y + b.h) : where === 'middle' ? all.y + all.h / 2 - (b.y + b.h / 2) : 0;
      list = moved(list, new Set(u.ids), dx, dy);
    }
    update(list);
    changed();
  }

  // Reparte con el mismo hueco entre unidades (de la primera a la última).
  function distribute(axis) {
    const us = units();
    if (us.length < 3) return;
    const pos = axis === 'x' ? 'x' : 'y';
    const len = axis === 'x' ? 'w' : 'h';
    us.sort((a, b) => a.box[pos] - b.box[pos]);
    const first = us[0].box;
    const last = us[us.length - 1].box;
    const total = us.reduce((n, u) => n + u.box[len], 0);
    const gap = (last[pos] + last[len] - first[pos] - total) / (us.length - 1);
    commit();
    let list = scene.elements;
    let at = first[pos];
    for (const u of us) {
      const d = at - u.box[pos];
      list = moved(list, new Set(u.ids), axis === 'x' ? d : 0, axis === 'x' ? 0 : d);
      at += u.box[len] + gap;
    }
    update(list);
    changed();
  }

  // Centro de lo que se ve, en coordenadas del dibujo.
  function viewCenter() {
    const r = canvas.getBoundingClientRect();
    return { x: (r.width / 2 - view.x) / view.zoom, y: (r.height / 2 - view.y) / view.zoom };
  }

  // Crear con el teclado: la forma elegida, de tamaño normal, en el centro de la vista.
  function createAtCenter() {
    const c = viewCenter();
    if (tool === 'text') {
      newText(c);
      return;
    }
    commit();
    let e;
    if (tool === 'line' || tool === 'arrow') e = { ...E.createElement(tool, c.x - 80, c.y, style), points: [{ x: 0, y: 0 }, { x: 160, y: 0 }] };
    else e = { ...E.createElement(tool, c.x - 80, c.y - 40, style), w: 160, h: 80 };
    update([...scene.elements, e]);
    setTool('select');
    select([e.id]);
    changed();
  }

  // Si lo seleccionado queda fuera de la vista, la vista va hacia ello.
  function revealSelection() {
    const s = primary();
    if (!s.length) return;
    const b = E.sceneBounds(s);
    const r = canvas.getBoundingClientRect();
    const sx = b.x * view.zoom + view.x;
    const sy = b.y * view.zoom + view.y;
    if (sx < 0 || sy < 0 || sx + b.w * view.zoom > r.width || sy + b.h * view.zoom > r.height) {
      view = { ...view, x: r.width / 2 - (b.x + b.w / 2) * view.zoom, y: r.height / 2 - (b.y + b.h / 2) * view.zoom };
    }
  }

  // --- Texto ---
  function placeTextBox(t) {
    const r = canvas.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const ox = r.left - sr.left;
    const oy = r.top - sr.top;
    if (t.containerId) {
      const c = byId(t.containerId);
      const cc = c ? E.center(c) : E.center(t);
      textBox.style.width = `${t.w * view.zoom}px`;
      textBox.style.height = '1px';
      const h = textBox.scrollHeight;
      textBox.style.height = `${h}px`;
      textBox.style.left = `${(cc.x - t.w / 2) * view.zoom + view.x + ox}px`;
      textBox.style.top = `${cc.y * view.zoom + view.y + oy - h / 2}px`;
      return;
    }
    textBox.style.left = `${t.x * view.zoom + view.x + ox}px`;
    textBox.style.top = `${t.y * view.zoom + view.y + oy}px`;
    textBox.style.width = '1px';
    textBox.style.height = '1px';
    textBox.style.width = `${Math.max(40, textBox.scrollWidth + 8)}px`;
    textBox.style.height = `${textBox.scrollHeight}px`;
  }
  function editText(id) {
    const t = byId(id);
    if (!t) return;
    editingText = id;
    textBox.hidden = false;
    textBox.classList.toggle('sk-bound', !!t.containerId);
    textBox.value = t.text || '';
    textBox.style.fontSize = `${t.fontSize * view.zoom}px`;
    textBox.style.color = t.stroke;
    textBox.style.lineHeight = String(E.LINE_HEIGHT);
    placeTextBox(t);
    redraw();
    textBox.focus({ preventScroll: true });
    setTimeout(() => { if (editingText === id) textBox.focus({ preventScroll: true }); }, 0);
  }
  // Escribir dentro de una forma: abre su texto o crea uno.
  function editInside(shape) {
    commit();
    let t = scene.elements.find((e) => e.containerId === shape.id);
    if (!t) {
      t = { ...E.createElement('text', 0, 0, { ...style, stroke: shape.stroke, fill: 'transparent' }), containerId: shape.id, align: 'center' };
      if (shape.group) t.group = shape.group;
      update([...scene.elements, t]);
    }
    select([shape.id]);
    editText(t.id);
  }
  function newText(p) {
    commit();
    const t = E.createElement('text', p.x, p.y - style.fontSize * 0.6, { ...style, fill: 'transparent' });
    addElement(t);
    select([t.id]);
    editText(t.id);
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
      update(scene.elements.filter((e) => e.id !== id));
      selected.delete(id);
    } else if (text !== t.text) {
      update(scene.elements.map((e) => (e.id === id ? { ...e, text } : e)));
    }
    changed();
  }
  textBox.addEventListener('input', () => {
    const t = byId(editingText);
    if (t) placeTextBox(t);
  });
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
    const f = frame();
    if (!f) return null;
    const tol = 8 / view.zoom;
    for (const [name, [hx, hy]] of Object.entries(handles(f))) if (Math.abs(wx - hx) <= tol && Math.abs(wy - hy) <= tol) return name;
    return null;
  }
  // Forma a la que se pegaría una punta de flecha en p.
  const bindTarget = (p, except) => E.shapeAt(scene.elements.filter((e) => !E.isBoundText(e)), p.x, p.y, { tol: 4 / view.zoom, except })?.id || null;
  const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rot: 'grab', p0: 'move', p1: 'move' };

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
      const f = h ? frame() : null;
      if (h === 'rot') {
        commit();
        const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
        action = { kind: 'rotate', c, a0: Math.atan2(p.y - c.y, p.x - c.x), single: f.kind === 'one' ? f.el : null, orig: primary().map((e) => structuredClone(e)) };
        return;
      }
      if (h === 'p0' || h === 'p1') {
        commit();
        action = { kind: 'endpoint', idx: h === 'p0' ? 0 : 1, orig: structuredClone(f.el), target: null };
        return;
      }
      if (h) {
        commit();
        action = f.kind === 'one'
          ? { kind: 'resize1', handle: h, orig: structuredClone(f.el) }
          : { kind: 'resize', handle: h, box: { x: f.x, y: f.y, w: f.w, h: f.h }, orig: primary().map((e) => structuredClone(e)) };
        return;
      }
      const hit = owner(E.elementAt(scene.elements, p.x, p.y, 6 / view.zoom));
      if (hit) {
        if (ev.shiftKey) {
          const ids = expand([hit.id]);
          if (selected.has(hit.id)) for (const id of ids) selected.delete(id);
          else for (const id of ids) selected.add(id);
          announce();
        } else if (!selected.has(hit.id)) {
          select([hit.id]);
        }
        commit();
        action = { kind: 'move', start: p, orig: scene.elements.map((e) => e), ids: new Set(selected), moved: false };
      } else {
        if (!ev.shiftKey) selected.clear();
        action = { kind: 'marquee', start: p, box: { x: p.x, y: p.y, w: 0, h: 0 }, base: new Set(selected) };
      }
      syncPanel();
      redraw();
      return;
    }
    if (tool === 'text') {
      const shape = E.shapeAt(scene.elements, p.x, p.y, { containersOnly: true });
      if (shape) editInside(shape);
      else newText(p);
      return;
    }
    commit();
    const e = E.createElement(tool, p.x, p.y, tool === 'draw' ? { ...style, fill: 'transparent' } : style);
    if (tool === 'arrow') {
      const s = bindTarget(p);
      if (s) e.startId = s;
    }
    addElement(e);
    action = { kind: 'create', id: e.id, start: p, dist: 0, target: null };
    redraw();
  });

  function eraseAt(p) {
    const hit = owner(E.elementAt(scene.elements, p.x, p.y, 8 / view.zoom));
    if (!hit) return;
    if (!action.started) {
      commit();
      action.started = true;
    }
    const gone = new Set([hit.id, ...scene.elements.filter((e) => e.containerId === hit.id).map((e) => e.id)]);
    update(scene.elements.filter((e) => !gone.has(e.id)));
    for (const id of gone) selected.delete(id);
    redraw();
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!action) {
      if (tool === 'select') {
        const p = toWorld(ev.clientX, ev.clientY);
        const h = handleAt(p.x, p.y);
        canvas.style.cursor = h ? CURSORS[h] : E.elementAt(scene.elements, p.x, p.y, 6 / view.zoom) ? 'move' : 'default';
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
      update(moved(action.orig, action.ids, dx, dy));
    } else if (action.kind === 'marquee') {
      action.box = { x: Math.min(action.start.x, p.x), y: Math.min(action.start.y, p.y), w: Math.abs(p.x - action.start.x), h: Math.abs(p.y - action.start.y) };
      const inside = E.elementsInBox(scene.elements, action.box).filter((e) => !E.isBoundText(e)).map((e) => e.id);
      selected = expand([...action.base, ...inside]);
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
      update(scene.elements.map((e) => (orig.has(e.id) ? E.resizeElement(orig.get(e.id), b, to) : e)));
    } else if (action.kind === 'resize1') {
      const next = E.resizeByHandle(action.orig, action.handle, p, { keepRatio: ev.shiftKey });
      update(scene.elements.map((e) => (e.id === next.id ? next : e)));
    } else if (action.kind === 'rotate') {
      let delta = Math.atan2(p.y - action.c.y, p.x - action.c.x) - action.a0;
      if (ev.shiftKey) {
        // De 15 en 15 grados.
        const step = Math.PI / 12;
        const base = action.single ? action.single.angle || 0 : 0;
        delta = Math.round((base + delta) / step) * step - base;
      }
      const orig = new Map(action.orig.map((o) => [o.id, o]));
      update(scene.elements.map((e) => (orig.has(e.id) ? E.rotateElement(orig.get(e.id), action.c, delta) : e)));
    } else if (action.kind === 'endpoint') {
      const o = action.orig;
      const pts = o.points.map((q) => ({ x: o.x + q.x, y: o.y + q.y }));
      pts[action.idx] = p;
      const key = action.idx === 0 ? 'startId' : 'endId';
      const other = action.idx === 0 ? o.endId : o.startId;
      action.target = o.type === 'arrow' ? bindTarget(p, other) : null;
      const next = { ...o, x: pts[0].x, y: pts[0].y, points: pts.map((q) => ({ x: q.x - pts[0].x, y: q.y - pts[0].y })) };
      delete next[key];
      update(scene.elements.map((e) => (e.id === o.id ? next : e)));
    } else if (action.kind === 'create') {
      const start = action.start;
      let dx = p.x - start.x;
      let dy = p.y - start.y;
      action.dist = Math.max(action.dist, Math.hypot(dx, dy) * view.zoom);
      const list = scene.elements.map((e) => {
        if (e.id !== action.id) return e;
        if (e.type === 'draw') return { ...e, points: [...e.points, { x: dx, y: dy }] };
        if (e.type === 'line' || e.type === 'arrow') {
          if (ev.shiftKey) {
            // Ángulos de 15 en 15 grados.
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
            const d = Math.hypot(dx, dy);
            dx = Math.cos(a) * d;
            dy = Math.sin(a) * d;
          }
          const next = { ...e, x: start.x, y: start.y, points: [{ x: 0, y: 0 }, { x: dx, y: dy }] };
          delete next.endId;
          if (e.type === 'arrow') {
            action.target = bindTarget({ x: start.x + dx, y: start.y + dy }, e.startId);
            if (action.target) next.endId = action.target;
          }
          return next;
        }
        if (ev.shiftKey) {
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * s;
          dy = Math.sign(dy || 1) * s;
        }
        return { ...e, w: dx, h: dy };
      });
      update(list);
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
      const tiny = e && (e.type === 'line' || e.type === 'arrow') && action.dist < 4;
      if (e && (tiny || E.isEmpty(e))) {
        update(scene.elements.filter((x) => x.id !== e.id));
        undo.pop();
      } else if (e) {
        update(scene.elements.map((x) => (x.id === e.id ? E.normalize(x) : x)));
        selected = tool === 'draw' ? new Set() : expand([e.id]);
        announce();
        if (tool !== 'draw') setTool('select');
        action = null;
        changed();
        return;
      }
    } else if (action.kind === 'endpoint') {
      const key = action.idx === 0 ? 'startId' : 'endId';
      const target = action.target;
      update(scene.elements.map((e) => (e.id === action.orig.id && target ? { ...e, [key]: target } : e)));
    } else if (action.kind === 'move' && !action.moved) {
      undo.pop();
    } else if (action.kind === 'pan') {
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
    const kind = action.kind;
    action = null;
    if (['move', 'resize', 'resize1', 'rotate', 'endpoint', 'erase'].includes(kind)) changed();
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
      return;
    }
    const shape = E.shapeAt(scene.elements, p.x, p.y, { containersOnly: true });
    if (shape) editInside(shape);
    else if (!hit) newText(p);
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
    if (mod && k === 'a') { ev.preventDefault(); setTool('select'); select(scene.elements.map((e) => e.id)); syncPanel(); redraw(); return; }
    if (mod && k === 'd') { ev.preventDefault(); duplicate(); return; }
    if (mod && k === 'g') { ev.preventDefault(); if (ev.shiftKey) ungroupSelected(); else groupSelected(); return; }
    if (mod && k === 'c') { clipboard = selection().map((e) => structuredClone(e)); return; }
    if (mod && k === 'v' && clipboard?.length) {
      ev.preventDefault();
      commit();
      clipboard = pasteCopies(clipboard, 24);
      changed();
      return;
    }
    if (mod && (k === '+' || k === '=')) { ev.preventDefault(); zoomAt(1.2); return; }
    if (mod && k === '-') { ev.preventDefault(); zoomAt(1 / 1.2); return; }
    if (mod && k === '0') { ev.preventDefault(); zoomAt(1 / view.zoom); return; }
    if (mod) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected.size) { ev.preventDefault(); removeSelected(); return; }
    if (ev.key === 'Escape') { selected.clear(); announce(); setTool('select'); return; }
    // Tab recorre los elementos mientras hay algo seleccionado (Escape lo suelta y Tab sale del editor).
    if (ev.key === 'Tab' && ev.target === root && selected.size) {
      const list = [];
      for (const e of scene.elements) if (!E.isBoundText(e) && !list.some((x) => e.group && x.group === e.group)) list.push(e);
      if (list.length) {
        ev.preventDefault();
        const cur = list.findIndex((e) => selected.has(e.id));
        const next = list[(cur + (ev.shiftKey ? -1 : 1) + list.length) % list.length];
        select([next.id]);
        revealSelection();
        syncPanel();
        redraw();
      }
      return;
    }
    if (ev.key === 'Enter' && !selected.size) {
      ev.preventDefault();
      if (tool === 'select' && scene.elements.length) {
        select([scene.elements.find((e) => !E.isBoundText(e)).id]);
        revealSelection();
        syncPanel();
        redraw();
      } else if (tool !== 'select' && tool !== 'hand' && tool !== 'eraser' && tool !== 'draw') {
        createAtCenter();
      }
      return;
    }
    if ((ev.key === '[' || ev.key === ']') && selected.size) {
      ev.preventDefault();
      const f = frame();
      const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
      if (f.kind === 'ends') Object.assign(c, E.center(f.el));
      const delta = (ev.key === ']' ? 1 : -1) * (Math.PI / 12);
      commit();
      update(scene.elements.map((e) => (selected.has(e.id) && !E.isBoundText(e) ? E.rotateElement(e, c, delta) : e)));
      changed();
      return;
    }
    if (ev.altKey && ev.key.startsWith('Arrow') && primary().length === 1) {
      ev.preventDefault();
      const e = primary()[0];
      const d = ev.shiftKey ? 1 : 10;
      const dw = ev.key === 'ArrowRight' ? d : ev.key === 'ArrowLeft' ? -d : 0;
      const dh = ev.key === 'ArrowDown' ? d : ev.key === 'ArrowUp' ? -d : 0;
      commit();
      update(scene.elements.map((x) => (x.id === e.id ? E.growElement(x, dw, dh) : x)));
      changed();
      return;
    }
    if (ev.key === 'Enter' && primary().length === 1) {
      const s = primary()[0];
      if (s.type === 'text') { ev.preventDefault(); commit(); editText(s.id); return; }
      if (E.isContainer(s)) { ev.preventDefault(); editInside(s); return; }
    }
    if (ev.key.startsWith('Arrow') && selected.size) {
      ev.preventDefault();
      const d = ev.shiftKey ? 10 : 1;
      const dx = ev.key === 'ArrowLeft' ? -d : ev.key === 'ArrowRight' ? d : 0;
      const dy = ev.key === 'ArrowUp' ? -d : ev.key === 'ArrowDown' ? d : 0;
      commit();
      update(moved(scene.elements, selected, dx, dy));
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

  // Con la letra a mano ya cargada, los textos miden otra cosa: se vuelven a colocar.
  let alive = true;
  fontReady(document).then(() => {
    if (!alive) return;
    update(scene.elements);
    redraw();
  });

  // --- API ---
  function getScene() {
    return structuredClone(scene);
  }
  function setScene(next, { fit = true } = {}) {
    finishText();
    scene = structuredClone(next);
    update(scene.elements);
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
      alive = false;
      ro.disconnect();
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
