// Fusión a tres bandas por líneas (como hace git): a partir de la versión común (`base`), junta los
// cambios de `mine` y de `theirs`. Si los dos cambiaron las mismas líneas de forma distinta, hay choque
// y no se fusiona (la app guarda entonces la otra versión como copia, como antes).

const MAX_CELLS = 4e6; // notas enormes: no se intenta (se trata como choque)

// Pares [i, j] de líneas iguales de a y b, en orden (subsecuencia común más larga).
function lcs(a, b) {
  // Recorta lo común al principio y al final: es lo habitual y ahorra casi todo el trabajo.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_CELLS) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[start + i] === b[start + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) { pairs.push([start + i, start + j]); i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

// Devuelve { text, conflict }. Con conflict = true, `text` no sirve.
export function merge3(base, mine, theirs) {
  if (mine === theirs) return { text: mine, conflict: false };
  if (base === mine) return { text: theirs, conflict: false };
  if (base === theirs) return { text: mine, conflict: false };
  const O = base.split('\n');
  const A = mine.split('\n');
  const B = theirs.split('\n');
  const pa = lcs(O, A);
  const pb = lcs(O, B);
  if (!pa || !pb) return { text: '', conflict: true };
  const ma = new Map(pa);
  const mb = new Map(pb);
  const out = [];
  let o = 0;
  let a = 0;
  let b = 0;
  const chunk = (oEnd, aEnd, bEnd) => {
    const co = O.slice(o, oEnd);
    const ca = A.slice(a, aEnd);
    const cb = B.slice(b, bEnd);
    if (same(ca, co)) out.push(...cb);
    else if (same(cb, co)) out.push(...ca);
    else if (same(ca, cb)) out.push(...ca);
    // Los dos añadieron líneas en el mismo sitio sin borrar nada (lo típico en un diario): se quedan
    // las dos tandas, primero las de aquí.
    else if (!co.length) out.push(...ca, ...cb);
    else return false;
    return true;
  };
  for (let k = 0; k < O.length; k++) {
    // Línea de la base que sigue igual en las dos versiones: punto de sincronía.
    if (!ma.has(k) || !mb.has(k) || ma.get(k) < a || mb.get(k) < b) continue;
    if (!chunk(k, ma.get(k), mb.get(k))) return { text: '', conflict: true };
    out.push(O[k]);
    o = k + 1;
    a = ma.get(k) + 1;
    b = mb.get(k) + 1;
  }
  if (!chunk(O.length, A.length, B.length)) return { text: '', conflict: true };
  return { text: out.join('\n'), conflict: false };
}
