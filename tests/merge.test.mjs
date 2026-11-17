import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3 } from '../public/js/merge.js';

const base = ['# List', '- milk', '- bread', '', '## Notes', 'nothing yet', 'end'].join('\n');

test('changes in different places are combined', () => {
  const mine = base.replace('- bread', '- wholemeal bread');
  const theirs = base.replace('nothing yet', 'call the plumber');
  assert.deepEqual(merge3(base, mine, theirs), { text: base.replace('- bread', '- wholemeal bread').replace('nothing yet', 'call the plumber'), conflict: false });
});

test('if only one side changed, it wins; if both changed the same way, too', () => {
  const mine = base.replace('end', 'END');
  assert.equal(merge3(base, mine, base).text, mine);
  assert.equal(merge3(base, base, mine).text, mine);
  assert.equal(merge3(base, mine, mine).text, mine);
});

test('adding lines at the same place from both sides: both stay', () => {
  const mine = `${base}\n- 10:00 written on the laptop`;
  const theirs = `${base}\n- 10:05 written on the phone`;
  const r = merge3(base, mine, theirs);
  assert.equal(r.conflict, false);
  assert.ok(r.text.endsWith('- 10:00 written on the laptop\n- 10:05 written on the phone'));
});

test('changing the same line differently is a clash', () => {
  const r = merge3(base, base.replace('- milk', '- lactose-free milk'), base.replace('- milk', '- oat milk'));
  assert.equal(r.conflict, true);
});

test('deleting a line on one side and changing it on the other is a clash', () => {
  assert.equal(merge3(base, base.replace('- bread\n', ''), base.replace('- bread', '- rye bread')).conflict, true);
});

test('deletions and additions in different places', () => {
  const mine = base.replace('- milk\n', '');
  const theirs = base.replace('## Notes', '## Notes\n- new idea');
  const r = merge3(base, mine, theirs);
  assert.equal(r.conflict, false);
  assert.equal(r.text, ['# List', '- bread', '', '## Notes', '- new idea', 'nothing yet', 'end'].join('\n'));
});

test('large notes: fast', () => {
  const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
  const t0 = performance.now();
  const r = merge3(big, big.replace('line 10\n', 'line ten\n'), big.replace('line 4000\n', 'line four thousand\n'));
  assert.equal(r.conflict, false);
  assert.ok(r.text.includes('line ten') && r.text.includes('line four thousand'));
  assert.ok(performance.now() - t0 < 500);
});
