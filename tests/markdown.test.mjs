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
  assert.match(render('- [x] hecho\n- [ ] pendiente'), /<li class="task done"><input type="checkbox" disabled checked><span class="task-text">hecho<\/span><\/li><li class="task"><input type="checkbox" disabled><span class="task-text">pendiente<\/span><\/li>/);
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

// --- Fase 1b: lo que se usa a diario en una bóveda de Obsidian ---
import { parseFrontmatter } from '../public/js/markdown.js';

test('frontmatter: claves, listas y booleanos', () => {
  const md = '---\ndate: 2026-11-11\ntype: meeting\ntags:\n  - daily\n  - "1on1"\naliases: [uno, dos]\ndone: true\narea:\n---\n# Título';
  const { data, body, lines } = parseFrontmatter(md);
  assert.deepEqual(data, { date: '2026-11-11', type: 'meeting', tags: ['daily', '1on1'], aliases: ['uno', 'dos'], done: true, area: null });
  assert.equal(body, '# Título');
  assert.equal(lines, 10);
  assert.equal(parseFrontmatter('sin frontmatter').data, null);
});

test('frontmatter se muestra como propiedades y no como texto', () => {
  const html = render('---\ntype: note\ntags: [a, b]\n---\nHola', { frontmatter: true });
  assert.match(html, /<dl class="properties"/);
  assert.match(html, /<dt>type<\/dt><dd>note<\/dd>/);
  assert.match(html, /<span class="tag" data-tag="a">#a<\/span> <span class="tag" data-tag="b">#b<\/span>/);
  assert.ok(!html.includes('---'));
  assert.ok(!render('---\nx: <script>\n---', { frontmatter: true }).includes('<script'));
});

test('el esquema ignora el frontmatter y conserva los números de línea', () => {
  const heads = outline('---\ntitle: x\n# no\n---\n# Uno');
  assert.deepEqual(heads.map((h) => [h.text, h.line]), [['Uno', 4]]);
});

test('tablas con alineación, celdas vacías y | escapado', () => {
  const html = render('| Hora | Actividad | Área |\n|:-----|:---------:|-----:|\n| 9:00 | **Revisión** a\\|b | IAC |\n| | | |');
  assert.match(html, /<div class="table-wrap"><table><thead><tr><th class="align-left">Hora<\/th><th class="align-center">Actividad<\/th><th class="align-right">Área<\/th><\/tr><\/thead>/);
  assert.match(html, /<td class="align-center"><strong>Revisión<\/strong> a\|b<\/td>/);
  assert.match(html, /<tr><td class="align-left"><\/td><td class="align-center"><\/td><td class="align-right"><\/td><\/tr>/);
});

test('una tabla corta el párrafo anterior y un | suelto no es tabla', () => {
  assert.match(render('Intro\n| a | b |\n|---|---|\n| 1 | 2 |'), /^<p>Intro<\/p>\n<div class="table-wrap">/);
  assert.equal(render('a | b'), '<p>a | b</p>');
});

test('callouts, plegables y citas normales', () => {
  const html = render('> [!warning] Cuidado\n> Texto con **negrita**');
  assert.equal(html, '<div class="callout" data-callout="warning"><div class="callout-title"><span class="callout-icon" aria-hidden="true"></span><span>Cuidado</span></div><div class="callout-content"><p>Texto con <strong>negrita</strong></p></div></div>');
  assert.match(render('> [!abstract]\n> x'), /data-callout="abstract".*<span>Abstract<\/span>/);
  assert.match(render('> [!faq]- Pregunta\n> x'), /^<details class="callout" data-callout="question"><summary/);
  assert.match(render('> [!tip]+ Abierto\n> x'), /<details class="callout" data-callout="tip" open>/);
  assert.match(render('> [!raro"onclick=x] t'), /^<blockquote>/);
  assert.equal(render('> cita'), '<blockquote><p>cita</p></blockquote>');
});

test('etiquetas en el texto, sin confundir encabezados, anclas ni apóstrofos', () => {
  assert.match(render('- [ ] #ask/iac revisar'), /<span class="tag" data-tag="ask\/iac">#ask\/iac<\/span> revisar<\/span>/);
  assert.equal(render("it's #1"), '<p>it&#39;s #1</p>');
  assert.match(render('[web](https://x.com/#a) #ok'), /href="https:\/\/x.com\/#a".*<span class="tag" data-tag="ok">/);
  assert.equal(render('# Título'), '<h1>Título</h1>');
});

test('listas anidadas con 4 espacios o tabuladores', () => {
  const four = render('- A\n    - a1\n    - a2\n- B\n\t- b1');
  assert.equal(four, '<ul><li>A<ul><li>a1</li><li>a2</li></ul></li><li>B<ul><li>b1</li></ul></li></ul>');
  assert.equal(render('- a\n      - b\n  - c\n- d'), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
});

test('![[adjunto]] deja un hueco seguro para la imagen o el PDF', () => {
  const html = render('![[foto de casa.png]] y ![[plano.pdf|300]] y ![[Otra nota]] ![[x" onerror="alert(1).png]]');
  assert.ok(html.includes('<span class="embed" data-embed="foto de casa.png">foto de casa.png</span>'), html);
  assert.ok(html.includes('data-embed="plano.pdf" data-width="300"'), html);
  assert.ok(html.includes('class="internal-link" href="#" data-target="Otra nota"'), html);
  assert.ok(!html.includes('" onerror="'), html);
});
