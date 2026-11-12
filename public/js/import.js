// Importar una carpeta de Markdown (por ejemplo, una bóveda de Obsidian).
// Todo ocurre en el navegador: se leen los ficheros elegidos, se cifran con la clave
// de la bóveda y se suben. Nada sale del dispositivo en claro.

export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

// Carpetas que nunca se importan: configuración de Obsidian, Git, papelera, editores…
const SKIP_DIR = /^(\.|node_modules$|__pycache__$)/;

// Caracteres que no admite un nombre de nota en Snowlog.
const BAD_CHARS = /[\\:*?"<>|#^[\]]/g;

function cleanSegment(s) {
  return s.replace(BAD_CHARS, '-').replace(/\s+/g, ' ').trim();
}

// files: lista de objetos tipo File con webkitRelativePath (o name), size y text().
// Devuelve { root, notes: [{ path, file }], skipped: { config, other, tooBig } }.
export function planImport(files) {
  const list = Array.from(files);
  const rels = list.map((f) => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  // Si todos comparten la primera carpeta (la que se eligió), se quita del camino.
  const firsts = new Set(rels.map((r) => (r.includes('/') ? r.split('/')[0] : '')));
  const root = firsts.size === 1 && !firsts.has('') ? [...firsts][0] : '';

  const notes = [];
  const skipped = { config: 0, other: 0, tooBig: 0 };
  list.forEach((file, i) => {
    let parts = rels[i].split('/').filter(Boolean);
    if (root) parts = parts.slice(1);
    const dirs = parts.slice(0, -1);
    const name = parts[parts.length - 1] || '';
    if (dirs.some((d) => SKIP_DIR.test(d)) || name.startsWith('.')) {
      skipped.config += 1;
      return;
    }
    if (!/\.md$/i.test(name)) {
      skipped.other += 1;
      return;
    }
    if (file.size > MAX_NOTE_BYTES) {
      skipped.tooBig += 1;
      return;
    }
    const segs = [...dirs, name.replace(/\.md$/i, '')].map(cleanSegment).filter(Boolean);
    if (!segs.length) {
      skipped.other += 1;
      return;
    }
    notes.push({ path: segs.join('/'), file });
  });
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return { root, notes, skipped };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
