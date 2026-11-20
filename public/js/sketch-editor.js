// Copied from serbenda/bsketch (js/editor.js, commit fe1613f) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// Drawing editor: toolbar, canvas and style panel. It mounts in any container (the sketch site or
// Snowlog) and never uses innerHTML: everything is built with the DOM.
//
//   const ed = createEditor(container, { scene, onChange, readOnly, library, onNotice })
//   ed.getScene() · ed.setScene(scene) · ed.insertImage(file) · ed.zoomToFit() · ed.focus() · ed.destroy()
//
// `library` (optional) is where the library of reusable pieces lives: { load(): Promise<text|null>,
// save(text): Promise }. Without it the editor has no library. `onNotice(text)` shows a short message.

import * as E from './sketch-scene.js';
import { paintScene, measureWithCanvas, fontReady, onImageReady, toSvgElement, hasFlow } from './sketch-render.js';
import { textToElements } from './sketch-textdiagram.js';

const NS = 'http://www.w3.org/2000/svg';

// Our own line icons.
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
  present: 'M3 4h18v12H3z M12 16v4 M8 20h8 M10 8l4 2-4 2z',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
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
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z M15.5 15.5L20 20',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  frame: 'M7 3v18 M17 3v18 M3 7h18 M3 17h18',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15 9.5a1.5 1.5 0 1 0 0 .01',
  library: 'M5 4h4v16H5z M10 4h4v16h-4z M15.5 5l3.8-1 3.7 15-3.8 1z',
  plusBox: 'M4 4h16v16H4z M12 8v8 M8 12h8',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 10l5-5 5 5 M5 20h14',
  close: 'M6 6l12 12 M18 6L6 18',
};

const TOOLS = [
  ['select', 'Select', 'V'], ['hand', 'Pan the canvas', 'H'], ['rectangle', 'Rectangle', 'R'],
  ['diamond', 'Diamond', 'D'], ['ellipse', 'Ellipse', 'O'], ['arrow', 'Arrow', 'A'], ['line', 'Line', 'L'],
  ['draw', 'Pencil', 'P'], ['text', 'Text', 'T'], ['frame', 'Frame', 'F'], ['eraser', 'Eraser', 'E'],
];
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const IMAGE_MAX_SIDE = 2560; // bigger pictures are scaled down when inserted (they would fill the browser's storage)

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

