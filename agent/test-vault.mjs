#!/usr/bin/env node
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Creates a TEST vault to try the MCP server without touching the real notes:
//
//   node agent/test-vault.mjs <new-folder>
//
// Inside it leaves `remote.git` (standing in for GitHub) and `notes` (the clone the server works on),
// with the starter space (Home, templates) and the app's example project. The passphrase is asked for
// with the same dialog as the server (or SNOWLOG_ASKPASS), twice to confirm it.

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
  console.error('Usage: node agent/test-vault.mjs <new-folder>');
  process.exit(1);
}
if (existsSync(dir) && readdirSync(dir).length) {
  console.error(`The folder ${dir} already exists and is not empty.`);
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] });
const remote = join(dir, 'remote.git');
const notes = join(dir, 'notes');
git('init', '-q', '--bare', '-b', 'main', remote);
git('init', '-q', '-b', 'main', notes);
git('-C', notes, 'remote', 'add', 'origin', remote);
git('-C', notes, 'config', 'user.name', 'Snowlog (test vault)');
git('-C', notes, 'config', 'user.email', 'test@snowlog.invalid');

const secret = await askPassphrase('Passphrase for the Snowlog TEST vault');
if (!secret) process.exit(1);
const again = await askPassphrase('Repeat the TEST vault passphrase');
if (again !== secret) {
  console.error('The passphrases do not match.');
  process.exit(1);
}

const { vault } = await Vault.create(new GitDirRepo({ dir: notes }), secret, CONFIG.kdfIterations);
const starter = starterSpace(CONFIG.workspace);
const example = exampleSpace({ dailyFolder: CONFIG.workspace.dailyFolder });
await vault.importNotes(starter.notes, { message: 'set up my space', folders: starter.folders });
await vault.importNotes(example.notes.filter((n) => !vault.findByPath(n.path)), { message: 'load examples', folders: example.folders });

console.log(`Test vault created with ${vault.notes().length} notes.`);
console.log(`Clone: ${notes}`);
console.log(`MCP server for this vault:\n  node ${resolve(new URL('./mcp.js', import.meta.url).pathname)} --dir ${notes}`);
