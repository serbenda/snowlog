// Import a folder of Markdown (for example, an existing vault from another notes app).
// Everything happens in the browser: the chosen files are read, encrypted with the vault
// key and uploaded. Nothing leaves the device in plaintext.

export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

// Folders that are never imported: other apps' settings, Git, trash, editors…
const SKIP_DIR = /^(\.|node_modules$|__pycache__$)/;

// Characters that a Snowlog note name does not allow.
const BAD_CHARS = /[\\:*?"<>|#^[\]]/g;

function cleanSegment(s) {
  return s.replace(BAD_CHARS, '-').replace(/\s+/g, ' ').trim();
}

// files: a list of File-like objects with webkitRelativePath (or name), size and text().
// Devuelve { root, notes: [{ path, file }], skipped: { config, other, tooBig } }.
export function planImport(files) {
  const list = Array.from(files);
  const rels = list.map((f) => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  // If they all share the first folder (the one that was chosen), it is removed from the path.
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
