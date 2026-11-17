import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, outline, wordCount } from '../public/js/markdown.js';

test('a note\'s HTML never runs', () => {
  const html = render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('javascript: and data: links do not become links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'JaVaScRiPt:alert(1)']) {
    assert.ok(!render(`[x](${url})`).includes('<a'), url);
  }
  assert.match(render('[web](https://example.com)'), /<a class="external-link" href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">web<\/a>/);
});

test('quotes do not break attributes', () => {
  const html = render('[[a" onmouseover="x]]');
  assert.ok(!/onmouseover="/.test(html));
});

test('headings, formatting and wikilinks', () => {
  assert.equal(render('# Título'), '<h1>Título</h1>');
  assert.equal(render('**n** *c* ~~t~~ ==r== `c*d*`'), '<p><strong>n</strong> <em>c</em> <del>t</del> <mark>r</mark> <code>c*d*</code></p>');
  assert.equal(render('[[Another note|alias]]'), '<p><a class="internal-link" href="#" data-target="Another note">alias</a></p>');
});

test('nested lists and tasks', () => {
  assert.equal(render('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  assert.equal(render('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
  assert.match(render('- [x] done\n- [ ] to do'), /<li class="task done"><input type="checkbox" disabled checked><span class="task-text">done<\/span><\/li><li class="task"><input type="checkbox" disabled><span class="task-text">to do<\/span><\/li>/);
});

test('code blocks, quotes and rules', () => {
  assert.equal(render('```js\n<b>x</b>\n```'), '<pre><code class="language-js">&lt;b&gt;x&lt;/b&gt;</code></pre>');
  assert.equal(render('> quote'), '<blockquote><p>quote</p></blockquote>');
  assert.equal(render('---'), '<hr>');
});

test('the outline ignores # inside code', () => {
  const heads = outline('# One\n```\n# no\n```\n## Two **b**');
  assert.deepEqual(heads.map((h) => [h.level, h.text, h.line]), [[1, 'One', 0], [2, 'Two b', 4]]);
});

test('word count', () => {
  assert.equal(wordCount('Hello, how is the día-a-día going'), 6);
  assert.equal(wordCount('   '), 0);
});

// --- Phase 1b: what a vault uses day to day ---
import { parseFrontmatter } from '../public/js/markdown.js';

test('frontmatter: keys, lists and booleans', () => {
  const md = '---\ndate: 2026-11-11\ntype: meeting\ntags:\n  - daily\n  - "1on1"\naliases: [one, two]\ndone: true\narea:\n---\n# Título';
  const { data, body, lines } = parseFrontmatter(md);
  assert.deepEqual(data, { date: '2026-11-11', type: 'meeting', tags: ['daily', '1on1'], aliases: ['one', 'two'], done: true, area: null });
  assert.equal(body, '# Título');
  assert.equal(lines, 10);
  assert.equal(parseFrontmatter('no frontmatter').data, null);
});

test('frontmatter shows as properties, not as text', () => {
  const html = render('---\ntype: note\ntags: [a, b]\n---\nHello', { frontmatter: true });
  assert.match(html, /<dl class="properties"/);
  assert.match(html, /<dt>type<\/dt><dd>note<\/dd>/);
  assert.match(html, /<span class="tag" data-tag="a">#a<\/span> <span class="tag" data-tag="b">#b<\/span>/);
  assert.ok(!html.includes('---'));
  assert.ok(!render('---\nx: <script>\n---', { frontmatter: true }).includes('<script'));
});

test('the outline ignores the frontmatter and keeps the line numbers', () => {
  const heads = outline('---\ntitle: x\n# no\n---\n# One');
  assert.deepEqual(heads.map((h) => [h.text, h.line]), [['One', 4]]);
});

test('tables with alignment, empty cells and escaped |', () => {
  const html = render('| Time | Activity | Área |\n|:-----|:---------:|-----:|\n| 9:00 | **Review** a\\|b | IAC |\n| | | |');
  assert.match(html, /<div class="table-wrap"><table><thead><tr><th class="align-left">Time<\/th><th class="align-center">Activity<\/th><th class="align-right">Área<\/th><\/tr><\/thead>/);
  assert.match(html, /<td class="align-center"><strong>Review<\/strong> a\|b<\/td>/);
  assert.match(html, /<tr><td class="align-left"><\/td><td class="align-center"><\/td><td class="align-right"><\/td><\/tr>/);
});

test('a table ends the previous paragraph and a lone | is not a table', () => {
  assert.match(render('Intro\n| a | b |\n|---|---|\n| 1 | 2 |'), /^<p>Intro<\/p>\n<div class="table-wrap">/);
  assert.equal(render('a | b'), '<p>a | b</p>');
});

test('callouts, foldable ones and plain quotes', () => {
  const html = render('> [!warning] Careful\n> Text with **bold**');
  assert.equal(html, '<div class="callout" data-callout="warning"><div class="callout-title"><span class="callout-icon" aria-hidden="true"></span><span>Careful</span></div><div class="callout-content"><p>Text with <strong>bold</strong></p></div></div>');
  assert.match(render('> [!abstract]\n> x'), /data-callout="abstract".*<span>Abstract<\/span>/);
  assert.match(render('> [!faq]- Question\n> x'), /^<details class="callout" data-callout="question"><summary/);
  assert.match(render('> [!tip]+ Open\n> x'), /<details class="callout" data-callout="tip" open>/);
  assert.match(render('> [!odd"onclick=x] t'), /^<blockquote>/);
  assert.equal(render('> quote'), '<blockquote><p>quote</p></blockquote>');
});

test('tags in the text, without mistaking headings, anchors or apostrophes', () => {
  assert.match(render('- [ ] #ask/iac review'), /<span class="tag" data-tag="ask\/iac">#ask\/iac<\/span> review<\/span>/);
  assert.equal(render("it's #1"), '<p>it&#39;s #1</p>');
  assert.match(render('[web](https://x.com/#a) #ok'), /href="https:\/\/x.com\/#a".*<span class="tag" data-tag="ok">/);
  assert.equal(render('# Título'), '<h1>Título</h1>');
});

test('nested lists with 4 spaces or tabs', () => {
  const four = render('- A\n    - a1\n    - a2\n- B\n\t- b1');
  assert.equal(four, '<ul><li>A<ul><li>a1</li><li>a2</li></ul></li><li>B<ul><li>b1</li></ul></li></ul>');
  assert.equal(render('- a\n      - b\n  - c\n- d'), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
});

test('![[attachment]] leaves a safe placeholder for the image or PDF', () => {
  const html = render('![[house photo.png]] and ![[plan.pdf|300]] and ![[Another note]] ![[x" onerror="alert(1).png]]');
  assert.ok(html.includes('<span class="embed" data-embed="house photo.png">house photo.png</span>'), html);
  assert.ok(html.includes('data-embed="plan.pdf" data-width="300"'), html);
  assert.ok(html.includes('class="internal-link" href="#" data-target="Another note"'), html);
  assert.ok(!html.includes('" onerror="'), html);
});

test('![[drawing.sketch]] leaves a placeholder for the drawing', () => {
  assert.ok(render('![[plan.sketch]]').includes('<span class="embed" data-embed="plan.sketch">'));
});
