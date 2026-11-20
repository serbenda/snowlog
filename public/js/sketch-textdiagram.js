// Copied from serbenda/bsketch (js/textdiagram.js, commit fe1613f) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// Text to diagram, in the browser and without AI: an indented list, a simple Mermaid flowchart or `A -> B` lines
// become a graph (parseText), which is laid out in layers (layoutGraph) and turned into elements (textToElements):
// boxes with their text inside, arrows attached to them, labels and frames. Pure functions, no DOM.

import { createElement, measureText, newId, syncBindings, FONT } from './sketch-scene.js';

export const LIMITS = { chars: 50000, nodes: 300, edges: 600, label: 200 };
const DIRS = ['TD', 'LR', 'BT', 'RL'];

const clean = (s) => String(s).replace(/<br\s*\/?>/gi, '\n').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, LIMITS.label);
const unquote = (s) => {
  const t = s.trim();
  return t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t.slice(1, -1) : t;
};

// --- Graph being built: nodes by id, in the order they first appear ---
function graph(direction = 'TD') {
  const g = { direction, nodes: [], edges: [], groups: [], byId: new Map() };
  g.node = (id, label, shape) => {
    let n = g.byId.get(id);
    if (!n) {
      if (g.nodes.length >= LIMITS.nodes) return null;
      n = { id, label: clean(label ?? id) || id.slice(0, LIMITS.label), shape: shape || 'rectangle', group: null };
      g.byId.set(id, n);
      g.nodes.push(n);
    } else if (label != null && label !== '') {
      n.label = clean(label) || n.label;
      if (shape) n.shape = shape;
    }
    return n;
  };
  g.edge = (from, to, label = '', style = {}) => {
    if (!from || !to || g.edges.length >= LIMITS.edges) return;
    g.edges.push({ from: from.id, to: to.id, label: clean(label), ...style });
  };
  return g;
}

// --- Indented list ---
const BULLET_RE = /^(?:[-*+•]|\d{1,4}[.)])\s+/;
function parseOutline(lines) {
  const g = graph('TD');
  const stack = []; // [{ indent, node }]
  let n = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const expanded = raw.replace(/\t/g, '    ');
    const indent = expanded.length - expanded.trimStart().length;
    const label = expanded.trim().replace(BULLET_RE, '');
    if (!label) continue;
    const node = g.node(`n${n++}`, label, 'rectangle');
    if (!node) break;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) g.edge(stack[stack.length - 1].node, node);
    stack.push({ indent, node });
  }
  return g;
}

// --- `A -> B: label` lines ---
const ARROW_LINE_RE = /\s*(?:->|→|=>|⟶)\s*/;
function parseArrowLines(lines) {
  const g = graph('TD');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let label = '';
    let body = line;
    const colon = line.lastIndexOf(':');
    if (colon > 0 && ARROW_LINE_RE.test(line.slice(0, colon))) {
      label = line.slice(colon + 1);
      body = line.slice(0, colon);
    }
    const parts = body.split(ARROW_LINE_RE).map((p) => p.trim()).filter(Boolean);
    let prev = null;
    for (const p of parts) {
      const key = p.toLowerCase().slice(0, LIMITS.label);
      const node = g.node(key, p);
      if (!node) break;
      if (prev) g.edge(prev, node, parts.length === 2 ? label : '');
      prev = node;
    }
  }
  return g;
}

// --- Mermaid flowcharts (a subset) ---
// Node shapes: the opening bracket(s), the closing one(s) and the bsketch shape.
const SHAPES = [
  ['([', '])', 'ellipse'], ['((', '))', 'ellipse'], ['[[', ']]', 'rectangle'], ['[(', ')]', 'rectangle'],
  ['{{', '}}', 'diamond'], ['[', ']', 'rectangle'], ['(', ')', 'ellipse'], ['{', '}', 'diamond'], ['>', ']', 'rectangle'],
];
const ID_CHAR = /[A-Za-z0-9_\-.À-￿]/;

function readNode(s, i) {
  let j = i;
  while (j < s.length && ID_CHAR.test(s[j]) && !(s[j] === '-' && (s[j + 1] === '-' || s[j + 1] === '.' || s[j + 1] === '>'))) j++;
  if (j === i) return null;
  const id = s.slice(i, j);
  for (const [open, close, shape] of SHAPES) {
    if (!s.startsWith(open, j)) continue;
    const end = s.indexOf(close, j + open.length);
    if (end < 0) continue;
    return { id, label: unquote(s.slice(j + open.length, end)), shape, next: end + close.length };
  }
  return { id, label: null, shape: null, next: j };
}

