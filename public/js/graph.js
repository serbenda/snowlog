// Grafo de notas: nodos = notas, aristas = [[enlaces]] entre ellas.
// Disposición por fuerzas (repulsión entre nodos, muelles en los enlaces y un poco de gravedad
// hacia el centro), sin librerías. Las funciones son puras para poder probarlas.

// notes: notas del índice (noteindex.js), con `links` (nombres o rutas en minúsculas).
export function buildGraph(notes) {
  const byPath = new Map();
  const byName = new Map();
  for (const n of notes) {
    byPath.set(n.path.toLowerCase(), n.id);
    const k = n.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, n.id);
  }
  const nodes = notes.map((n) => ({ id: n.id, name: n.name, path: n.path, deg: 0 }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const seen = new Set();
  const links = [];
  for (const n of notes) {
    for (const target of n.links) {
      const id = byPath.get(target) || byName.get(target);
      if (!id || id === n.id) continue;
      const [a, b] = [index.get(n.id), index.get(id)].sort((x, y) => x - y);
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ s: a, t: b });
      nodes[a].deg += 1;
      nodes[b].deg += 1;
    }
  }
  return { nodes, links };
}

// Solo la nota y las que están a `depth` saltos o menos.
export function localGraph(graph, id, depth = 1) {
  const start = graph.nodes.findIndex((n) => n.id === id);
  if (start < 0) return { nodes: [], links: [] };
  const keep = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const l of graph.links) {
      for (const [a, b] of [[l.s, l.t], [l.t, l.s]]) {
        if (frontier.includes(a) && !keep.has(b)) {
          keep.add(b);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  const order = [...keep];
  const map = new Map(order.map((old, i) => [old, i]));
  return recount({
    nodes: order.map((i) => ({ ...graph.nodes[i] })),
    links: graph.links.filter((l) => keep.has(l.s) && keep.has(l.t)).map((l) => ({ s: map.get(l.s), t: map.get(l.t) })),
  });
}

function recount(g) {
  for (const n of g.nodes) n.deg = 0;
  for (const l of g.links) {
    g.nodes[l.s].deg += 1;
    g.nodes[l.t].deg += 1;
  }
  return g;
}

// Posiciones iniciales en espiral (deterministas: el mismo grafo sale siempre igual).
export function initLayout(graph) {
  graph.nodes.forEach((n, i) => {
    const a = i * 2.399963; // ángulo áureo
    const r = 12 * Math.sqrt(i + 1);
    n.x = r * Math.cos(a);
    n.y = r * Math.sin(a);
    n.vx = 0;
    n.vy = 0;
  });
  return graph;
}

// Un paso de la simulación. Devuelve la energía (para saber cuándo se ha quedado quieto).
export function step(graph, { repulsion = 2600, spring = 0.035, length = 110, gravity = 0.01, damping = 0.82, fixed = -1 } = {}) {
  const { nodes, links } = graph;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = (i - j) * 0.1;
        dy = 0.1;
        d2 = dx * dx + dy * dy;
      }
      if (d2 > 360000) continue; // lejos: no se empujan
      const f = repulsion / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
  }
  for (const l of links) {
    const a = nodes[l.s];
    const b = nodes[l.t];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = spring * (d - length);
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const p = nodes[i];
    p.vx = (p.vx - p.x * gravity) * damping;
    p.vy = (p.vy - p.y * gravity) * damping;
    if (i === fixed) {
      p.vx = 0;
      p.vy = 0;
    }
    p.x += Math.max(-30, Math.min(30, p.vx));
    p.y += Math.max(-30, Math.min(30, p.vy));
    energy += p.vx * p.vx + p.vy * p.vy;
  }
  return energy / Math.max(1, n);
}
