#!/usr/bin/env node
// Construye la versión portátil: un único fichero HTML con todo dentro (código, estilos e icono)
// que se abre con doble clic, sin instalar nada y sin conexión. Sus notas se guardan en una
// carpeta del ordenador o en el navegador. La CSP prohíbe cualquier conexión de red.
//
// Uso: node scripts/build-portable.mjs [salida]   (por defecto dist/snowlog-portable.html)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist', 'snowlog-portable.html'));
const read = (p) => readFileSync(join(PUB, p), 'utf8');

// --- Empaquetar los módulos ES en un único script clásico (file:// no admite módulos) ---
const IMPORT_RE = /^import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+'\.\/([\w-]+)\.js';\s*$/gm;
const modules = new Map();

function load(name) {
  if (modules.has(name)) return;
  modules.set(name, null); // marca de "en curso" para detectar ciclos
  let src = read(`js/${name}.js`);
  const deps = [];
  src = src.replace(IMPORT_RE, (_, star, named, dep) => {
    deps.push(dep);
    if (star) return `const ${star} = __m[${JSON.stringify(dep)}];`;
    const parts = named.split(',').map((x) => x.trim()).filter(Boolean)
      .map((x) => x.replace(/\s+as\s+/, ': '));
    return `const { ${parts.join(', ')} } = __m[${JSON.stringify(dep)}];`;
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${name}.js: import no soportado por el empaquetador`);
  const exported = [];
  src = src.replace(/^export\s+(async\s+function\*?|function\*?|class|const|let)\s+([\w$]+)/gm, (_, kind, id) => {
    exported.push(id);
    return `${kind} ${id}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`${name}.js: export no soportado por el empaquetador`);
  for (const d of deps) {
    if (modules.has(d) && modules.get(d) === null) throw new Error(`Dependencia circular: ${name} → ${d}`);
    load(d);
  }
  modules.set(name, `__m[${JSON.stringify(name)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`);
  order.push(name);
}
const order = [];
load('app');

const icon = read('icon.svg');
const iconUri = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;

let js = order.map((n) => modules.get(n)).join('\n\n');
// Configuración de la versión portátil: sin GitHub, sin red.
js = js.replace('__m["config"] = (() => {', '__m["config"] = (() => {\n// (versión portátil)')
  .replace(/(\nreturn \{ CONFIG \};\n\}\)\(\);)/, "\nCONFIG.mode = 'portable';$1");
js = js.replaceAll("src: 'icon.svg'", `src: ${JSON.stringify(iconUri)}`);
const script = `(() => {\n'use strict';\nconst __m = {};\n${js}\n})();`;

// Sin la letra a mano: la portátil no admite fuentes (ni font-src ni data:); se usa la cursiva del sistema.
const css = `${read('css/app.css')}\n${read('css/sketch.css').replace(/@font-face\s*\{[^}]*\}\s*/g, '')}`;
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${sha(script)}`,
  `style-src ${sha(css)}`,
  'img-src data: blob:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types snowlog',
].join('; ');

let html = read('index.html');
const swap = (re, value) => {
  if (!re.test(html)) throw new Error(`No encuentro ${re} en index.html`);
  html = html.replace(re, value);
};
swap(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
swap(/<link rel="icon" href="icon\.svg"[^>]*>/, `<link rel="icon" href="${iconUri}" type="image/svg+xml">`);
swap(/\n<link rel="manifest" href="manifest\.webmanifest">/, ''); // sin service worker ni instalación
swap(/\n<link rel="stylesheet" href="css\/sketch\.css">/, ''); // va junto con app.css
swap(/<link rel="stylesheet" href="css\/app\.css">/, () => `<style>${css}</style>`);
swap(/<script type="module" src="js\/app\.js"><\/script>\n?/, '');
swap(/<title>Snowlog<\/title>/, '<title>Snowlog portátil</title>');
html = html.replace('</body>', () => `<script>${script}</script>\n</body>`);

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
const stamp = `<!-- Snowlog portátil ${version} · ${new Date().toISOString().slice(0, 10)} · ábrelo con doble clic en Chrome o Edge. Sin instalación y sin conexión. -->\n`;
html = html.replace('<!doctype html>\n', () => `<!doctype html>\n${stamp}`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`${OUT} (${(html.length / 1024).toFixed(0)} KB, ${order.length} módulos)`);
