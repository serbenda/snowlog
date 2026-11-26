// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../public/js/kanban.js';

const BOARD = `---
kanban-plugin: basic
---

Board notes.

## To do

- [ ] Design the front page #web
- [ ] Review [[US-02]]
    with a second line

## In progress

- [x] Pick colors

## Done

%% kanban:settings
{"kanban-plugin":"basic"}
%%`;

test('recognizes a board', () => {
  assert.ok(K.isBoard(BOARD));
  assert.ok(K.isBoard('---\nkanban: true\n---\n## A'));
  assert.ok(!K.isBoard('# Plain note\n## A\n- [ ] x'));
});

test('reads columns and cards and keeps the rest', () => {
  const b = K.parseBoard(BOARD);
  assert.deepEqual(b.lanes.map((l) => l.title), ['To do', 'In progress', 'Done']);
  assert.deepEqual(b.lanes[0].cards.map((c) => c.text), ['Design the front page #web', 'Review [[US-02]]']);
  assert.deepEqual(b.lanes[0].cards[1].more, ['    with a second line']);
  assert.equal(b.lanes[1].cards[0].done, true);
  assert.ok(b.pre.includes('Board notes.'));
  assert.equal(b.post[0], '%% kanban:settings');
});

test('writing what was read does not change the text', () => {
  assert.equal(K.serializeBoard(K.parseBoard(BOARD)), BOARD);
  assert.equal(K.serializeBoard(K.parseBoard(K.NEW_BOARD)), K.NEW_BOARD);
});

test('move, add, edit, tick and delete cards and columns', () => {
  let b = K.parseBoard(BOARD);
  b = K.moveCard(b, { lane: 0, index: 0 }, { lane: 2, index: 0 });
  assert.deepEqual(b.lanes[2].cards.map((c) => c.text), ['Design the front page #web']);
  b = K.moveCard(b, { lane: 0, index: 0 }, { lane: 1, index: 1 });
  assert.deepEqual(b.lanes[1].cards.map((c) => c.text), ['Pick colors', 'Review [[US-02]]']);
  assert.deepEqual(b.lanes[1].cards[1].more, ['    with a second line'], 'the extra lines travel with the card');
  b = K.moveCard(b, { lane: 1, index: 0 }, { lane: 1, index: 2 });
  assert.deepEqual(b.lanes[1].cards.map((c) => c.text), ['Review [[US-02]]', 'Pick colors']);
  b = K.addCard(b, 0, 'New\ncard');
  assert.equal(b.lanes[0].cards[0].text, 'New card');
  b = K.editCard(b, 0, 0, 'Edited');
  b = K.toggleCard(b, 0, 0);
  assert.equal(b.lanes[0].cards[0].done, true);
  b = K.addLane(b, 'Blocked');
  b = K.moveLane(b, 3, 1);
  b = K.renameLane(b, 1, 'Blockers');
  b = K.deleteCard(b, 0, 0);
  const text = K.serializeBoard(b);
  const again = K.parseBoard(text);
  assert.deepEqual(again.lanes.map((l) => l.title), ['To do', 'Blockers', 'In progress', 'Done']);
  assert.deepEqual(again.lanes[2].cards.map((c) => `${c.done ? 'x' : 'o'} ${c.text}`), ['o Review [[US-02]]', 'x Pick colors']);
  assert.ok(text.trimEnd().endsWith('%%'), 'the final block stays at the end');
  b = K.deleteLane(again, 1);
  assert.equal(b.lanes.length, 3);
  assert.equal(K.parseBoard(BOARD).lanes[0].cards.length, 2, 'the original does not change');
});
