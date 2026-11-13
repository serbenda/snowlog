#!/usr/bin/env node
// Crea una bóveda de PRUEBA para probar el servidor MCP sin tocar las notas de verdad:
//
//   node agent/test-vault.mjs <carpeta-nueva>
//
// Dentro deja `remote.git` (hace de GitHub) y `notas` (el clon con el que trabaja el servidor), con
// el espacio inicial (Inicio, plantillas) y el proyecto de ejemplo de la app. La frase de paso se pide
// con el mismo diálogo que el servidor (o SNOWLOG_ASKPASS), dos veces para confirmarla.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GitDirRepo } from './gitdir.js';
import { askPassphrase } from './askpass.js';
import { Vault } from '../public/js/vault.js';
import { CONFIG } from '../public/js/config.js';
import { starterSpace } from '../public/js/templates.js';
import { exampleSpace } from '../public/js/examples.js';

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir) {
  console.error('Uso: node agent/test-vault.mjs <carpeta-nueva>');
  process.exit(1);
}
if (existsSync(dir) && readdirSync(dir).length) {
  console.error(`La carpeta ${dir} ya existe y no está vacía.`);
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] });
const remote = join(dir, 'remote.git');
const notes = join(dir, 'notas');
git('init', '-q', '--bare', '-b', 'main', remote);
git('init', '-q', '-b', 'main', notes);
git('-C', notes, 'remote', 'add', 'origin', remote);
git('-C', notes, 'config', 'user.name', 'Snowlog (bóveda de prueba)');
git('-C', notes, 'config', 'user.email', 'prueba@snowlog.invalid');

const secret = await askPassphrase('Frase de paso para la bóveda de PRUEBA de Snowlog');
if (!secret) process.exit(1);
const again = await askPassphrase('Repite la frase de paso de la bóveda de PRUEBA');
if (again !== secret) {
  console.error('Las frases no coinciden.');
  process.exit(1);
}

const { vault } = await Vault.create(new GitDirRepo({ dir: notes }), secret, CONFIG.kdfIterations);
const starter = starterSpace(CONFIG.workspace);
const example = exampleSpace({ dailyFolder: CONFIG.workspace.dailyFolder });
await vault.importNotes(starter.notes, { message: 'configurar mi espacio', folders: starter.folders });
await vault.importNotes(example.notes.filter((n) => !vault.findByPath(n.path)), { message: 'cargar ejemplos', folders: example.folders });

console.log(`Bóveda de prueba creada con ${vault.notes().length} notas.`);
console.log(`Clon: ${notes}`);
console.log(`Servidor MCP para esta bóveda:\n  node ${resolve(new URL('./mcp.js', import.meta.url).pathname)} --dir ${notes}`);
