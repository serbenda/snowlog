import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, outline, wordCount } from '../public/js/markdown.js';

test('el HTML de una nota nunca se ejecuta', () => {
  const html = render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('enlaces javascript: y data: no se convierten en enlaces', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'JaVaScRiPt:alert(1)']) {
    assert.ok(!render(`[x](${url})`).includes('<a'), url);
  }
  assert.match(render('[web](https://example.com)'), /<a class="external-link" href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">web<\/a>/);
});

test('las comillas no rompen atributos', () => {
  const html = render('[[a" onmouseover="x]]');
  assert.ok(!/onmouseover="/.test(html));
});

test('encabezados, formato y wikilinks', () => {
  assert.equal(render('# Título'), '<h1>Título</h1>');
  assert.equal(render('**n** *c* ~~t~~ ==r== `c*d*`'), '<p><strong>n</strong> <em>c</em> <del>t</del> <mark>r</mark> <code>c*d*</code></p>');
  assert.equal(render('[[Otra nota|alias]]'), '<p><a class="internal-link" href="#" data-target="Otra nota">alias</a></p>');
});

test('listas anidadas y tareas', () => {
  assert.equal(render('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  assert.equal(render('1. uno\n2. dos'), '<ol><li>uno</li><li>dos</li></ol>');
  assert.match(render('- [x] hecho\n- [ ] pendiente'), /<li class="task done"><input type="checkbox" disabled checked> hecho<\/li><li class="task"><input type="checkbox" disabled> pendiente<\/li>/);
});

test('bloques de código, citas y separadores', () => {
  assert.equal(render('```js\n<b>x</b>\n```'), '<pre><code class="language-js">&lt;b&gt;x&lt;/b&gt;</code></pre>');
  assert.equal(render('> cita'), '<blockquote><p>cita</p></blockquote>');
  assert.equal(render('---'), '<hr>');
});

test('esquema ignora los # dentro de código', () => {
  const heads = outline('# Uno\n```\n# no\n```\n## Dos **b**');
  assert.deepEqual(heads.map((h) => [h.level, h.text, h.line]), [[1, 'Uno', 0], [2, 'Dos b', 4]]);
});

test('contador de palabras', () => {
  assert.equal(wordCount('Hola, qué tal está el día-a-día'), 6);
  assert.equal(wordCount('   '), 0);
});
