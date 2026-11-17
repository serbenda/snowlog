// Smoke test of the desktop app over WebDriver (tauri-driver on 127.0.0.1:4444): opens the app,
// waits until the web app inside meets a condition, and closes it. No dependencies.
// Usage: node desktop/smoke-test.mjs <executable> "<JS expression that must be true>"

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

// tauri-driver takes a moment to start listening
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
  const info = await run('return { title: document.title, url: location.href, width: innerWidth, height: innerHeight };');
  console.log('The web app inside the window:', JSON.stringify(info));
  if (!ok) throw new Error(`Condition not met: ${cond}`);
  console.log(`OK: ${cond}`);
} finally {
  await call('DELETE', `/session/${sessionId}`).catch(() => {});
}
