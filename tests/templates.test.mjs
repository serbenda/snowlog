// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, applyTemplate, dailyPath, parseIsoDate, starterSpace, DAILY_TEMPLATE, workspaceSettings, LEGACY_WORKSPACE } from '../public/js/templates.js';
import { CONFIG } from '../public/js/config.js';
import { parseNote } from '../public/js/noteindex.js';
import { parseQuery, runQuery } from '../public/js/query.js';

const d = new Date(2026, 10, 12, 9, 5, 7); // Thursday 2026-11-12 09:05:07

test('date formats and literal text', () => {
  assert.equal(formatDate(d, 'YYYY-MM-DD'), '2026-11-12');
  assert.equal(formatDate(d, 'dddd, MMMM D, YYYY'), 'Thursday, November 12, 2026');
  assert.equal(formatDate(d, '[week of] D MMMM'), 'week of 12 November');
  assert.equal(formatDate(d, 'ddd DD/MM/YY HH:mm:ss'), 'Thu 12/11/26 09:05:07');
  assert.equal(formatDate(d, 'MMM'), 'Nov');
});

test('template variables', () => {
  assert.equal(applyTemplate('# {{title}} · {{date}} · {{ date:D MMMM }} · {{time}} · {{time:HH}}', { title: 'Plan', date: d }),
    '# Plan · 2026-11-12 · 12 November · 09:05 · 09');
  assert.equal(applyTemplate('{{other}} {{TITLE}}', { title: 'x', date: d }), '{{other}} x');
});

test('daily note paths', () => {
  assert.equal(dailyPath('Daily', d), 'Daily/2026-11-12');
  assert.equal(dailyPath('', d), '2026-11-12');
  assert.equal(parseIsoDate('2026-02-03').getMonth(), 1);
  assert.equal(parseIsoDate('03/02/2026'), null);
});

test('the generated daily note does not clutter queries with empty tasks', () => {
  const text = applyTemplate(DAILY_TEMPLATE, { title: '2026-11-12', date: d });
  assert.match(text, /^---\ndate: 2026-11-12\ntype: daily/);
  assert.match(text, /# Thursday, November 12, 2026/);
  const note = parseNote({ id: 'x', path: 'Daily/2026-11-12', text });
  assert.equal(note.tasks.length, 3);
  assert.ok(note.tasks.every((t) => t.empty));
  assert.equal(runQuery(parseQuery('TASK WHERE !completed'), [note]).count, 0);
});

test('starter space with configurable folders', () => {
  const s = starterSpace({ home: 'Home', dailyFolder: 'Journal', templatesFolder: 'System/Templates' });
  assert.deepEqual(s.folders, ['Projects', 'Archive', 'Journal', 'System/Templates']);
  assert.ok(s.notes.some((n) => n.path === 'System/Templates/Daily note'));
  const home = s.notes[0].text;
  assert.match(home, /FROM "Journal"/);
  assert.doesNotMatch(home, /FROM "Daily"/);
  assert.match(home, /\[\[System\/Templates\/Project\|Project\]\]/);
  for (const block of home.match(/```dataview\n([\s\S]*?)```/g)) {
    assert.doesNotThrow(() => parseQuery(block.replace(/```(dataview)?/g, '')), block);
  }
});

test('the default space uses English names', () => {
  const s = starterSpace(CONFIG.workspace);
  assert.deepEqual(s.folders, ['Projects', 'Archive', 'Daily', 'Templates']);
  assert.equal(s.notes[0].path, 'Home');
  assert.equal(CONFIG.workspace.dailyTemplate, 'Templates/Daily note');
  assert.ok(s.notes.some((n) => n.path === CONFIG.workspace.dailyTemplate));
});

// An existing vault set up with the earlier Spanish names keeps working without touching Settings.
const legacyIndex = {
  notes: {
    a: { path: 'Inicio' },
    b: { path: 'Diario/2026-11-12' },
    c: { path: 'Plantillas/Nota diaria' },
  },
  files: { f: { path: 'Adjuntos/photo.png' }, g: { path: 'Dibujos/plan.sketch' } },
  folders: ['Diario', 'Plantillas', 'Adjuntos', 'Dibujos'],
};

test('a new or English vault uses the defaults', () => {
  assert.deepEqual(workspaceSettings(CONFIG.workspace, {}, {}), CONFIG.workspace);
  const english = { notes: { a: { path: 'Home' }, b: { path: 'Daily/2026-11-12' } }, files: {}, folders: ['Daily'] };
  assert.deepEqual(workspaceSettings(CONFIG.workspace, {}, english), CONFIG.workspace);
  assert.deepEqual(workspaceSettings(CONFIG.workspace), CONFIG.workspace);
});

test('a vault with the earlier Spanish names keeps them', () => {
  const ws = workspaceSettings(CONFIG.workspace, {}, legacyIndex);
  for (const [k, v] of Object.entries(LEGACY_WORKSPACE)) assert.equal(ws[k], v, k);
  assert.equal(ws.openDailyOnStart, true);
});

test('each legacy name is detected on its own, by note, file or empty folder, ignoring case', () => {
  const only = (index) => workspaceSettings(CONFIG.workspace, {}, { notes: {}, files: {}, folders: [], ...index });
  assert.equal(only({ folders: ['diario'] }).dailyFolder, 'Diario');
  assert.equal(only({ folders: ['diario'] }).home, 'Home');
  assert.equal(only({ files: { x: { path: 'Adjuntos/a.pdf' } } }).attachmentsFolder, 'Adjuntos');
  assert.equal(only({ notes: { x: { path: 'Inicio' } } }).home, 'Inicio');
  // A note whose name only starts with the legacy name does not count.
  assert.equal(only({ notes: { x: { path: 'Inicios' }, y: { path: 'Diarios/x' } } }).home, 'Home');
  assert.equal(only({ notes: { y: { path: 'Diarios/x' } } }).dailyFolder, 'Daily');
});

test('what the vault stored in Settings always wins', () => {
  const ws = workspaceSettings(CONFIG.workspace, { dailyFolder: 'Journal', home: 'Daily' }, legacyIndex);
  assert.equal(ws.dailyFolder, 'Journal');
  assert.equal(ws.home, 'Daily');
  assert.equal(ws.templatesFolder, 'Plantillas');
  // Settings that are not folder names pass through untouched.
  assert.equal(workspaceSettings({ ...CONFIG.workspace, lockAfterMinutes: 10 }, { lockAfterMinutes: 3 }, legacyIndex).lockAfterMinutes, 3);
});

test('legacy names are only applied to keys the defaults have', () => {
  const ws = workspaceSettings({ home: 'Home' }, {}, legacyIndex);
  assert.deepEqual(ws, { home: 'Inicio' });
});