// t: translates the interface's English text (the site passes its own; by default English as written).
export function createEditor(container, { scene: initial, onChange = () => {}, onGridChange = () => {}, readOnly = false, t: tr = (s) => s, library = null, onNotice = () => {} } = {}) {
  measureWithCanvas(document);
  let scene = initial ? structuredClone(initial) : E.emptyScene();
  scene.elements = E.syncBindings(scene.elements);
  let selected = new Set();
  let tool = 'select';
  let view = { x: 0, y: 0, zoom: 1 };
  let style = { ...E.DEFAULT_STYLE };
  const undo = [];
  const redo = [];
  let action = null; // what the pointer is doing
  let editingText = null;
  let grid = false; // with the grid on, new shapes and moves land on it
  let raf = 0;
  let clipboard = null;

  // --- DOM ---
  // el() with the interface's text translated: string children, aria-label and title.
  const ui = (tag, attrs = {}, ...children) => el(tag,
    Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, (k === 'aria-label' || k === 'title') && typeof v === 'string' ? tr(v) : v])),
    ...children.flat().map((c) => (typeof c === 'string' ? tr(c) : c)));
  const helpId = `sk-help-${Math.random().toString(36).slice(2, 8)}`;
  const root = ui('div', { class: `sk-editor${readOnly ? ' sk-readonly' : ''}`, tabindex: '0', role: 'application', 'aria-label': readOnly ? 'Drawing' : 'Whiteboard', 'aria-describedby': readOnly ? null : helpId });
  const help = ui('p', { class: 'sk-sr', id: helpId },
    'Tools: V select, R rectangle, D diamond, O ellipse, A arrow, L line, P pencil, T text, F frame, E eraser; I inserts an image; G shows the grid. Ctrl+arrow keys add the next shape, joined by an arrow. '
    + 'Enter creates the chosen shape in the center, or writes inside the selected one. Tab and Shift+Tab go through the elements; '
    + 'arrow keys move them; Alt+arrow keys resize them; [ and ] rotate them; Delete removes them; Escape clears the selection.');
  const canvas = ui('canvas', { class: 'sk-canvas', 'aria-label': 'Drawing canvas' });
  const textBox = ui('textarea', { class: 'sk-textbox', 'aria-label': 'Text', spellcheck: 'false', hidden: true });
  const status = ui('div', { class: 'sk-sr', 'aria-live': 'polite' });
  const toolButtons = new Map();
  const imageInput = ui('input', { type: 'file', accept: IMAGE_ACCEPT, hidden: true, 'aria-label': 'Insert an image' });
  const libraryButton = library ? ui('button', { class: 'sk-btn', type: 'button', title: `${tr('Library')} (Shift+L)`, 'aria-label': 'Library', 'aria-pressed': 'false', onclick: () => toggleLibrary() }, icon('library')) : null;
  const toolbar = ui('div', { class: 'sk-toolbar', role: 'toolbar', 'aria-label': 'Tools' },
    ...TOOLS.map(([id, label, key]) => {
      const b = ui('button', { class: 'sk-btn', type: 'button', title: `${tr(label)} (${key})`, 'aria-label': label, 'aria-pressed': 'false', onclick: () => setTool(id) }, icon(id));
      toolButtons.set(id, b);
      return b;
    }),
    ui('button', { class: 'sk-btn', type: 'button', title: `${tr('Insert an image')} (I)`, 'aria-label': 'Insert an image', onclick: () => imageInput.click() }, icon('image')),
    libraryButton);
  const swatch = (color, onPick, label) => {
    const b = ui('button', {
      class: `sk-swatch${color === 'transparent' ? ' sk-none' : ''}`, type: 'button', title: label, 'aria-label': label, 'data-color': color, onclick: () => onPick(color),
    });
    if (color !== 'transparent') b.style.backgroundColor = color;
    return b;
  };
  const btn = (name, label, onclick) => ui('button', { class: 'sk-btn', type: 'button', title: label, 'aria-label': label.replace(/ \(.*\)$/, ''), onclick }, icon(name));
  const strokeColor = ui('input', { type: 'color', class: 'sk-color', 'aria-label': 'Other stroke color', value: style.stroke });
  const fillColor = ui('input', { type: 'color', class: 'sk-color', 'aria-label': 'Other fill color', value: '#a5d8ff' });
  const seg = (name, options, onPick) => ui('div', { class: 'sk-seg', role: 'group', 'aria-label': name },
    ...options.map(([value, label]) => ui('button', { class: 'sk-segbtn', type: 'button', 'data-value': String(value), onclick: () => onPick(value) }, label)));
  const groupBtn = btn('group', 'Group (Ctrl+G)', () => groupSelected());
  const ungroupBtn = btn('ungroup', 'Ungroup (Ctrl+Shift+G)', () => ungroupSelected());
  const distH = btn('distH', 'Distribute horizontally', () => distribute('x'));
  const distV = btn('distV', 'Distribute vertically', () => distribute('y'));
  const alignBlock = ui('div', {},
    ui('div', { class: 'sk-label' }, 'Align'),
    ui('div', { class: 'sk-row' },
      btn('alignLeft', 'Align left', () => align('left')),
      btn('alignCenter', 'Center horizontally', () => align('center')),
      btn('alignRight', 'Align right', () => align('right')),
      btn('alignTop', 'Align top', () => align('top')),
      btn('alignMiddle', 'Center vertically', () => align('middle')),
      btn('alignBottom', 'Align bottom', () => align('bottom')),
      distH, distV));
  const headsSeg = seg('Arrowheads', [['end', 'End'], ['start', 'Start'], ['both', 'Both'], ['none', 'None']], (v) => setStyle({ heads: v }));
  const headsBlock = ui('div', {}, ui('div', { class: 'sk-label' }, 'Arrowheads'), headsSeg);
  const routeSeg = seg('Route', [['straight', 'Straight'], ['elbow', 'Elbow'], ['curve', 'Curve']], (v) => setStyle({ route: v }));
  const routeBlock = ui('div', {}, ui('div', { class: 'sk-label' }, 'Route'), routeSeg);
  const cornersBlock = ui('div', {}, ui('div', { class: 'sk-label' }, 'Corners'), seg('Corners', [[false, 'Sharp'], [true, 'Round']], (v) => setStyle({ rounded: v })));
  const flowSeg = seg('Flow', [[false, 'Still'], [true, 'Animated']], (v) => setStyle({ animated: v }));
  const flowBlock = ui('div', {}, ui('div', { class: 'sk-label' }, 'Flow'), flowSeg);
  const panel = ui('div', { class: 'sk-panel', 'aria-label': 'Style' },
    ui('div', { class: 'sk-label' }, 'Stroke'),
    ui('div', { class: 'sk-row', 'data-prop': 'stroke' }, ...STROKES.map((c) => swatch(c, (v) => setStyle({ stroke: v }), `${tr('Stroke')} ${c}`)), strokeColor),
    ui('div', { class: 'sk-label' }, 'Fill'),
    ui('div', { class: 'sk-row', 'data-prop': 'fill' }, ...FILLS.map((c) => swatch(c, (v) => setStyle({ fill: v }), c === 'transparent' ? 'No fill' : `${tr('Fill')} ${c}`)), fillColor),
    seg('Fill style', [['hachure', 'Hachure'], ['cross-hatch', 'Cross-hatch'], ['solid', 'Solid']], (v) => setStyle({ fillStyle: v })),
    ui('div', { class: 'sk-label' }, 'Width'),
    seg('Stroke width', [[1, 'Thin'], [2, 'Medium'], [4, 'Bold']], (v) => setStyle({ width: v })),
    ui('div', { class: 'sk-label' }, 'Line'),
    seg('Line style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], (v) => setStyle({ dashed: v !== 'solid', dotted: v === 'dotted' })),
    cornersBlock,
    headsBlock,
    routeBlock,
    flowBlock,
    ui('div', { class: 'sk-label' }, 'Sloppiness'),
    seg('Sloppiness', [[0, 'Straight'], [1, 'Hand-drawn'], [2, 'Sketchy']], (v) => setStyle({ roughness: v })),
    ui('div', { class: 'sk-label' }, 'Text'),
    seg('Font', [['hand', 'Hand'], ['normal', 'Normal'], ['code', 'Code']], (v) => setStyle({ font: v })),
    seg('Text size', [[16, 'S'], [24, 'M'], [36, 'L'], [56, 'XL']], (v) => setStyle({ fontSize: v })),
    alignBlock,
    ui('div', { class: 'sk-label' }, 'Layers and actions'),
    ui('div', { class: 'sk-row' },
      btn('front', 'Bring to front', () => reorder(1)),
      btn('back', 'Send to back', () => reorder(-1)),
      btn('copy', 'Duplicate (Ctrl+D)', () => duplicate()),
      groupBtn, ungroupBtn,
      btn('lock', 'Lock (Ctrl+Shift+L)', () => lockSelected()),
      btn('trash', 'Delete (Del)', () => removeSelected())));
  const unlockBtn = btn('unlock', 'Unlock all', () => unlockAll());
  const zoomLabel = ui('button', { class: 'sk-zoomlabel', type: 'button', title: 'Reset to 100%', 'aria-label': 'Reset to 100%', onclick: () => zoomAt(1 / view.zoom) }, '100%');
  const bottom = ui('div', { class: 'sk-bottom' },
    ui('div', { class: 'sk-group' },
      btn('minus', 'Zoom out', () => zoomAt(1 / 1.2)),
      zoomLabel,
      btn('plus', 'Zoom in', () => zoomAt(1.2)),
      btn('fit', 'Fit the whole drawing', () => zoomToFit()),
      btn('present', 'Present (Shift+P)', () => startPresenting())),
    ui('div', { class: 'sk-group' },
      btn('undo', 'Undo (Ctrl+Z)', () => doUndo()),
      btn('redo', 'Redo (Ctrl+Y)', () => doRedo()),
      unlockBtn));
  // The library: pieces kept to use again (only when the page gives the editor a place to keep them).
  const libList = ui('ul', { class: 'sk-liblist', 'aria-label': 'Library items' });
  const libEmpty = ui('p', { class: 'sk-libempty' }, 'Select something and press "Add" to keep it here.');
  const libFile = ui('input', { type: 'file', accept: '.bsketchlib,.excalidrawlib,application/json', hidden: true, 'aria-label': 'Import a library' });
  const libPanel = ui('div', { class: 'sk-panel sk-library', 'aria-label': 'Library', hidden: true },
    ui('div', { class: 'sk-libhead' },
      ui('div', { class: 'sk-label' }, 'Library'),
      btn('close', 'Close the library', () => toggleLibrary(false))),
    ui('div', { class: 'sk-row' },
      ui('button', { class: 'sk-textbtn', type: 'button', onclick: () => addToLibrary() }, icon('plusBox'), ui('span', {}, 'Add')),
      btn('upload', 'Import a library', () => libFile.click()),
      btn('download', 'Export the library', () => exportLibrary())),
    libEmpty, libList, libFile);
  // Search (Ctrl+F): texts and frame titles.
  const searchInput = ui('input', { type: 'search', class: 'sk-searchinput', 'aria-label': 'Search the drawing', placeholder: tr('Search the drawing'), spellcheck: 'false' });
  const searchCount = ui('span', { class: 'sk-searchcount', 'aria-live': 'polite' });
  const searchBox = ui('div', { class: 'sk-panel sk-search', role: 'search', hidden: true },
    icon('search'), searchInput, searchCount,
    btn('up', 'Previous (Shift+Enter)', () => findNext(-1)),
    btn('down', 'Next (Enter)', () => findNext(1)),
    btn('close', 'Close the search (Esc)', () => closeSearch()));
  const slideCount = ui('span', { class: 'sk-slidecount', 'aria-live': 'polite' });
  const presentBar = ui('div', { class: 'sk-group sk-present', role: 'toolbar', 'aria-label': 'Presentation', hidden: true },
    btn('prev', 'Previous slide (←)', () => goSlide(-1)),
    slideCount,
    btn('next', 'Next slide (→)', () => goSlide(1)),
    btn('close', 'End the presentation (Esc)', () => stopPresenting()));
  const stage = ui('div', { class: 'sk-stage' }, canvas, textBox);
  if (readOnly) root.append(stage);
  else root.append(stage, toolbar, panel, ...(library ? [libPanel] : []), searchBox, bottom, presentBar, status, help, imageInput);
  container.append(root);
  const ctx = canvas.getContext('2d');

  // --- Scene and selection ---
  const toWorld = (sx, sy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (sx - r.left - view.x) / view.zoom, y: (sy - r.top - view.y) / view.zoom };
  };
  const byId = (id) => scene.elements.find((e) => e.id === id);
  const selection = () => scene.elements.filter((e) => selected.has(e.id));
  const primary = () => selection().filter((e) => !E.isBoundText(e));
  const update = (elements) => { scene.elements = E.syncBindings(elements); };

  // The text inside a shape is selected with its shape.
  const owner = (e) => (e && E.isBoundText(e) ? byId(e.containerId) || e : e);
  // What can be picked: not locked (a text inside a locked shape is locked with it).
  const isLocked = (e) => !!(e.locked || (E.isBoundText(e) && byId(e.containerId)?.locked));
  const free = () => scene.elements.filter((e) => !isLocked(e));
  // Adds to some ids the rest of their group and the texts inside their shapes.
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
  const NAMES = { rectangle: 'rectangle', ellipse: 'ellipse', diamond: 'diamond', line: 'line', arrow: 'arrow', draw: 'drawing', text: 'text', image: 'image', frame: 'frame' };
  function announce() {
    const p = primary();
    status.textContent = !p.length ? '' : p.length === 1 ? `${tr('Selected:')} ${tr(NAMES[p[0].type])}` : tr('Selected: {n} elements').replace('{n}', p.length);
  }

  // The selection's frame: one element (with its rotation), the ends of a line, or a box.
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
      const ends = { p0: [e.x + e.points[0].x, e.y + e.points[0].y], p1: [e.x + e.points[1].x, e.y + e.points[1].y] };
      // The middle, to bend it by hand (straight or curved lines; an elbow keeps its corners).
      if (e.route !== 'elbow' && !readOnly) {
        const m = E.midPoint(e);
        ends.mid = [m.x, m.y];
      }
      return ends;
    }
    const pad = 6 / view.zoom;
    const x1 = f.x - pad;
    const y1 = f.y - pad;
    const x2 = f.x + f.w + pad;
    const y2 = f.y + f.h + pad;
    const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    const raw = { nw: [x1, y1], ne: [x2, y1], sw: [x1, y2], se: [x2, y2], n: [c.x, y1], s: [c.x, y2], w: [x1, c.y], e: [x2, c.y], rot: [c.x, y1 - 22 / view.zoom] };
    // Small boxes get only the corners; frames stay upright.
    if (f.w * view.zoom < 30 || f.h * view.zoom < 30) for (const k of ['n', 's', 'e', 'w']) delete raw[k];
    if (f.el?.type === 'frame' || (f.kind === 'many' && primary().every((e) => e.type === 'frame'))) delete raw.rot;
    const out = {};
    for (const [k, [x, y]] of Object.entries(raw)) {
      const p = E.rotatePoint({ x, y }, c, f.angle);
      out[k] = [p.x, p.y];
    }
    return out;
  }

  // --- Painting ---
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

  // The grid, behind the drawing and only on screen (never exported). Hidden when its cells get too small.
  function paintGrid(width, height) {
    const step = E.GRID_SIZE * view.zoom;
    if (step < 6) return;
    const first = (offset) => offset - Math.floor(offset / step) * step;
    const major = (pos, offset) => Math.round((pos - offset) / step) % 5 === 0;
    ctx.save();
    ctx.lineWidth = 1;
    for (const strong of [false, true]) {
      ctx.strokeStyle = strong ? 'rgba(0, 0, 0, 0.13)' : 'rgba(0, 0, 0, 0.06)';
      ctx.beginPath();
      for (let x = first(view.x); x <= width; x += step) {
        if (major(x, view.x) !== strong) continue;
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let y = first(view.y); y <= height; y += step) {
        if (major(y, view.y) !== strong) continue;
        const py = Math.round(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    raf = 0;
    // The text box being written follows zoom and pan.
    const editing = editingText && byId(editingText);
    if (editing) {
      textBox.style.fontSize = `${editing.fontSize * view.zoom}px`;
      textBox.style.fontFamily = E.fontOf(editing);
      placeTextBox(editing);
    }
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const slide = presenting ? presenting.slides[presenting.at] : null;
    const hidden = presenting
      ? (slide ? { ...scene, elements: [slide, ...E.inFrame(scene.elements, slide)] } : scene)
      : editingText ? { ...scene, elements: scene.elements.filter((e) => e.id !== editingText) } : scene;
    ctx.fillStyle = scene.background || '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    if (grid) paintGrid(r.width, r.height);
    const inverted = getComputedStyle(canvas).filter.includes('invert');
    // Animated lines: paint again ~30 times a second while one is on screen (not for people who ask for less motion).
    const flowing = !stillMotion.matches && hasFlow(hidden.elements);
    paintScene(ctx, hidden, { view, width: r.width, height: r.height, background: false, imageFilter: inverted ? 'hue-rotate(180deg) invert(100%)' : '', time: flowing ? performance.now() : 0, hideFrames: !!presenting });
    if (presenting) {
      paintLaser();
      zoomLabel.textContent = `${Math.round(view.zoom * 100)} %`;
      return;
    }
    if (flowing && !flowTimer) flowTimer = setTimeout(() => { flowTimer = 0; if (alive) redraw(); }, 33);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    const accent = getComputedStyle(root).getPropertyValue('--sk-accent').trim() || '#3451b2';
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
          if (k === 'rot' || k === 'p0' || k === 'p1' || k === 'mid') ctx.arc(hx, hy, sz / 1.6, 0, Math.PI * 2);
          else ctx.rect(hx - sz / 2, hy - sz / 2, sz, sz);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    if (action?.target) {
      // The shape the arrow is about to attach to.
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
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let flowTimer = 0;

  // --- History ---
  // commit() keeps the drawing as it is before a change; changed() closes that change. A change that
  // ended up changing nothing leaves no undo step and keeps the redo stack. Several commits before one
  // changed() (a double click that opens a text) are a single step.
  let pending = false;
  // A step keeps the elements and the canvas background.
  const snapshot = () => JSON.stringify({ background: scene.background, elements: scene.elements });
  function commit() {
    if (pending) return;
    undo.push(snapshot());
    if (undo.length > 200) undo.shift();
    pending = true;
  }
  // Drops the step opened by commit() (the change was cancelled).
  function discard() {
    if (!pending) return;
    undo.pop();
    pending = false;
  }
  function changed() {
    if (pending) {
      pending = false;
      if (undo[undo.length - 1] === snapshot()) undo.pop();
      else redo.length = 0;
    }
    redraw();
    syncPanel();
    onChange(getScene());
  }
  function restore(json) {
    const s = JSON.parse(json);
    scene.elements = s.elements;
    scene.background = s.background;
    selected = new Set([...selected].filter((id) => byId(id)));
    announce();
    changed();
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(snapshot());
    restore(undo.pop());
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(snapshot());
    restore(redo.pop());
  }

  // --- Tools and style ---
  function setTool(t) {
    finishText();
    tool = t;
    if (t !== 'select') selected.clear();
    for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(id === t));
    canvas.style.cursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    redraw();
    syncPanel();
  }

  // `step: false` adds to the last undo step instead of opening one (dragging in the colour picker).
  function setStyle(patch, { step = true } = {}) {
    style = { ...style, ...patch };
    if (selected.size) {
      if (step) commit();
      // Arrowheads only make sense on arrows and fonts on texts; their defaults ('end', 'hand') are not stored.
      update(scene.elements.map((e) => {
        if (!selected.has(e.id)) return e;
        if ('heads' in patch) {
          if (e.type !== 'arrow') return e;
          const { heads, ...rest } = { ...e, ...patch };
          return heads === 'end' ? rest : { ...rest, heads };
        }
        if ('route' in patch) {
          if ((e.type !== 'arrow' && e.type !== 'line') || e.points.length !== 2) return e;
          const { route, bend, ...rest } = { ...e, ...patch };
          // A hand-made bend belongs to the curve: another route drops it.
          if (route === 'straight') return rest;
          return route === 'curve' && Number.isFinite(bend) ? { ...rest, route, bend } : { ...rest, route };
        }
        if ('rounded' in patch) {
          if (e.type !== 'rectangle') return e;
          const { rounded, ...rest } = { ...e, ...patch };
          return rounded === true ? { ...rest, rounded: true } : rest;
        }
        if ('dotted' in patch) {
          const { dotted, ...rest } = { ...e, ...patch };
          return dotted === true && e.type !== 'text' && e.type !== 'image' && e.type !== 'frame' ? { ...rest, dotted: true } : rest;
        }
        if ('animated' in patch) {
          if (e.type !== 'arrow' && e.type !== 'line') return e;
          const { animated, ...rest } = { ...e, ...patch };
          return animated === true ? { ...rest, animated: true } : rest;
        }
        if ('font' in patch) {
          if (e.type !== 'text') return e;
          const { font, ...rest } = { ...e, ...patch };
          return font === 'hand' ? rest : { ...rest, font };
        }
        return { ...e, ...patch };
      }));
      changed();
    } else {
      syncPanel();
    }
  }

  // Units to align and distribute: each group counts as one.
  function units() {
    const map = new Map();
    for (const e of primary()) {
      const k = e.group || e.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return [...map.values()].map((els) => ({ ids: els.map((e) => e.id), box: E.sceneBounds(els) }));
  }

  // The panel shows the selection's style (or the one used for drawing next).
  function syncPanel() {
    const s = primary();
    const cur = s.length ? s[s.length - 1] : style;
    panel.hidden = readOnly || (tool === 'select' && !s.length) || tool === 'hand' || tool === 'eraser' || tool === 'frame' || (s.length > 0 && s.every((e) => e.type === 'frame' || e.type === 'image'));
    for (const b of panel.querySelectorAll('.sk-swatch')) {
      const prop = b.parentElement.dataset.prop;
      b.setAttribute('aria-pressed', String(cur[prop] === b.dataset.color));
    }
    const segs = panel.querySelectorAll('.sk-seg');
    const props = ['fillStyle', 'width', 'line', 'rounded', 'heads', 'route', 'animated', 'roughness', 'font', 'fontSize'];
    const arrow = s.length ? s.filter((e) => e.type === 'arrow').pop() : null;
    headsBlock.hidden = !(arrow || (!s.length && tool === 'arrow'));
    const heads = (arrow || style).heads || 'end';
    const lineEl = s.length ? s.filter((e) => e.type === 'arrow' || e.type === 'line').pop() : null;
    routeBlock.hidden = !(lineEl || (!s.length && (tool === 'arrow' || tool === 'line')));
    const route = (lineEl || style).route || 'straight';
    flowBlock.hidden = routeBlock.hidden;
    const rectEl = s.length ? s.filter((e) => e.type === 'rectangle').pop() : null;
    cornersBlock.hidden = !(rectEl || (!s.length && tool === 'rectangle'));
    const rounded = (rectEl || style).rounded === true;
    unlockBtn.hidden = !scene.elements.some((e) => e.locked);
    const animated = (lineEl || style).animated === true;
    segs.forEach((g, i) => {
      const textEl = s.filter((e) => e.type === 'text').pop();
      const value = props[i] === 'line' ? (cur.dotted ? 'dotted' : cur.dashed ? 'dashed' : 'solid') : props[i] === 'rounded' ? rounded : props[i] === 'heads' ? heads : props[i] === 'route' ? route : props[i] === 'animated' ? animated : props[i] === 'font' ? (textEl || style).font || 'hand' : cur[props[i]];
      for (const b of g.children) b.setAttribute('aria-pressed', String(String(value) === b.dataset.value));
    });
    const n = s.length ? units().length : 0;
    alignBlock.hidden = n < 2;
    distH.hidden = n < 3;
    distV.hidden = n < 3;
    groupBtn.hidden = n < 2;
    ungroupBtn.hidden = !s.some((e) => e.group);
  }

  // Frames go behind everything (what is drawn inside them stays on top).
  function addElement(e) {
    if (e.type === 'frame') scene.elements.unshift(e);
    else scene.elements.push(e);
  }
  const frameName = () => `${tr('Frame')} ${scene.elements.filter((e) => e.type === 'frame').length + 1}`;
  // What moves with the selection: frames carry what is inside them.
  function withFrameContents(ids) {
    const out = new Set(ids);
    for (const f of scene.elements) if (f.type === 'frame' && ids.has(f.id)) for (const e of E.inFrame(free(), f)) out.add(e.id);
    return expand([...out]);
  }
  function renameFrame(f) {
    const name = window.prompt(tr('Name of this frame:'), f.name || '');
    if (name === null) return;
    commit();
    update(scene.elements.map((e) => (e.id === f.id ? { ...e, name: name.replace(/\s+/g, ' ').trim().slice(0, 100) } : e)));
    changed();
  }

  // --- Images ---
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  // A picture file → { data, w, h } ready to keep (scaled down if it is very big), or null if it isn't one we take.
  async function loadPicture(file) {
    const type = String(file?.type || '').replace('image/', '');
    if (!E.IMAGE_TYPES.includes(type) || file.size > 50 * 1024 * 1024) return null;
    const data = await readAsDataUrl(file);
    const img = new Image();
    img.src = data;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    if (E.isImageData(data) && data.length <= 3 * 1024 * 1024 && Math.max(w, h) <= IMAGE_MAX_SIDE) return { data, w, h };
    const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg', 0.88);
    if (!E.isImageData(out) || out.length > 3 * 1024 * 1024) out = c.toDataURL('image/jpeg', 0.8);
    return E.isImageData(out) ? { data: out, w: c.width, h: c.height } : null;
  }
  // Puts a picture in the drawing, centered on `at` (the view's center by default), at a size that fits the view.
  async function insertImage(file, at = null) {
    if (readOnly) return false;
    let pic = null;
    try {
      pic = await loadPicture(file);
    } catch { /* not a picture the browser can read */ }
    if (!pic) {
      onNotice(tr('That file is not a picture bsketch can use (PNG, JPEG, GIF or WebP).'));
      return false;
    }
    const files = scene.files || {};
    let fileId = Object.keys(files).find((k) => files[k] === pic.data);
    if (!fileId) {
      fileId = E.newId();
      scene.files = { ...files, [fileId]: pic.data };
    }
    const r = canvas.getBoundingClientRect();
    const k = Math.min(1, (r.width * 0.6) / view.zoom / pic.w, (r.height * 0.6) / view.zoom / pic.h);
    const w = pic.w * k;
    const h = pic.h * k;
    const c = at || viewCenter();
    finishText();
    commit();
    const e = { ...E.createElement('image', c.x - w / 2, c.y - h / 2, { ...style, fill: 'transparent' }), w, h, fileId };
    update([...scene.elements, e]);
    setTool('select');
    select([e.id]);
    changed();
    return true;
  }
  imageInput.addEventListener('change', () => {
    const [file] = imageInput.files;
    imageInput.value = '';
    if (file) insertImage(file);
  });
  // Pictures dropped on the canvas go where they are dropped.
  const pictureIn = (dt) => [...(dt?.files || [])].find((f) => E.IMAGE_TYPES.includes(String(f.type).replace('image/', '')));
  stage.addEventListener('dragover', (ev) => {
    if (readOnly || ![...(ev.dataTransfer?.items || [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) return;
    ev.preventDefault();
    ev.stopPropagation();
  });
  stage.addEventListener('drop', (ev) => {
    const file = readOnly ? null : pictureIn(ev.dataTransfer);
    if (!file) return;
    ev.preventDefault();
    ev.stopPropagation();
    insertImage(file, toWorld(ev.clientX, ev.clientY));
  });
  // New elements (copies, a diagram, a library piece) with the pictures they use: frames behind, the rest on top,
  // selected. The caller has already called commit().
  function addElements(list, files = {}) {
    const all = { ...(scene.files || {}) };
    for (const [k, v] of Object.entries(files || {})) if (!Object.hasOwn(all, k)) all[k] = v;
    if (Object.keys(all).length) scene.files = all;
    update([...list.filter((e) => e.type === 'frame'), ...scene.elements, ...list.filter((e) => e.type !== 'frame')]);
    setTool('select');
    select(list.map((e) => e.id));
  }

  // Text → a diagram (an indented list, Mermaid or `A -> B` lines) in the middle of the view; null if it isn't one.
  function insertText(text, { direction, keepSelected = true } = {}) {
    if (readOnly) return null;
    const c = viewCenter();
    const r = textToElements(text, { at: c, style: { ...style, fill: 'transparent', fillStyle: style.fillStyle }, direction });
    if (!r) return null;
    finishText();
    commit();
    addElements(r.elements);
    revealSelection();
    if (!keepSelected) {
      selected.clear();
      announce();
    }
    changed();
    return { kind: r.kind, nodes: r.nodes, edges: r.edges };
  }

  // Copying puts the selection on the system clipboard too (as JSON), so it can be pasted in another tab.
  const CLIP = 'bsketch-clipboard';
  root.addEventListener('copy', (ev) => {
    if (ev.target.closest('input, textarea') || !selected.size || !ev.clipboardData) return;
    const elements = selection();
    ev.clipboardData.setData('text/plain', JSON.stringify({ type: CLIP, version: 1, elements, files: E.filesFor(elements, scene.files) }));
    ev.preventDefault();
  });
  // Pasting: a picture goes in; elements copied in bsketch (this tab or another) are pasted as copies; text becomes a
  // diagram when it reads as one, or a text otherwise. Without a paste event (some browsers), Ctrl+V pastes what
  // was copied in this tab.
  let pastedPicture = false;
  root.addEventListener('paste', (ev) => {
    if (readOnly || ev.target.closest('input, textarea')) return;
    const file = [...(ev.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
    if (file) {
      ev.preventDefault();
      pastedPicture = true;
      insertImage(file);
      return;
    }
    const text = ev.clipboardData?.getData('text/plain') || '';
    if (!text.trim()) return;
    ev.preventDefault();
    pastedPicture = true;
    if (text.includes(`"${CLIP}"`)) {
      let data = null;
      try {
        const raw = JSON.parse(text);
        if (raw?.type === CLIP && Array.isArray(raw.elements)) data = E.parseScene(JSON.stringify({ type: 'sketch', version: 1, elements: raw.elements, files: raw.files }));
      } catch { /* not ours after all: treated as text below */ }
      if (data?.elements.length) {
        finishText();
        commit();
        const copies = E.cloneElements(data.elements, 24, 24);
        addElements(copies, data.files);
        clipboard = copies.map((e) => structuredClone(e));
        changed();
        return;
      }
    }
    if (insertText(text)) return;
    // Plain text: a text element in the middle of the view.
    const c = viewCenter();
    finishText();
    commit();
    const t = { ...E.createElement('text', c.x, c.y, { ...style, fill: 'transparent' }), text: text.replace(/\s+$/, '').slice(0, 10000) };
    addElements([t]);
    changed();
  });

  // --- Library ---
  let libItems = null; // loaded the first time the library opens
  async function loadLibrary() {
    if (libItems) return libItems;
    libItems = [];
    try {
      const raw = await library.load();
      if (raw) libItems = E.parseLibrary(raw);
    } catch { /* an unreadable library starts empty */ }
    return libItems;
  }
  async function saveLibrary() {
    try {
      await library.save(E.serializeLibrary(libItems));
    } catch {
      onNotice(tr('Could not keep the library in this browser.'));
    }
  }
  function renderLibrary() {
    libEmpty.hidden = libItems.length > 0;
    libList.replaceChildren(...libItems.map((it, i) => {
      const thumb = toSvgElement(document, { ...E.emptyScene(), elements: it.elements, files: it.files }, { padding: 6, background: false });
      thumb.setAttribute('class', 'sk-libthumb');
      thumb.removeAttribute('width');
      thumb.setAttribute('aria-hidden', 'true');
      const label = it.name || `${tr('Item')} ${i + 1}`;
      const use = el('button', { class: 'sk-libitem', type: 'button', title: label, 'aria-label': `${tr('Insert')}: ${label}`, onclick: () => insertFromLibrary(it) }, thumb);
      const del = el('button', { class: 'sk-libdel', type: 'button', title: tr('Remove from the library'), 'aria-label': `${tr('Remove from the library')}: ${label}`, onclick: () => removeFromLibrary(it.id) }, icon('close'));
      return el('li', {}, use, del);
    }));
  }
  async function toggleLibrary(open = libPanel.hidden) {
    if (!library) return;
    libPanel.hidden = !open;
    libraryButton.setAttribute('aria-pressed', String(open));
    if (open) {
      await loadLibrary();
      renderLibrary();
    }
  }
  async function addToLibrary() {
    const s = selection();
    if (!s.length) {
      onNotice(tr('Select what you want to keep in the library first.'));
      return;
    }
    await loadLibrary();
    if (libItems.length >= E.MAX_LIBRARY_ITEMS) return onNotice(tr('The library is full: remove something first.'));
    const elements = structuredClone(s);
    libItems = [{ id: E.newId(), name: '', elements, files: E.filesFor(elements, scene.files) }, ...libItems];
    renderLibrary();
    await saveLibrary();
  }
  async function removeFromLibrary(id) {
    libItems = libItems.filter((it) => it.id !== id);
    renderLibrary();
    await saveLibrary();
  }
  // An item goes in as new copies in the middle of the view, selected.
  function insertFromLibrary(it) {
    if (readOnly) return;
    const b = E.sceneBounds(it.elements);
    const c = viewCenter();
    let dx = c.x - (b.x + b.w / 2);
    let dy = c.y - (b.y + b.h / 2);
    if (grid) {
      dx = E.snap(b.x + dx) - b.x;
      dy = E.snap(b.y + dy) - b.y;
    }
    finishText();
    commit();
    addElements(E.cloneElements(it.elements, dx, dy), it.files);
    changed();
  }
  function exportLibrary() {
    if (!libItems?.length) return onNotice(tr('The library is empty.'));
    const url = URL.createObjectURL(new Blob([E.serializeLibrary(libItems)], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'library.bsketchlib' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  libFile.addEventListener('change', async () => {
    const [file] = libFile.files;
    libFile.value = '';
    if (!file) return;
    let items;
    try {
      items = E.parseLibrary(await file.text());
    } catch {
      return onNotice(tr('That file is not a library.'));
    }
    await loadLibrary();
    libItems = [...items, ...libItems].slice(0, E.MAX_LIBRARY_ITEMS);
    renderLibrary();
    await saveLibrary();
    onNotice(tr('Added to the library: {n}.').replace('{n}', items.length));
  });

  // Moves some elements. An arrow moved without its shape is no longer attached to it; `keep` is
  // everything that moves in the same operation (aligning moves each unit on its own).
  function moved(list, ids, dx, dy, keep = ids) {
    return list.map((e) => {
      if (!ids.has(e.id)) return e;
      const m = E.moveElement(e, dx, dy);
      if (m.startId && !keep.has(m.startId)) delete m.startId;
      if (m.endId && !keep.has(m.endId)) delete m.endId;
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

  // --- Presenting: the frames one by one (or the whole drawing), full screen, with a laser pointer ---
  let presenting = null; // { slides: [frame | null], at, view, tool }
  let laser = []; // the pointer's trail: { x, y, t } in drawing coordinates
  let laserTimer = 0;
  function slidesOf() {
    const frames = scene.elements.filter((e) => e.type === 'frame');
    // Frames inside another frame are part of that frame's slide.
    const top = frames.filter((f) => !frames.some((g) => g !== f && E.inFrame([f], g).length));
    const pos = (f) => E.bounds(f);
    top.sort((a, b) => (Math.abs(pos(a).y - pos(b).y) > 40 ? pos(a).y - pos(b).y : pos(a).x - pos(b).x));
    return top.length ? top : [null];
  }
  function fitSlide() {
    const slide = presenting.slides[presenting.at];
    const r = canvas.getBoundingClientRect();
    const b = slide ? E.bounds(slide) : E.sceneBounds(scene.elements);
    if (!b.w && !b.h) {
      view = { x: r.width / 2, y: r.height / 2, zoom: 1 };
      return;
    }
    const margin = 24;
    const z = Math.max(0.1, Math.min(8, Math.min((r.width - margin * 2) / (b.w || 1), (r.height - margin * 2) / (b.h || 1))));
    view = { zoom: z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
  }
  function showSlide() {
    const n = presenting.slides.length;
    slideCount.textContent = `${presenting.at + 1} / ${n}`;
    // Wait for the full-screen resize before fitting.
    requestAnimationFrame(() => {
      if (!presenting) return;
      fitSlide();
      redraw();
    });
    fitSlide();
    redraw();
  }
  function startPresenting() {
    if (presenting || readOnly) return;
    finishText();
    presenting = { slides: slidesOf(), at: 0, view: { ...view }, tool };
    selected.clear();
    announce();
    setTool('select');
    root.classList.add('sk-presenting');
    presentBar.hidden = false;
    canvas.style.cursor = 'none';
    try {
      const p = root.requestFullscreen?.();
      if (p?.catch) p.catch(() => {});
    } catch { /* full screen refused: present in the window */ }
    status.textContent = tr('Presenting. Arrow keys move through the slides; Escape ends.');
    showSlide();
    root.focus();
  }
  function stopPresenting() {
    if (!presenting) return;
    const back = presenting;
    presenting = null;
    laser = [];
    root.classList.remove('sk-presenting');
    presentBar.hidden = true;
    if (document.fullscreenElement === root) document.exitFullscreen?.().catch(() => {});
    view = back.view;
    zoomLabel.textContent = `${Math.round(view.zoom * 100)} %`;
    setTool(back.tool);
    status.textContent = '';
    redraw();
    root.focus();
  }
  function goSlide(d, to = null) {
    if (!presenting) return;
    const n = presenting.slides.length;
    presenting.at = to ?? Math.max(0, Math.min(n - 1, presenting.at + d));
    laser = [];
    showSlide();
  }
  function presentKey(ev) {
    const k = ev.key;
    if (k === 'Escape') stopPresenting();
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') goSlide(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') goSlide(-1);
    else if (k === 'Home') goSlide(0, 0);
    else if (k === 'End') goSlide(0, presenting.slides.length - 1);
    else return;
    ev.preventDefault();
  }
  document.addEventListener('fullscreenchange', () => {
    // Leaving full screen (Escape in the browser) ends the presentation too.
    if (presenting && document.fullscreenElement !== root && presenting.wasFull) stopPresenting();
    else if (presenting && document.fullscreenElement === root) {
      presenting.wasFull = true;
      showSlide();
    }
  });
  // The laser: a red trail that fades in LASER_MS; repainted while it lasts.
  const LASER_MS = 900;
  function laserAt(ev) {
    const p = toWorld(ev.clientX, ev.clientY);
    laser.push({ x: p.x, y: p.y, t: performance.now() });
    if (laser.length > 400) laser.splice(0, laser.length - 400);
    redraw();
  }
  function paintLaser() {
    const now = performance.now();
    laser = laser.filter((q) => now - q.t < LASER_MS);
    if (!laser.length) return;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < laser.length; i++) {
      const a = laser[i - 1];
      const b = laser[i];
      const life = 1 - (now - b.t) / LASER_MS;
      ctx.strokeStyle = `rgba(230, 30, 30, ${0.85 * life})`;
      ctx.lineWidth = (2 + 4 * life) / view.zoom;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const head = laser[laser.length - 1];
    ctx.fillStyle = 'rgba(230, 30, 30, 0.9)';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5 / view.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!laserTimer) laserTimer = setTimeout(() => { laserTimer = 0; if (alive) redraw(); }, 30);
  }

  // --- Search ---
  // Case and accents don't matter: "accion" finds "Acción".
  const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let matches = [];
  let matchAt = -1;
  function findAll() {
    const q = fold(searchInput.value.trim());
    matches = [];
    if (q) {
      for (const e of scene.elements) {
        const text = e.type === 'text' ? e.text : e.type === 'frame' ? e.name : '';
        if (!text || !fold(text).includes(q)) continue;
        const target = owner(e);
        if (!matches.includes(target)) matches.push(target);
      }
      // In reading order: top to bottom, then left to right.
      matches.sort((a, b) => (Math.abs(E.aabb(a).y - E.aabb(b).y) > 10 ? E.aabb(a).y - E.aabb(b).y : E.aabb(a).x - E.aabb(b).x));
    }
    matchAt = -1;
    showCount();
  }
  function showCount() {
    searchCount.textContent = !searchInput.value.trim() ? '' : !matches.length ? tr('No results') : matchAt < 0 ? tr('{n} found').replace('{n}', matches.length) : tr('{i} of {n}').replace('{i}', matchAt + 1).replace('{n}', matches.length);
  }
  function findNext(dir) {
    if (!matches.length) return;
    matchAt = (matchAt + dir + matches.length) % matches.length;
    const m = matches[matchAt];
    setTool('select');
    select([m.id]);
    revealSelection();
    syncPanel();
    redraw();
    showCount();
  }
  function openSearch() {
    searchBox.hidden = false;
    searchInput.focus();
    searchInput.select();
    findAll();
  }
  function closeSearch() {
    searchBox.hidden = true;
    root.focus();
  }
  searchInput.addEventListener('input', () => {
    findAll();
    if (matches.length) findNext(1);
  });
  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); findNext(ev.shiftKey ? -1 : 1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeSearch(); }
    ev.stopPropagation();
  });

  // Locking: what is locked can't be picked until "Unlock all".
  function lockSelected() {
    const ids = new Set(primary().map((e) => e.id));
    if (!ids.size) return;
    commit();
    update(scene.elements.map((e) => (ids.has(e.id) ? { ...e, locked: true } : e)));
    selected.clear();
    announce();
    status.textContent = tr('Locked: {n}').replace('{n}', ids.size);
    changed();
  }
  function unlockAll() {
    if (!scene.elements.some((e) => e.locked)) return;
    commit();
    const ids = [];
    update(scene.elements.map((e) => {
      if (!e.locked) return e;
      ids.push(e.id);
      const { locked, ...rest } = e;
      return rest;
    }));
    setTool('select');
    select(ids);
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
    const moving = new Set(us.flatMap((u) => u.ids));
    let list = scene.elements;
    for (const u of us) {
      const b = u.box;
      const dx = where === 'left' ? all.x - b.x : where === 'right' ? all.x + all.w - (b.x + b.w) : where === 'center' ? all.x + all.w / 2 - (b.x + b.w / 2) : 0;
      const dy = where === 'top' ? all.y - b.y : where === 'bottom' ? all.y + all.h - (b.y + b.h) : where === 'middle' ? all.y + all.h / 2 - (b.y + b.h / 2) : 0;
      list = moved(list, new Set(u.ids), dx, dy, moving);
    }
    update(list);
    changed();
  }

  // Distributes with an equal gap between units (from the first to the last).
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
    const moving = new Set(us.flatMap((u) => u.ids));
    let list = scene.elements;
    let at = first[pos];
    for (const u of us) {
      const d = at - u.box[pos];
      list = moved(list, new Set(u.ids), axis === 'x' ? d : 0, axis === 'x' ? 0 : d, moving);
      at += u.box[len] + gap;
    }
    update(list);
    changed();
  }

  // The center of what is visible, in drawing coordinates.
  function viewCenter() {
    const r = canvas.getBoundingClientRect();
    return { x: (r.width / 2 - view.x) / view.zoom, y: (r.height / 2 - view.y) / view.zoom };
  }

  // Creating with the keyboard: the chosen shape, at a normal size, in the center of the view.
  function createAtCenter() {
    const c = grid ? E.snapPoint(viewCenter()) : viewCenter();
    if (tool === 'text') {
      newText(c);
      return;
    }
    commit();
    let e;
    if (tool === 'line' || tool === 'arrow') e = { ...E.createElement(tool, c.x - 80, c.y, style), points: [{ x: 0, y: 0 }, { x: 160, y: 0 }] };
    else if (tool === 'frame') e = { ...E.createElement('frame', c.x - 200, c.y - 150, style), w: 400, h: 300, name: frameName() };
    else e = { ...E.createElement(tool, c.x - 80, c.y - 40, style), w: 160, h: 80 };
    addElement(e);
    update(scene.elements);
    setTool('select');
    select([e.id]);
    changed();
  }

  // The next shape in a flowchart: same kind, size and style, on the side of `key` (an arrow key), joined to the
  // selected one by an arrow, with its text open. A place already taken is skipped, sliding beside it.
  const STYLE_KEYS = ['stroke', 'fill', 'fillStyle', 'width', 'dashed', 'roughness', 'opacity', 'fontSize'];
  function chainNext(key) {
    const from = primary()[0];
    const b = E.bounds(from);
    const [vx, vy] = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
    const gap = 80;
    const taken = (x, y) => scene.elements.some((e) => {
      if (E.isBoundText(e) || e.type === 'frame' || E.isLinear(e)) return false;
      const a = E.aabb(e);
      return a.x < x + b.w + 20 && x - 20 < a.x + a.w && a.y < y + b.h + 20 && y - 20 < a.y + a.h;
    });
    let x = b.x + vx * (b.w + gap);
    let y = b.y + vy * (b.h + gap);
    const x0 = x;
    const y0 = y;
    for (let i = 1; i < 30 && taken(x, y); i++) {
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      if (vx) y = y0 + k * (b.h + 40);
      else x = x0 + k * (b.w + 40);
    }
    if (grid) ({ x, y } = E.snapPoint({ x, y }));
    finishText();
    commit();
    const own = Object.fromEntries(STYLE_KEYS.map((k) => [k, from[k]]));
    const shape = { ...E.createElement(from.type, x, y, own), w: b.w, h: b.h };
    if (from.group) shape.group = from.group;
    const ca = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const cb = { x: x + b.w / 2, y: y + b.h / 2 };
    const arrow = {
      ...E.createElement('arrow', ca.x, ca.y, { ...own, fill: 'transparent', heads: style.heads, route: style.route }),
      points: [{ x: 0, y: 0 }, { x: cb.x - ca.x, y: cb.y - ca.y }], startId: from.id, endId: shape.id,
    };
    update([...scene.elements, shape, arrow]);
    select([shape.id]);
    revealSelection();
    editInside(shape);
  }

  // If the selection is out of view, the view moves to it.
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

  // --- Text ---
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
    textBox.style.fontFamily = E.fontOf(t);
    textBox.style.color = t.stroke;
    textBox.style.lineHeight = String(E.LINE_HEIGHT);
    placeTextBox(t);
    redraw();
    textBox.focus({ preventScroll: true });
    setTimeout(() => { if (editingText === id) textBox.focus({ preventScroll: true }); }, 0);
  }
  // Writing inside a shape: opens its text or creates one.
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
    let x = p.x;
    let y = p.y - style.fontSize * 0.6;
    if (grid) ({ x, y } = E.snapPoint({ x, y }));
    const t = E.createElement('text', x, y, { ...style, fill: 'transparent' });
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

  // --- Zoom and view ---
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

  // --- Pointer ---
  const pointers = new Map();
  function handleAt(wx, wy) {
    const f = frame();
    if (!f) return null;
    const tol = 8 / view.zoom;
    for (const [name, [hx, hy]] of Object.entries(handles(f))) if (Math.abs(wx - hx) <= tol && Math.abs(wy - hy) <= tol) return name;
    return null;
  }
  // The shape an arrow end at p would attach to.
  const bindTarget = (p, except) => E.shapeAt(scene.elements.filter((e) => !E.isBoundText(e)), p.x, p.y, { tol: 4 / view.zoom, except })?.id || null;
  const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rot: 'grab', p0: 'move', p1: 'move', mid: 'grab' };

  canvas.addEventListener('pointerdown', (ev) => {
    if (presenting) { laserAt(ev); return; } // presenting: the pointer is a laser, nothing changes
    if (ev.button === 2) return; // the context menu, not a tool
    if (pointers.size >= 2) return; // a third finger changes nothing
    if (tool !== 'text') root.focus({ preventScroll: true });
    else ev.preventDefault(); // so the click does not take focus away from the text box about to open
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      // Two fingers: pinch to zoom and drag to pan.
      const [a, b] = [...pointers.values()];
      // What the first finger had started is dropped (a shape just begun) or kept as it is.
      if (action?.kind === 'create') {
        update(scene.elements.filter((x) => x.id !== action.id));
        discard();
        selected.delete(action.id);
      } else if (action && action.kind !== 'pan' && action.kind !== 'marquee') {
        changed();
      }
      action = { kind: 'pinch', dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view } };
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
      if (h === 'mid') {
        commit();
        action = { kind: 'bend', orig: structuredClone(f.el) };
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
      const hit = owner(E.elementAt(free(), p.x, p.y, 6 / view.zoom));
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
        action = { kind: 'move', start: p, orig: scene.elements.map((e) => e), ids: withFrameContents(selected), moved: false };
      } else {
        if (!ev.shiftKey) selected.clear();
        action = { kind: 'marquee', start: p, box: { x: p.x, y: p.y, w: 0, h: 0 }, base: new Set(selected) };
      }
      syncPanel();
      redraw();
      return;
    }
    if (tool === 'text') {
      const shape = E.shapeAt(free(), p.x, p.y, { containersOnly: true });
      if (shape) editInside(shape);
      else newText(p);
      return;
    }
    commit();
    // On the grid, the shape starts on it (an arrow still attaches to the shape under the pointer).
    const at = grid && tool !== 'draw' ? E.snapPoint(p) : p;
    const e = E.createElement(tool, at.x, at.y, tool === 'draw' ? { ...style, fill: 'transparent' } : style);
    if (tool === 'frame') e.name = frameName();
    if (tool === 'arrow') {
      const s = bindTarget(p);
      if (s) e.startId = s;
    }
    addElement(e);
    action = { kind: 'create', id: e.id, start: at, dist: 0, target: null };
    redraw();
  });

  function eraseAt(p) {
    const hit = owner(E.elementAt(free(), p.x, p.y, 8 / view.zoom));
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
    if (presenting) { laserAt(ev); return; }
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!action) {
      if (tool === 'select') {
        const p = toWorld(ev.clientX, ev.clientY);
        const h = handleAt(p.x, p.y);
        canvas.style.cursor = h ? CURSORS[h] : E.elementAt(free(), p.x, p.y, 6 / view.zoom) ? 'move' : 'default';
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
      let dx = p.x - action.start.x;
      let dy = p.y - action.start.y;
      action.moved = action.moved || Math.abs(dx) + Math.abs(dy) > 1 / view.zoom;
      if (grid) {
        // The selection's top-left corner lands on the grid; everything moves by the same amount.
        action.box ??= E.sceneBounds(action.orig.filter((e) => action.ids.has(e.id) && !E.isBoundText(e)));
        dx = E.snap(action.box.x + dx) - action.box.x;
        dy = E.snap(action.box.y + dy) - action.box.y;
      }
      update(moved(action.orig, action.ids, dx, dy));
    } else if (action.kind === 'marquee') {
      action.box = { x: Math.min(action.start.x, p.x), y: Math.min(action.start.y, p.y), w: Math.abs(p.x - action.start.x), h: Math.abs(p.y - action.start.y) };
      const inside = E.elementsInBox(free(), action.box).filter((e) => !E.isBoundText(e)).map((e) => e.id);
      selected = expand([...action.base, ...inside]);
    } else if (action.kind === 'resize') {
      const b = action.box;
      let { x, y } = b;
      let x2 = b.x + b.w;
      let y2 = b.y + b.h;
      const q = grid ? E.snapPoint(p) : p;  // on the grid, the edges being dragged land on it
      if (action.handle.includes('w')) x = q.x;
      if (action.handle.includes('e')) x2 = q.x;
      if (action.handle.includes('n')) y = q.y;
      if (action.handle.includes('s')) y2 = q.y;
      if (ev.shiftKey && b.w && b.h) {
        // Keep the aspect ratio.
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
      // On the grid (and not rotated, where the grid's lines don't run along the edges) the edge lands on it.
      const q = grid && !action.orig.angle ? E.snapPoint(p) : p;
      const next = E.resizeByHandle(action.orig, action.handle, q, { keepRatio: ev.shiftKey });
      update(scene.elements.map((e) => (e.id === next.id ? next : e)));
    } else if (action.kind === 'rotate') {
      let delta = Math.atan2(p.y - action.c.y, p.x - action.c.x) - action.a0;
      if (ev.shiftKey || grid) {
        // In 15-degree steps (Shift, or with the grid on).
        const step = Math.PI / 12;
        const base = action.single ? action.single.angle || 0 : 0;
        delta = Math.round((base + delta) / step) * step - base;
      }
      const orig = new Map(action.orig.map((o) => [o.id, o]));
      update(scene.elements.map((e) => (orig.has(e.id) ? E.rotateElement(orig.get(e.id), action.c, delta) : e)));
    } else if (action.kind === 'bend') {
      // The curve passes through the pointer; close to the straight line it is straight again.
      const o = action.orig;
      const a = { x: o.x + o.points[0].x, y: o.y + o.points[0].y };
      const z = { x: o.x + o.points[1].x, y: o.y + o.points[1].y };
      const k = E.bendThrough(a, z, p);
      const { route, bend, ...rest } = o;
      const near = Math.abs(k) * Math.hypot(z.x - a.x, z.y - a.y) < 6 / view.zoom;
      const next = near ? rest : k === E.DEFAULT_BEND ? { ...rest, route: 'curve' } : { ...rest, route: 'curve', bend: k };
      update(scene.elements.map((e) => (e.id === o.id ? next : e)));
    } else if (action.kind === 'endpoint') {
      const o = action.orig;
      const pts = o.points.map((q) => ({ x: o.x + q.x, y: o.y + q.y }));
      pts[action.idx] = grid ? E.snapPoint(p) : p;  // an end that attaches to a shape goes to its outline anyway
      const key = action.idx === 0 ? 'startId' : 'endId';
      const other = action.idx === 0 ? o.endId : o.startId;
      action.target = o.type === 'arrow' ? bindTarget(p, other) : null;
      const next = { ...o, x: pts[0].x, y: pts[0].y, points: pts.map((q) => ({ x: q.x - pts[0].x, y: q.y - pts[0].y })) };
      delete next[key];
      update(scene.elements.map((e) => (e.id === o.id ? next : e)));
    } else if (action.kind === 'create') {
      const start = action.start;
      action.dist = Math.max(action.dist, Math.hypot(p.x - start.x, p.y - start.y) * view.zoom);
      const q = grid && tool !== 'draw' ? E.snapPoint(p) : p;
      let dx = q.x - start.x;
      let dy = q.y - start.y;
      const list = scene.elements.map((e) => {
        if (e.id !== action.id) return e;
        if (e.type === 'draw') return { ...e, points: [...e.points, { x: dx, y: dy }] };
        if (e.type === 'line' || e.type === 'arrow') {
          if (ev.shiftKey) {
            // Angles in 15-degree steps.
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
            const d = Math.hypot(dx, dy);
            dx = Math.cos(a) * d;
            dy = Math.sin(a) * d;
          }
          const next = { ...e, x: start.x, y: start.y, points: [{ x: 0, y: 0 }, { x: dx, y: dy }] };
          delete next.endId;
          if (e.type === 'arrow') {
            action.target = bindTarget(ev.shiftKey ? { x: start.x + dx, y: start.y + dy } : p, e.startId);
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
        discard();
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
    } else if (action.kind === 'pan') {
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
    const kind = action.kind;
    action = null;
    if (['move', 'resize', 'resize1', 'rotate', 'endpoint', 'bend', 'erase'].includes(kind)) changed();
    else {
      syncPanel();
      redraw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('dblclick', (ev) => {
    if (presenting) return;
    if (readOnly || tool === 'hand' || tool === 'eraser' || spaceDown) return;
    const p = toWorld(ev.clientX, ev.clientY);
    const hit = E.elementAt(free(), p.x, p.y, 6 / view.zoom);
    if (hit?.type === 'text') {
      commit();
      editText(hit.id);
      return;
    }
    if (hit?.type === 'frame') {
      renameFrame(hit);
      return;
    }
    const shape = E.shapeAt(free(), p.x, p.y, { containersOnly: true });
    if (shape) editInside(shape);
    else if (!hit) newText(p);
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (presenting) return;
    if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), ev.clientX, ev.clientY);
    else {
      view = { ...view, x: view.x - ev.deltaX, y: view.y - ev.deltaY };
      redraw();
    }
  }, { passive: false });

  // --- Keyboard ---
  let spaceDown = false;
  const KEYS = Object.fromEntries(TOOLS.map(([id, , key]) => [key.toLowerCase(), id]));
  root.addEventListener('keydown', (ev) => {
    // Shortcuts work anywhere in the editor except while typing in a field.
    if (ev.target.closest('input, textarea, select')) return;
    // Enter and Space on a toolbar or panel button press that button.
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target !== root && ev.target.closest('button, a[href], [role="button"]')) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (presenting) { presentKey(ev); return; }
    if (!mod && !ev.altKey && ev.shiftKey && k === 'p' && !readOnly) { ev.preventDefault(); startPresenting(); return; }
    if (ev.key === ' ') { spaceDown = true; canvas.style.cursor = 'grab'; ev.preventDefault(); return; }
    if (readOnly) return;
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); doUndo(); return; }
    if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); doRedo(); return; }
    if (mod && k === 'a') { ev.preventDefault(); setTool('select'); select(free().map((e) => e.id)); syncPanel(); redraw(); return; }
    if (mod && k === 'd') { ev.preventDefault(); duplicate(); return; }
    if (mod && !ev.shiftKey && k === 'f') { ev.preventDefault(); openSearch(); return; }
    if (mod && ev.shiftKey && k === 'l') { ev.preventDefault(); if (selected.size) lockSelected(); else unlockAll(); return; }
    if (mod && k === 'g') { ev.preventDefault(); if (ev.shiftKey) ungroupSelected(); else groupSelected(); return; }
    if (mod && k === 'c') { clipboard = selection().map((e) => structuredClone(e)); return; }
    if (mod && k === 'v' && clipboard?.length) {
      // The paste event comes first if the clipboard holds a picture; otherwise the copied elements go in.
      pastedPicture = false;
      setTimeout(() => {
        if (pastedPicture || !clipboard?.length) return;
        commit();
        clipboard = pasteCopies(clipboard, 24);
        changed();
      }, 0);
      return;
    }
    if (mod && (k === '+' || k === '=')) { ev.preventDefault(); zoomAt(1.2); return; }
    if (mod && k === '-') { ev.preventDefault(); zoomAt(1 / 1.2); return; }
    if (mod && k === '0') { ev.preventDefault(); zoomAt(1 / view.zoom); return; }
    // Ctrl/Cmd+arrow keys with one shape selected: the next shape on that side, joined by an arrow.
    if (mod && !ev.altKey && ev.key.startsWith('Arrow') && primary().length === 1 && E.isContainer(primary()[0])) {
      ev.preventDefault();
      chainNext(ev.key);
      return;
    }
    if (mod) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected.size) { ev.preventDefault(); removeSelected(); return; }
    if (ev.key === 'Escape') { selected.clear(); announce(); setTool('select'); return; }
    // Tab goes through the elements while something is selected (Escape clears it and Tab leaves the editor).
    if (ev.key === 'Tab' && ev.target === root && selected.size) {
      const list = [];
      for (const e of free()) if (!E.isBoundText(e) && !list.some((x) => e.group && x.group === e.group)) list.push(e);
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
      if (tool === 'select' && free().some((e) => !E.isBoundText(e))) {
        select([free().find((e) => !E.isBoundText(e)).id]);
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
      if (s.type === 'frame') { ev.preventDefault(); renameFrame(s); return; }
      if (s.type === 'text') { ev.preventDefault(); commit(); editText(s.id); return; }
      if (E.isContainer(s)) { ev.preventDefault(); editInside(s); return; }
    }
    if (ev.key.startsWith('Arrow') && selected.size) {
      ev.preventDefault();
      // On the grid, one cell (Shift: 1 px to fine-tune); without it, 1 px (Shift: 10).
      const d = grid ? (ev.shiftKey ? 1 : E.GRID_SIZE) : ev.shiftKey ? 10 : 1;
      const dx = ev.key === 'ArrowLeft' ? -d : ev.key === 'ArrowRight' ? d : 0;
      const dy = ev.key === 'ArrowUp' ? -d : ev.key === 'ArrowDown' ? d : 0;
      commit();
      update(moved(scene.elements, withFrameContents(selected), dx, dy));
      changed();
      return;
    }
    if (k === 'i' && !ev.altKey) { ev.preventDefault(); imageInput.click(); return; }
    if (k === 'l' && ev.shiftKey && library) { ev.preventDefault(); toggleLibrary(); return; }
    if (k === 'g' && !ev.altKey) {
      ev.preventDefault();
      setGrid(!grid);
      onGridChange(grid);
      return;
    }
    if (KEYS[k]) { ev.preventDefault(); setTool(KEYS[k]); }
  });
  // Space held while the focus leaves (another window, another field): its keyup never comes here.
  root.addEventListener('focusout', (ev) => {
    if (spaceDown && !root.contains(ev.relatedTarget)) {
      spaceDown = false;
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
  });
  root.addEventListener('keyup', (ev) => {
    if (ev.key === ' ') {
      spaceDown = false;
      canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
  });

  // Dragging in the colour picker fires many input events: they are one undo step, closed on change.
  let picking = null;
  for (const [input, prop] of [[strokeColor, 'stroke'], [fillColor, 'fill']]) {
    input.addEventListener('input', () => {
      setStyle({ [prop]: input.value }, { step: picking !== input });
      picking = input;
    });
    input.addEventListener('change', () => { picking = null; });
  }

  const ro = new ResizeObserver(() => redraw());
  ro.observe(canvas);
  const offImages = onImageReady(() => redraw());

  // Once the handwriting font loads, texts measure differently: lay them out again.
  let alive = true;
  fontReady(document).then(() => {
    if (!alive) return;
    E.forgetTextBoxes();
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
    pending = false;
    if (fit) requestAnimationFrame(() => zoomToFit());
    redraw();
    syncPanel();
  }

  // Canvas background, as an undoable step. Only colours the file format accepts.
  function setBackground(color) {
    if (readOnly || !E.isColor(color) || color === scene.background) return;
    commit();
    scene.background = color;
    changed();
  }
  // Shows the grid and snaps to it (or not).
  function setGrid(on) {
    if (grid === !!on) return;
    grid = !!on;
    status.textContent = tr(grid ? 'Grid on' : 'Grid off');
    redraw();
  }
  // 'light' or 'dark' forces the editor's appearance; anything else follows the system.
  function setTheme(theme) {
    root.classList.toggle('sk-light', theme === 'light');
    root.classList.toggle('sk-dark', theme === 'dark');
    redraw();
  }

  setTool(readOnly ? 'hand' : 'select');
  requestAnimationFrame(() => zoomToFit());
  return {
    // A copy of the selected elements (with the texts inside selected shapes), or [] if nothing is selected.
    getSelection: () => structuredClone(selection()),
    // The selected elements with what is inside the selected frames (for exporting a frame).
    getSelectionWithFrames: () => structuredClone(scene.elements.filter((e) => withFrameContents(selected).has(e.id))),
    insertImage,
    insertText,
    startPresenting,
    stopPresenting,
    setBackground,
    setGrid,
    setTheme,
    root,
    getScene,
    setScene,
    zoomToFit,
    focus: () => root.focus(),
    setTool,
    destroy() {
      finishText();
      alive = false;
      ro.disconnect();
      offImages();
      clearTimeout(flowTimer);
      clearTimeout(laserTimer);
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
