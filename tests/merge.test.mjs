import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3 } from '../public/js/merge.js';

const base = ['# Lista', '- leche', '- pan', '', '## Notas', 'nada todavía', 'fin'].join('\n');

test('cambios en sitios distintos se juntan', () => {
  const mine = base.replace('- pan', '- pan integral');
  const theirs = base.replace('nada todavía', 'llamar al fontanero');
  assert.deepEqual(merge3(base, mine, theirs), { text: base.replace('- pan', '- pan integral').replace('nada todavía', 'llamar al fontanero'), conflict: false });
});

test('si solo cambió uno, gana ese; si los dos igual, también', () => {
  const mine = base.replace('fin', 'FIN');
  assert.equal(merge3(base, mine, base).text, mine);
  assert.equal(merge3(base, base, mine).text, mine);
  assert.equal(merge3(base, mine, mine).text, mine);
});

test('añadir líneas en el mismo sitio desde los dos lados: se quedan las dos', () => {
  const mine = `${base}\n- 10:00 escrito en el portátil`;
  const theirs = `${base}\n- 10:05 escrito en el móvil`;
  const r = merge3(base, mine, theirs);
  assert.equal(r.conflict, false);
  assert.ok(r.text.endsWith('- 10:00 escrito en el portátil\n- 10:05 escrito en el móvil'));
});

test('cambiar la misma línea de forma distinta es un choque', () => {
  const r = merge3(base, base.replace('- leche', '- leche sin lactosa'), base.replace('- leche', '- leche de avena'));
  assert.equal(r.conflict, true);
});

test('borrar en un lado y cambiar en el otro la misma línea es un choque', () => {
  assert.equal(merge3(base, base.replace('- pan\n', ''), base.replace('- pan', '- pan de centeno')).conflict, true);
});

test('borrados y añadidos en sitios distintos', () => {
  const mine = base.replace('- leche\n', '');
  const theirs = base.replace('## Notas', '## Notas\n- nueva idea');
  const r = merge3(base, mine, theirs);
  assert.equal(r.conflict, false);
  assert.equal(r.text, ['# Lista', '- pan', '', '## Notas', '- nueva idea', 'nada todavía', 'fin'].join('\n'));
});

test('notas grandes: rápido', () => {
  const big = Array.from({ length: 5000 }, (_, i) => `línea ${i}`).join('\n');
  const t0 = performance.now();
  const r = merge3(big, big.replace('línea 10\n', 'línea diez\n'), big.replace('línea 4000\n', 'línea cuatro mil\n'));
  assert.equal(r.conflict, false);
  assert.ok(r.text.includes('línea diez') && r.text.includes('línea cuatro mil'));
  assert.ok(performance.now() - t0 < 500);
});
