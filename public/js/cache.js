// Caché local de ficheros cifrados (IndexedDB). Guarda lo mismo que hay en el repo: texto cifrado,
// nunca en claro. Sirve para no volver a descargar las notas que no han cambiado y para trabajar
// sin conexión. Si IndexedDB no está disponible, no guarda nada y todo sigue funcionando.

const DB = 'snowlog-cache';
const STORE = 'blobs';

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// scope separa repos distintos (owner/repo). Devuelve { get, put, delete, clear }.
export function openCache(scope) {
  let dbp = null;
  const db = () => {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('no_idb'));
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbp;
  };
  const key = (k) => `${scope}|${k}`;
  const run = async (mode, fn) => {
    try {
      const d = await db();
      return await req(fn(d.transaction(STORE, mode).objectStore(STORE)));
    } catch {
      return undefined;
    }
  };
  return {
    get: (k) => run('readonly', (st) => st.get(key(k))),
    put: (k, v) => run('readwrite', (st) => st.put(v, key(k))),
    delete: (k) => run('readwrite', (st) => st.delete(key(k))),
    // Borra todo lo de este scope.
    clear: () => run('readwrite', (st) => st.delete(IDBKeyRange.bound(`${scope}|`, `${scope}|￿`))),
  };
}

// Caché en memoria con la misma forma, para los tests.
export function memoryCache() {
  const m = new Map();
  return {
    map: m,
    get: async (k) => m.get(k),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    clear: async () => m.clear(),
  };
}