// An edge at i: its style, its label and where the next node starts; null if there is none.
function readEdge(s, i) {
  const rest = s.slice(i, i + 400);
  const m = /^(<?)(-{2,}|-\.+-?|={2,})([>xo]?)(?:\|([^|]{0,300})\|)?/.exec(rest);
  // A label in the middle: "-- text -->", "-. text .->", "== text ==>".
  const mid = /^(-{2}|-\.|={2})\s([^-=.>|][^>|]{0,300}?)\s(-{2,}>|\.-+>|={2,}>|-{3,}|\.-+|={3,})/.exec(rest);
  if (mid) {
    const close = mid[3];
    return { label: mid[2], dashed: mid[1] === '-.', bold: mid[1] === '==', arrow: close.endsWith('>'), next: i + mid[0].length };
  }
  // A bare "--" is not an edge on its own (it starts a "-- label -->" handled above).
  if (!m || (m[2] === '--' && !m[3] && !m[4])) return null;
  const body = m[2];
  return {
    label: m[4] || '',
    dashed: body.includes('.'),
    bold: body.startsWith('='),
    arrow: m[3] === '>' || m[3] === 'x' || m[3] === 'o',
    both: m[1] === '<',
    next: i + m[0].length,
  };
}

const IGNORED_RE = /^(classDef|class|style|linkStyle|click|direction|%%|accTitle|accDescr|title)\b/;

