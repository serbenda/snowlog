// Reescribir enlaces [[…]] cuando una nota cambia de nombre o de carpeta.
// Respeta el alias ([[Nota|texto]]), el encabezado ([[Nota#Sección]]), los incrustados (![[…]])
// y no toca nada dentro de bloques de código ni de `código en línea`.

const LINK_RE = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g;

function rewriteLine(line, map) {
  // Se separan los trozos de `código` para no tocarlos.
  return line.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(LINK_RE, (m, bang, target, heading = '', alias = '') => {
    const to = map(target.trim());
    return to == null ? m : `${bang}[[${to}${heading}${alias}]]`;
  }))).join('');
}

// changes: [{ from: 'Carpeta/Vieja', to: 'Otra/Nueva', byName: true }]
// byName indica si los enlaces por nombre corto ([[Vieja]]) apuntaban sin duda a esta nota.
// Devuelve el texto nuevo, o null si no cambia nada.
export function rewriteLinks(text, changes) {
  const byPath = new Map();
  const byName = new Map();
  for (const c of changes) {
    const fromName = c.from.split('/').pop();
    const toName = c.to.split('/').pop();
    byPath.set(c.from.toLowerCase(), c.to);
    if (c.byName && fromName !== toName) byName.set(fromName.toLowerCase(), c.toName || toName);
  }
  const map = (target) => {
    const low = target.toLowerCase();
    if (target.includes('/')) return byPath.has(low) ? byPath.get(low) : null;
    return byName.has(low) ? byName.get(low) : null;
  };
  let fence = null;
  let changed = false;
  const out = text.split('\n').map((line) => {
    const m = line.match(/^\s*(?:>\s*)*(```|~~~)/);
    if (m) {
      fence = fence === m[1] ? null : (fence || m[1]);
      return line;
    }
    if (fence || !line.includes('[[')) return line;
    const next = rewriteLine(line, map);
    if (next !== line) changed = true;
    return next;
  });
  return changed ? out.join('\n') : null;
}

// Construye la lista de cambios para un renombrado, sabiendo qué notas hay (antes del cambio).
// moves: [{ from, to }] (rutas completas, sin .md). allPaths: rutas de todas las notas antes del cambio.
export function linkChanges(moves, allPaths) {
  const count = new Map();
  for (const p of allPaths) {
    const n = p.split('/').pop().toLowerCase();
    count.set(n, (count.get(n) || 0) + 1);
  }
  const after = new Map(count);
  for (const { from, to } of moves) {
    const a = from.split('/').pop().toLowerCase();
    const b = to.split('/').pop().toLowerCase();
    if (a !== b) {
      after.set(a, after.get(a) - 1);
      after.set(b, (after.get(b) || 0) + 1);
    }
  }
  return moves.map(({ from, to }) => {
    const toName = to.split('/').pop();
    return {
      from,
      to,
      // Los enlaces por nombre corto solo son de esta nota si su nombre era único.
      byName: count.get(from.split('/').pop().toLowerCase()) === 1,
      // Si el nombre nuevo queda repetido, se enlaza con la ruta completa para no confundirlo.
      toName: after.get(toName.toLowerCase()) > 1 ? to : toName,
    };
  });
}
