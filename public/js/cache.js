// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Local cache of encrypted files (IndexedDB). It stores the same thing the repo holds: ciphertext,
// never plaintext. It avoids downloading notes that have not changed again, and allows working
// offline. If IndexedDB is not available, it stores nothing and everything still works.

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
    // Deletes everything in this scope.
    clear: () => run('readwrite', (st) => st.delete(IDBKeyRange.bound(`${scope}|`, `${scope}|￿`))),
  };
}

// In-memory cache with the same shape, for the tests.
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