function parseMermaid(lines, header) {
  const dir = (header?.[2] || 'TD').toUpperCase();
  const g = graph(dir === 'TB' ? 'TD' : DIRS.includes(dir) ? dir : 'TD');
  const groups = [];
  for (const raw of lines) {
    for (const stmt of raw.split(';')) {
      const line = stmt.replace(/%%.*$/, '').trim();
      if (!line || IGNORED_RE.test(line) || /^(graph|flowchart)\b/i.test(line)) continue;
      if (/^subgraph\b/i.test(line)) {
        const rest = line.replace(/^subgraph\s*/i, '');
        const m = /^([^\s[]+)\s*\[(.*)\]\s*$/.exec(rest);
        const title = clean(unquote(m ? m[2] : rest)) || 'Group';
        const grp = { id: newId(), title, nodes: [] };
        g.groups.push(grp);
        groups.push(grp);
        continue;
      }
      if (/^end$/i.test(line)) {
        groups.pop();
        continue;
      }
      // node (edge node)*, where a "node" can be "A & B".
      let i = 0;
      let prev = null;
      let pendingEdge = null;
      while (i < line.length) {
        while (line[i] === ' ' || line[i] === '\t') i++;
        if (i >= line.length) break;
        const list = [];
        for (;;) {
          const r = readNode(line, i);
          if (!r) break;
          const node = g.node(r.id, r.label, r.shape);
          if (node) {
            list.push(node);
            const grp = groups[groups.length - 1];
            if (grp && !node.group) {
              node.group = grp.id;
              grp.nodes.push(node.id);
            }
          }
          i = r.next;
          while (line[i] === ' ' || line[i] === '\t') i++;
          if (line[i] === '&') {
            i++;
            while (line[i] === ' ' || line[i] === '\t') i++;
            continue;
          }
          break;
        }
        if (!list.length) break;
        if (pendingEdge && prev) for (const a of prev) for (const b of list) g.edge(a, b, pendingEdge.label, { dashed: pendingEdge.dashed, bold: pendingEdge.bold, arrow: pendingEdge.arrow, both: pendingEdge.both });
        prev = list;
        pendingEdge = readEdge(line, i);
        if (!pendingEdge) break;
        i = pendingEdge.next;
      }
    }
  }
  return g;
}

// Which kind of text it is, and its graph; null if it isn't a diagram (fewer than two boxes).
export function parseText(text) {
  const src = String(text ?? '').slice(0, LIMITS.chars).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const first = lines.find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() || '';
  const header = /^(graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/i.exec(first) || (/^(graph|flowchart)\s*$/i.test(first) ? [first, first, 'TD'] : null);
  let g;
  let kind;
  // Mermaid's edges, looked for as plain text.
  const EDGE_MARKS = ['-->', '---', '==>', '-.->'];
  if (header || lines.some((l) => EDGE_MARKS.some((m) => l.includes(m)))) {
    g = parseMermaid(lines, header);
    kind = 'mermaid';
  } else if (lines.some((l) => ARROW_LINE_RE.test(l) && /(->|→|=>|⟶)/.test(l))) {
    g = parseArrowLines(lines);
    kind = 'arrows';
  } else {
    g = parseOutline(lines);
    kind = 'outline';
  }
  if (g.nodes.length < 2) return null;
  return { kind, direction: g.direction, nodes: g.nodes.map(({ id, label, shape, group }) => ({ id, label, shape, group })), edges: g.edges, groups: g.groups.filter((x) => x.nodes.length) };
}

// --- Layout: layers along the direction, boxes spread across it ---
const PAD_X = 28;
const PAD_Y = 18;
const GAP_ALONG = 90;
const GAP_ACROSS = 48;

function boxSize(n, fontSize, measure) {
  const lines = n.label.split('\n');
  const w = Math.max(...lines.map((l) => measure(l, fontSize, FONT)));
  const h = lines.length * fontSize * 1.25;
  let bw = Math.max(120, w + PAD_X * 2);
  let bh = Math.max(56, h + PAD_Y * 2);
  if (n.shape === 'ellipse') { bw *= 1.3; bh *= 1.3; }
  if (n.shape === 'diamond') { bw *= 1.6; bh *= 1.6; }
  return { w: Math.round(bw), h: Math.round(bh) };
}

export function layoutGraph(g, { fontSize = 20, measure = measureText, direction = g.direction } = {}) {
  const ids = g.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = ids.map(() => []);
  const inn = ids.map(() => []);
  for (const e of g.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    out[a].push(b);
    inn[b].push(a);
  }
  // Break cycles: edges back to a node still on the DFS path don't count for the layers.
  const state = ids.map(() => 0);
  const back = new Set();
  const order = [];
  for (let s = 0; s < ids.length; s++) {
    if (state[s]) continue;
    const stack = [[s, 0]];
    state[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, k] = top;
      if (k < out[v].length) {
        top[1]++;
        const w = out[v][k];
        if (state[w] === 1) back.add(`${v}>${w}`);
        else if (!state[w]) {
          state[w] = 1;
          stack.push([w, 0]);
        }
      } else {
        state[v] = 2;
        order.push(v);
        stack.pop();
      }
    }
  }
  order.reverse(); // topological order of the graph without its back edges
  const rank = ids.map(() => 0);
  for (const v of order) for (const w of out[v]) if (!back.has(`${v}>${w}`)) rank[w] = Math.max(rank[w], rank[v] + 1);
  // Each layer starts in the order the text wrote its boxes (the sweeps below keep it when nothing crosses).
  const layers = [];
  for (let v = 0; v < ids.length; v++) (layers[rank[v]] ||= []).push(v);
  // Order inside each layer by the average position of the neighbours, a few sweeps down and up.
  const pos = new Map();
  const place = () => layers.forEach((l) => l.forEach((v, i) => pos.set(v, i)));
  place();
  const mean = (vs) => (vs.length ? vs.reduce((a, v) => a + pos.get(v), 0) / vs.length : null);
  // A list's own order never crosses (it is a tree written top to bottom), so it is kept as written.
  for (let sweep = 0; sweep < (g.kind === 'outline' ? 0 : 6); sweep++) {
    const down = sweep % 2 === 0;
    const seq = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of seq) {
      const key = new Map(l.map((v) => [v, mean((down ? inn[v] : out[v]).filter((u) => rank[u] !== rank[v])) ?? pos.get(v)]));
      l.sort((a, b) => key.get(a) - key.get(b));
      l.forEach((v, i) => pos.set(v, i));
    }
  }
  // Sizes, then coordinates: `along` follows the direction, `across` spreads a layer.
  const horizontal = direction === 'LR' || direction === 'RL';
  const size = g.nodes.map((n) => boxSize(n, fontSize, measure));
  const alongOf = (v) => (horizontal ? size[v].w : size[v].h);
  const acrossOf = (v) => (horizontal ? size[v].h : size[v].w);
  const across = new Map();
  for (const l of layers) {
    const total = l.reduce((a, v) => a + acrossOf(v), 0) + GAP_ACROSS * (l.length - 1);
    let at = -total / 2;
    for (const v of l) {
      across.set(v, at + acrossOf(v) / 2);
      at += acrossOf(v) + GAP_ACROSS;
    }
  }
  // Each box moves towards its parents (going down) or its children (going up), keeping the layer's order and gaps;
  // then the layer shifts as a whole so, on average, boxes sit where they wanted to.
  const settle = (l, want) => {
    for (const v of l) if (want.has(v)) across.set(v, want.get(v));
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1];
      const b = l[i];
      const min = across.get(a) + acrossOf(a) / 2 + GAP_ACROSS + acrossOf(b) / 2;
      if (across.get(b) < min) across.set(b, min);
    }
    const ws = l.filter((v) => want.has(v));
    if (!ws.length) return;
    const shift = ws.reduce((a, v) => a + want.get(v) - across.get(v), 0) / ws.length;
    for (const v of l) across.set(v, across.get(v) + shift);
  };
  const towards = (v, near) => {
    const ns = near.filter((u) => rank[u] !== rank[v]);
    return ns.length ? ns.reduce((a, u) => a + across.get(u), 0) / ns.length : null;
  };
  for (let pass = 0; pass < 4; pass++) {
    for (const l of layers.slice(1)) settle(l, new Map(l.map((v) => [v, towards(v, inn[v])]).filter(([, x]) => x !== null)));
    for (const l of layers.slice(0, -1).reverse()) settle(l, new Map(l.map((v) => [v, towards(v, out[v])]).filter(([, x]) => x !== null)));
  }
  const along = [];
  let at = 0;
  for (const l of layers) {
    const depth = Math.max(...l.map(alongOf));
    for (const v of l) along[v] = at + depth / 2;
    at += depth + GAP_ALONG;
  }
  const flip = direction === 'BT' || direction === 'RL' ? -1 : 1;
  return g.nodes.map((n, v) => {
    const cAlong = along[v] * flip;
    const cAcross = across.get(v);
    const cx = horizontal ? cAlong : cAcross;
    const cy = horizontal ? cAcross : cAlong;
    return { id: n.id, x: cx - size[v].w / 2, y: cy - size[v].h / 2, w: size[v].w, h: size[v].h };
  });
}

