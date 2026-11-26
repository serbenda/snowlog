// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteLinks, linkChanges } from '../public/js/links.js';

const one = (from, to, byName = true) => [{ from, to, byName }];

test('links by name and by path, with alias, section and embeds', () => {
  const text = [
    'See [[Renovation]] and [[Projects/House/Renovation|the renovation]].',
    'Section: [[Renovation#Budget]] · image ![[Renovation]]',
    'Other: [[Renovations]] and [[Projects/House/Other]]',
  ].join('\n');
  const out = rewriteLinks(text, one('Projects/House/Renovation', 'Projects/Home/Kitchen renovation'));
  assert.equal(out, [
    'See [[Kitchen renovation]] and [[Projects/Home/Kitchen renovation|the renovation]].',
    'Section: [[Kitchen renovation#Budget]] · image ![[Kitchen renovation]]',
    'Other: [[Renovations]] and [[Projects/House/Other]]',
  ].join('\n'));
});

test('case does not matter, and no change returns null', () => {
  assert.equal(rewriteLinks('[[renovation]]', one('Renovation', 'Works')), '[[Works]]');
  assert.equal(rewriteLinks('Nothing to do with [[Other]]', one('Renovation', 'Works')), null);
  assert.equal(rewriteLinks('no links', one('Renovation', 'Works')), null);
});

test('does not touch code', () => {
  const text = 'Write `[[Renovation]]` like this\n```\n[[Renovation]]\n```\n> ```\n> [[Renovation]]\n> ```\n[[Renovation]]';
  assert.equal(rewriteLinks(text, one('Renovation', 'Works')),
    'Write `[[Renovation]]` like this\n```\n[[Renovation]]\n```\n> ```\n> [[Renovation]]\n> ```\n[[Works]]');
});

test('moving to another folder without renaming only changes links with a path', () => {
  const text = '[[Renovation]] · [[House/Renovation]]';
  assert.equal(rewriteLinks(text, one('House/Renovation', 'Home/Renovation')), '[[Renovation]] · [[Home/Renovation]]');
});

test('repeated names: no guessing, and the full path is used when needed', () => {
  const all = ['A/Notes', 'B/Notes', 'C/Plan', 'D/Idea'];
  const [ambiguous] = linkChanges([{ from: 'A/Notes', to: 'A/Jottings' }], all);
  assert.equal(ambiguous.byName, false);
  assert.equal(rewriteLinks('[[Notes]] [[A/Notes]]', [ambiguous]), '[[Notes]] [[A/Jottings]]');
  const [clash] = linkChanges([{ from: 'C/Plan', to: 'C/Idea' }], all);
  assert.equal(clash.byName, true);
  assert.equal(clash.toName, 'C/Idea');
  assert.equal(rewriteLinks('[[Plan]]', [clash]), '[[C/Idea]]');
});

test('renaming a folder: several notes at once', () => {
  const all = ['House/Renovation', 'House/Jardín', 'Home'];
  const changes = linkChanges([{ from: 'House/Renovation', to: 'Home2/Renovation' }, { from: 'House/Jardín', to: 'Home2/Jardín' }], all);
  assert.equal(rewriteLinks('[[House/Renovation]] [[House/Jardín|garden]] [[Renovation]]', changes),
    '[[Home2/Renovation]] [[Home2/Jardín|garden]] [[Renovation]]');
});
