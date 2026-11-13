import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Ed from '../public/js/editor.js';

// Aplica una edición y devuelve el texto con la selección marcada como | (o [ ] si hay rango).
function run(text, edit) {
  if (!edit) return null;
  const out = text.slice(0, edit.start) + edit.insert + text.slice(edit.end);
  if (edit.selStart === edit.selEnd) return `${out.slice(0, edit.selStart)}|${out.slice(edit.selStart)}`;
  return `${out.slice(0, edit.selStart)}[${out.slice(edit.selStart, edit.selEnd)}]${out.slice(edit.selEnd)}`;
}
const at = (s) => ({ text: s.replace('|', ''), pos: s.indexOf('|') });

test('Intro continúa listas, numeradas, tareas y citas', () => {
  let c = at('- uno|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- uno\n- |');
  c = at('    * dos|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '    * dos\n    * |');
  c = at('9. nueve|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '9. nueve\n10. |');
  c = at('- [x] hecha|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- [x] hecha\n- [ ] |');
  c = at('> cita|');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '> cita\n> |');
  c = at('texto normal|');
  assert.equal(Ed.continueList(c.text, c.pos, c.pos), null);
});

test('Intro en un elemento vacío termina la lista o sube un nivel', () => {
  let c = at('- uno\n- |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- uno\n|');
  c = at('- uno\n    - [ ] |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '- uno\n- [ ] |');
  c = at('> uno\n> |');
  assert.equal(run(c.text, Ed.continueList(c.text, c.pos, c.pos)), '> uno\n|');
});

test('Tab y Mayús+Tab sangran listas y bloques', () => {
  let c = at('- uno\n- do|s');
  assert.equal(run(c.text, Ed.indentLines(c.text, c.pos, c.pos)), '- uno\n    - do|s');
  c = at('    - do|s');
  assert.equal(run(c.text, Ed.indentLines(c.text, c.pos, c.pos, true)), '- do|s');
  c = at('texto|');
  assert.equal(Ed.indentLines(c.text, c.pos, c.pos), null);
  const t = 'a\nb\nc';
  assert.equal(run(t, Ed.indentLines(t, 0, t.length)), '    [a\n    b\n    c]');
});

test('Ctrl+B, Ctrl+I y Ctrl+K', () => {
  const t = 'hola mundo';
  assert.equal(run(t, Ed.toggleWrap(t, 5, 10, '**')), 'hola **[mundo]**');
  const b = 'hola **mundo**';
  assert.equal(run(b, Ed.toggleWrap(b, 7, 12, '**')), 'hola [mundo]');
  assert.equal(run(b, Ed.toggleWrap(b, 5, 14, '**')), 'hola [mundo]');
  assert.equal(run('', Ed.toggleWrap('', 0, 0, '*')), '*|*');
  assert.equal(run(t, Ed.insertLink(t, 5, 10)), 'hola [mundo]([https://])');
  const u = 'https://bendi.dev';
  assert.equal(run(u, Ed.insertLink(u, 0, u.length)), '[|](https://bendi.dev)');
});

test('Ctrl+Intro marca, desmarca o crea una tarea', () => {
  let c = at('- [ ] comprar| pan');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [x] comprar| pan');
  c = at('- [x] hecho|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [ ] hecho|');
  c = at('- elemento|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '- [ ] elemento|');
  c = at('  idea|');
  assert.equal(run(c.text, Ed.toggleTask(c.text, c.pos)), '  - [ ] idea|');
});

test('autocompletar [[enlaces', () => {
  const c = at('ver [[Rece|');
  const q = Ed.linkQuery(c.text, c.pos);
  assert.deepEqual(q, { start: 6, query: 'Rece' });
  assert.equal(run(c.text, Ed.completeLink(c.text, c.pos, q, 'Recetas')), 'ver [[Recetas]]|');
  const d = at('ver [[Rece|]] y más');
  const q2 = Ed.linkQuery(d.text, d.pos);
  assert.equal(run(d.text, Ed.completeLink(d.text, d.pos, q2, 'Recetas')), 'ver [[Recetas]]| y más');
  assert.equal(Ed.linkQuery('[[Cerrado]] y', 13), null);
  assert.equal(Ed.linkQuery('[[a|alias', 9), null);

  const notes = [
    { id: '1', path: 'Proyectos/Web de recetas', updated: '2026-11-01' },
    { id: '2', path: 'Recetas favoritas', updated: '2026-11-02' },
    { id: '3', path: 'Diario/2026-11-13', updated: '2026-11-13' },
  ];
  assert.deepEqual(Ed.suggestNotes(notes, 'rec').map((n) => n.id), ['2', '1']);
  assert.deepEqual(Ed.suggestNotes(notes, 'diario').map((n) => n.id), ['3']);
  assert.equal(Ed.suggestNotes(notes, '').length, 3);
});

test('el resaltado escapa el HTML y conserva el texto exacto', () => {
  const md = [
    '---', 'estado: <b>', '---',
    '# Título **fuerte**', '- [x] hecha #tag', '1. uno [[Enlace|alias]]',
    '> [!info] aviso', '```', '<script>alert(1)</script> **no**', '```',
    'texto con `código` y ==marcado== <img src=x onerror=alert(1)>',
  ].join('\n');
  const html = Ed.highlight(md);
  assert.ok(!/<(script|img|b)\b/i.test(html), html);
  const plain = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  assert.equal(plain, md);
  assert.ok(html.includes('<span class="hl-tag">#tag</span>'));
  assert.ok(html.includes('class="hl-heading"'));
  assert.ok(!html.includes('hl-strong">no'), 'dentro de un bloque de código no hay formato');
});