// The diagram as bsketch elements, centred on `at`. `style` is the editor's current style.
export function textToElements(text, { at = { x: 0, y: 0 }, style = {}, direction, measure = measureText } = {}) {
  const g = parseText(text);
  if (!g) return null;
  const fontSize = 20;
  const boxes = layoutGraph(g, { fontSize, measure, direction: direction || g.direction });
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const dx = at.x - (minX + maxX) / 2;
  const dy = at.y - (minY + maxY) / 2;
  const base = { ...style, fontSize };
  const shapes = [];
  const texts = [];
  const byNode = new Map();
  g.nodes.forEach((n, i) => {
    const b = boxes[i];
    const shape = { ...createElement(n.shape, b.x + dx, b.y + dy, base), w: b.w, h: b.h };
    const label = { ...createElement('text', 0, 0, { ...base, fill: 'transparent' }), text: n.label, containerId: shape.id, align: 'center' };
    byNode.set(n.id, shape);
    shapes.push(shape);
    texts.push(label);
  });
  const arrows = [];
  const labels = [];
  for (const e of g.edges) {
    const a = byNode.get(e.from);
    const b = byNode.get(e.to);
    if (!a || !b || a === b) continue;
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const type = e.arrow === false ? 'line' : 'arrow';
    const arrow = { ...createElement(type, ca.x, ca.y, { ...base, fill: 'transparent', dashed: !!e.dashed, width: e.bold ? 4 : base.width ?? 2 }), points: [{ x: 0, y: 0 }, { x: cb.x - ca.x, y: cb.y - ca.y }], startId: a.id, endId: b.id };
    if (type === 'arrow' && e.both) arrow.heads = 'both';
    arrows.push(arrow);
    if (e.label) {
      const size = 16;
      const w = measure(e.label, size, FONT);
      labels.push({ ...createElement('text', (ca.x + cb.x) / 2 + 8, (ca.y + cb.y) / 2 - size * 1.4, { ...base, fill: 'transparent', fontSize: size }), text: e.label, w });
    }
  }
  const frames = [];
  for (const grp of g.groups) {
    const members = grp.nodes.map((id) => byNode.get(id)).filter(Boolean);
    if (!members.length) continue;
    const pad = 30;
    const x = Math.min(...members.map((m) => m.x)) - pad;
    const y = Math.min(...members.map((m) => m.y)) - pad;
    const w = Math.max(...members.map((m) => m.x + m.w)) + pad - x;
    const h = Math.max(...members.map((m) => m.y + m.h)) + pad - y;
    frames.push({ ...createElement('frame', x, y, base), w, h, name: grp.title });
  }
  return { kind: g.kind, nodes: g.nodes.length, edges: arrows.length, elements: syncBindings([...frames, ...shapes, ...texts, ...arrows, ...labels.map(({ w, ...t }) => t)]) };
}
