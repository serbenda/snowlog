// Mini driver de Chrome por el protocolo de DevTools, sin dependencias (Node 22: WebSocket global).
// Lo justo para los recorridos de tests/e2e: abrir páginas, ejecutar JS, teclear, interceptar la red.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((p) => p && existsSync(p)) || null;
}

export async function launch(chrome = findChrome()) {
  const profile = mkdtempSync(join(tmpdir(), 'snowlog-e2e-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`Chrome no arranca: ${buf}`)), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => reject(new Error(`Chrome se ha cerrado (${code}): ${buf}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return {
    send,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async newPage(opts) { return openPage(this, opts); },
    async close() {
      try { ws.close(); } catch { /* ya cerrado */ }
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 200));
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* da igual */ }
    },
  };
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
};

// Página nueva en un contexto aislado (como una ventana privada: almacenamiento propio).
async function openPage(browser, { intercept, initScript, offline = false } = {}) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  const errors = [];
  const requests = [];
  const off = browser.on(async (msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`excepción: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(p.type)) {
      errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) errors.push(`log: ${p.entry.text}`);
    if (msg.method === 'Network.requestWillBeSent') requests.push(p.request.url);
    if (msg.method === 'Fetch.requestPaused') {
      const r = p.request;
      if (r.method === 'OPTIONS') {
        // Preflight de CORS: se responde que sí, como haría GitHub.
        await send('Fetch.fulfillRequest', {
          requestId: p.requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'Access-Control-Allow-Origin', value: r.headers.Origin || r.headers.origin || '*' },
            { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE' },
            { name: 'Access-Control-Allow-Headers', value: r.headers['Access-Control-Request-Headers'] || r.headers['access-control-request-headers'] || '*' },
            { name: 'Access-Control-Max-Age', value: '600' },
          ],
        }).catch(() => {});
        return;
      }
      try {
        const res = await intercept(r.url, { method: r.method, body: r.postData, headers: r.headers });
        const body = Buffer.from(await res.arrayBuffer()).toString('base64');
        const headers = [...res.headers].map(([name, value]) => ({ name, value }));
        headers.push({ name: 'Access-Control-Allow-Origin', value: '*' });
        await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: res.status, responseHeaders: headers, body });
      } catch {
        await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
      }
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  if (offline) await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  if (intercept) await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.github.com/*' }] });
  if (initScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });

  const page = {
    errors,
    requests,
    async goto(url) {
      await send('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete"');
    },
    async reload() {
      await send('Page.reload', {});
      await new Promise((r) => setTimeout(r, 300));
      await page.waitFor('document.readyState === "complete"');
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(`${expr}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(expr, timeout = 15000) {
      const t0 = Date.now();
      for (;;) {
        try {
          const v = await page.eval(`(() => { try { return ${expr}; } catch { return false; } })()`);
          if (v) return v;
        } catch { /* la página aún está cargando */ }
        if (Date.now() - t0 > timeout) throw new Error(`Esperando: ${expr}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    // Busca un elemento por selector y, si se da, por su texto.
    sel: (css, text) => `[...document.querySelectorAll(${JSON.stringify(css)})].find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'} && e.offsetParent !== null)`,
    async click(css, text) {
      await page.waitFor(`!!${page.sel(css, text)}`);
      await page.eval(`${page.sel(css, text)}.click()`);
    },
    async fill(css, value) {
      await page.waitFor(`!!${page.sel(css)}`);
      await page.eval(`(() => { const e = ${page.sel(css)}; e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    async type(text) {
      for (const part of text.split(/(\n)/)) {
        if (part === '\n') await page.press('Enter');
        else if (part) await send('Input.insertText', { text: part });
      }
    },
    async press(key, { ctrl = false, shift = false } = {}) {
      const k = KEYS[key] || { key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };
      const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0);
      const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k.text && !ctrl ? { text: k.text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async close() {
      off();
      await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    },
  };
  return page;
}
