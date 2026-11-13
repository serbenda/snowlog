#!/usr/bin/env node
// Copia el editor de dibujos desde una copia local del repo sketch (serbenda/sketch) a public/:
// js/sketch-*.js y css/sketch.css. Los imports se renombran para que el empaquetador de la versión
// portátil (que solo entiende './x.js' en public/js) los encuentre.
//
// Uso: node scripts/update-sketch.mjs ../sketch

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] || join(ROOT, '..', 'sketch'));
const FILES = ['trazo', 'escena', 'pintar', 'editor'];
let commit = 'desconocido';
try {
  commit = execFileSync('git', ['-C', SRC, 'rev-parse', '--short', 'HEAD']).toString().trim();
} catch { /* sin git */ }

for (const f of FILES) {
  let src = readFileSync(join(SRC, 'js', `${f}.js`), 'utf8');
  src = src.replace(/from '\.\/(trazo|escena|pintar|editor)\.js'/g, "from './sketch-$1.js'");
  const head = `// Copiado de serbenda/sketch (js/${f}.js, commit ${commit}) con scripts/update-sketch.mjs. No editar aquí.\n`;
  writeFileSync(join(ROOT, 'public', 'js', `sketch-${f}.js`), head + src);
}
writeFileSync(join(ROOT, 'public', 'css', 'sketch.css'), `/* Copiado de serbenda/sketch (css/sketch.css, commit ${commit}). No editar aquí. */\n${readFileSync(join(SRC, 'css', 'sketch.css'), 'utf8')}`);
console.log(`sketch ${commit} copiado en public/js/sketch-*.js y public/css/sketch.css`);
