import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Ed from '../public/js/editor.js';

// Applies an edit and returns the text with the selection marked as | (or [ ] for a range).
function run(text, edit) {
  if (!edit) return null;
  const out = text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
  if (edit.selStart === edit.selEnd) return `${out.slice(0, edit.selStart)}|${out.slice(edit.selStart)}`;
  return `${out.slice(0, edit.selStart)}[${out.slice(edit.selStart, edit.selEnd)}]${out.slice(edit.selEnd)}`;
}
const at = (s) => ({ text: s.replace('|', ''), pos: s.indexOf('|') });

test('Enter continues lists, numbered lists, tasks and quotes', () => {
  let c = at('- one|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- one\n- |');
  c = at('    * two|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '    * two\n    * |');
  c = at('9. nine|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '9. nine\n10. |');
  c = at('- [x] done|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- [x] done\n- [ ] |');
  c = at('> quote|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '> quote\n> |');
  c = at('plain text|');
  assert.equal(Ed.continueList(c.text, c.pos, c.pos), null);
});

test('Enter on an empty item ends the list or moves up a level', () => {
  let c = at('- one\n- |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- one\n|');
  c = at('- one\n    - [ ] |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- one\n- [ ] |');
  c = at('> one\n> |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '> one\n|');
});

test('Tab and Shift+Tab indent lists and blocks', () => {
  let c = at('- one\n- tw|o');
  assert.equal(run(c.text, Ed.indentLines(c.text, c.pos, c.pos)), '- one\n    - tw|o');
  c = at('    - tw|o');
  assert.equal(run(c.text, Ed.indentLines(c.text, c.pos, c.pos, true)), '- tw|o');
  c = at('text|');
  assert.equal(Ed.indentLines(c.text, c.pos, c.pos), null);
  const t = 'a\nb\nc';
  assert.equal(run(t, Ed.indentLines(t, 0, t.length)), '    [a\n    b\n    c]');
});

test('Ctrl+B, Ctrl+I and Ctrl+K', () => {
  const t = 'hello world';
  assert.equal(run(t, Ed.toggleWrap(t, 6, 11, '**')), 'hello **[world]**');
  const b = 'hello **world**';
  assert.equal(run(b, Ed.toggleWrap(b, 8, 13, '**')), 'hello [world]');
  assert.equal(run(b, Ed.toggleWrap(b, 6, 15, '**')), 'hello [world]');
  assert.equal(run('', Ed.toggleWrap('', 0, 0, '*')), '*|*');
  assert.equal(run(t, Ed.insertLink(t, 6, 11)), 'hello [world]([https://])');
  const u = 'https://bendi.dev';
  assert.equal(run(u, Ed.insertLink(u, 0, u.length)), '[|](https://bendi.dev)');
});

test('Ctrl+Enter ticks, unticks or creates a task', () => {
  let c = at('- [ ] buy| bread');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [x] buy| bread');
  c = at('- [x] done|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [ ] done|');
  c = at('- item|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [ ] item|');
  c = at('  idea|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '  - [ ] idea|');
});

test('[[link autocomplete', () => {
  const c = at('see [[Reci|');
  const q = Ed.linkQuery(c.text, c.pos);
  assert.deepEqual(q, { start: 6, query: 'Reci' });
  assert.equal(run(c.text, Ed.completeLink(c.text, c.pos, q, 'Recipes')), 'see [[Recipes]]|');
  const d = at('see [[Reci|]] and more');
  const q2 = Ed.linkQuery(d.text, d.pos);
  assert.equal(run(d.text, Ed.completeLink(d.text, d.pos, q2, 'Recipes')), 'see [[Recipes]]| and more');
  assert.equal(Ed.linkQuery('[[Closed]] and', 12), null);
  assert.equal(Ed.linkQuery('[[a|alias', 9), null);

  const notes = [
    { id: '1', path: 'Projects/Recipe website', updated: '2026-11-01' },
    { id: '2', path: 'Recipes I like', updated: '2026-11-02' },
    { id: '3', path: 'Daily/2026-11-13', updated: '2026-11-13' },
  ];
  assert.deepEqual(Ed.suggestNotes(notes, 'rec').map((n) => n.id), ['2', '1']);
  assert.deepEqual(Ed.suggestNotes(notes, 'daily').map((n) => n.id), ['3']);
  assert.equal(Ed.suggestNotes(notes, '').length, 3);
});

test('highlighting escapes HTML and keeps the exact text', () => {
  const md = [
    '---', 'status: <b>', '---',
    '# Título **strong**', '- [x] done #tag', '1. one [[Link|alias]]',
    '> [!info] notice', '```', '<script>alert(1)</script> **no**', '```',
    'text with `code` and ==marked== <img src=x onerror=alert(1)>',
  ].join('\n');
  const html = Ed.highlight(md);
  assert.ok(!/<(script|img|b)\b/i.test(html), html);
  const plain = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  assert.equal(plain, md);
  assert.ok(html.includes('<span class="hl-tag">#tag</span>'));
  assert.ok(html.includes('class="hl-heading"'));
  assert.ok(!html.includes('hl-strong">no'), 'there is no formatting inside a code block');
});
