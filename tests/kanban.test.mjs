import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/kanban.js';

const BOARD = `---
kanban-plugin: basic
---

Notas del tablero.

## Pendiente

- [ ] Diseñar la portada #web
- [ ] Revisar [[HU-02]]
    con una segunda línea

## En curso

- [x] Elegir colores

## Hecho

%% kanban:settings
{"kanban-plugin":"basic"}
%%`;

test('reconoce un tablero', () => {
  assert.ok(K.isBoard(BOARD));
  assert.ok(K.isBoard('---\nkanban: true\n---\n## A'));
  assert.ok(!K.isBoard('# Nota normal\n## A\n- [ ] x'));
});

test('lee columnas y tarjetas y conserva lo demás', () => {
  const b = K.parseBoard(BOARD);
  assert.deepEqual(b.lanes.map((l) => l.title), ['Pendiente', 'En curso', 'Hecho']);
  assert.deepEqual(b.lanes[0].cards.map((c) => c.text), ['Diseñar la portada #web', 'Revisar [[HU-02]]']);
  assert.deepEqual(b.lanes[0].cards[1].more, ['    con una segunda línea']);
  assert.equal(b.lanes[1].cards[0].done, true);
  assert.ok(b.pre.includes('Notas del tablero.'));
  assert.equal(b.post[0], '%% kanban:settings');
});

test('escribir lo leído no cambia el texto', () => {
  assert.equal(K.serializeBoard(K.parseBoard(BOARD)), BOARD);
  assert.equal(K.serializeBoard(K.parseBoard(K.NEW_BOARD)), K.NEW_BOARD);
});

test('mover, añadir, editar, marcar y borrar tarjetas y columnas', () => {
  let b = K.parseBoard(BOARD);
  b = K.moveCard(b, { lane: 0, index: 0 }, { lane: 2, index: 0 });
  assert.deepEqual(b.lanes[2].cards.map((c) => c.text), ['Diseñar la portada #web']);
  b = K.moveCard(b, { lane: 0, index: 0 }, { lane: 1, index: 1 });
  assert.deepEqual(b.lanes[1].cards.map((c) => c.text), ['Elegir colores', 'Revisar [[HU-02]]']);
  assert.deepEqual(b.lanes[1].cards[1].more, ['    con una segunda línea'], 'las líneas extra viajan con la tarjeta');
  b = K.moveCard(b, { lane: 1, index: 0 }, { lane: 1, index: 2 });
  assert.deepEqual(b.lanes[1].cards.map((c) => c.text), ['Revisar [[HU-02]]', 'Elegir colores']);
  b = K.addCard(b, 0, 'Nueva\ntarjeta');
  assert.equal(b.lanes[0].cards[0].text, 'Nueva tarjeta');
  b = K.editCard(b, 0, 0, 'Editada');
  b = K.toggleCard(b, 0, 0);
  assert.equal(b.lanes[0].cards[0].done, true);
  b = K.addLane(b, 'Bloqueado');
  b = K.moveLane(b, 3, 1);
  b = K.renameLane(b, 1, 'Bloqueos');
  b = K.deleteCard(b, 0, 0);
  const text = K.serializeBoard(b);
  const again = K.parseBoard(text);
  assert.deepEqual(again.lanes.map((l) => l.title), ['Pendiente', 'Bloqueos', 'En curso', 'Hecho']);
  assert.deepEqual(again.lanes[2].cards.map((c) => `${c.done ? 'x' : 'o'} ${c.text}`), ['o Revisar [[HU-02]]', 'x Elegir colores']);
  assert.ok(text.trimEnd().endsWith('%%'), 'el bloque final sigue al final');
  b = K.deleteLane(again, 1);
  assert.equal(b.lanes.length, 3);
  assert.equal(K.parseBoard(BOARD).lanes[0].cards.length, 2, 'el original no cambia');
});
