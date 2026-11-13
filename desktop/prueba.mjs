// Prueba de humo de la app de escritorio por WebDriver (tauri-driver en 127.0.0.1:4444): abre la
// app, espera a que la web dentro cumpla una condición y la cierra. Sin dependencias.
// Uso: node desktop/prueba.mjs <ejecutable> "<expresión JS que debe ser verdadera>"

const [app, cond] = process.argv.slice(2);
const BASE = 'http://127.0.0.1:4444';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  return json.value;
}

// tauri-driver tarda un poco en escuchar
for (let i = 0; ; i++) {
  try {
    await fetch(`${BASE}/status`);
    break;
  } catch (e) {
    if (i > 50) throw e;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const { sessionId } = await call('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: app } } } });
try {
  const run = (script) => call('POST', `/session/${sessionId}/execute/sync`, { script, args: [] });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    ok = await run(`return !!(${cond});`).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 500));
  }
  const info = await run('return { titulo: document.title, url: location.href, ancho: innerWidth, alto: innerHeight };');
  console.log('La web dentro de la app:', JSON.stringify(info));
  if (!ok) throw new Error(`No se cumple: ${cond}`);
  console.log(`OK: ${cond}`);
} finally {
  await call('DELETE', `/session/${sessionId}`).catch(() => {});
}
