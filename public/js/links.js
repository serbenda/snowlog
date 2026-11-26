// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Rewrite [[…]] links when a note is renamed or moved to another folder.
// It respects the alias ([[Note|text]]), the heading ([[Note#Section]]), embeds (![[…]])
// and touches nothing inside code blocks or `inline code`.

const LINK_RE = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g;

function rewriteLine(line, map) {
  // The `code` pieces are split off so they are left alone.
  return line.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(LINK_RE, (m, bang, target, heading = '', alias = '') => {
    const to = map(target.trim());
    return to == null ? m : `${bang}[[${to}${heading}${alias}]]`;
  }))).join('');
}

// changes: [{ from: 'Folder/Old', to: 'Other/New', byName: true }]
// byName says whether links by short name ([[Old]]) certainly pointed to this note.
// Returns the new text, or null if nothing changes.
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

// Builds the list of changes for a rename, knowing which notes exist (before the change).
// moves: [{ from, to }] (full paths, without .md). allPaths: paths of every note before the change.
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
      // Links by short name only belong to this note if its name was unique.
      byName: count.get(from.split('/').pop().toLowerCase()) === 1,
      // If the new name is not unique, the link uses the full path so it is not mistaken.
      toName: after.get(toName.toLowerCase()) > 1 ? to : toName,
    };
  });
}
