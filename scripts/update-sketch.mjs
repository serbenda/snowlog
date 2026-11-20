#!/usr/bin/env node
// Copies the drawing editor from a local copy of the bsketch repository (serbenda/bsketch) to public/:
// js/sketch-*.js, css/sketch.css and the handwriting font (fonts/). Imports are renamed so the
// portable build's bundler (which only understands './x.js' in public/js) finds them.
//
// Usage: node scripts/update-sketch.mjs ../sketch

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] || join(ROOT, '..', 'sketch'));
const FILES = ['stroke', 'scene', 'render', 'textdiagram', 'templates', 'editor'];
let commit = 'unknown';
try {
  commit = execFileSync('git', ['-C', SRC, 'rev-parse', '--short', 'HEAD']).toString().trim();
} catch { /* no git */ }

for (const f of FILES) {
  let src = readFileSync(join(SRC, 'js', `${f}.js`), 'utf8');
  src = src.replace(/from '\.\/(stroke|scene|render|textdiagram|templates|editor)\.js'/g, "from './sketch-$1.js'");
  const head = `// Copied from serbenda/bsketch (js/${f}.js, commit ${commit}) by scripts/update-sketch.mjs. Do not edit here.\n`;
  writeFileSync(join(ROOT, 'public', 'js', `sketch-${f}.js`), head + src);
}
writeFileSync(join(ROOT, 'public', 'css', 'sketch.css'), `/* Copied from serbenda/bsketch (css/sketch.css, commit ${commit}). Do not edit here. */\n${readFileSync(join(SRC, 'css', 'sketch.css'), 'utf8')}`);
// The handwriting font (Caveat, OFL) with its license. The portable build does not use it (no font-src).
mkdirSync(join(ROOT, 'public', 'fonts'), { recursive: true });
for (const f of ['caveat.woff', 'OFL.txt']) copyFileSync(join(SRC, 'fonts', f), join(ROOT, 'public', 'fonts', f));
console.log(`bsketch ${commit} copied to public/js/sketch-*.js, public/css/sketch.css and public/fonts/`);
