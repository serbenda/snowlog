// Renderizador de Markdown pequeño y seguro.
// Todo el texto se escapa ANTES de aplicar formato, así que ningún HTML de una nota
// llega a ejecutarse. Los enlaces solo admiten http(s), mailto y anclas.
//
// Soporta lo que se usa a diario en una bóveda de Obsidian: frontmatter (propiedades),
// tablas, callouts (> [!info]), tareas, etiquetas #tag y enlaces [[nota]].

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|#)/i.test(u) ? u : null;
}

const EMBED_RE = /\.(png|jpe?g|gif|webp|avif|bmp|pdf)$/i;
const TAG_RE = /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;

export function inline(raw) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = escapeHtml(raw);

  // Código en línea: su contenido no se formatea.
  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));

  // ![[foto.png]] y ![[foto.png|300]]: hueco que la app rellena con el adjunto descifrado.
  s = s.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, target, alias) => {
    const name = target.trim();
    if (!EMBED_RE.test(name)) return m.slice(1);
    const width = /^\d{1,4}$/.test((alias || '').trim()) ? ` data-width="${alias.trim()}"` : '';
    return keep(`<span class="embed" data-embed="${name}"${width}>${name}</span>`);
  });

  // [[Nota]] y [[Nota|alias]]
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => keep(
    `<a class="internal-link" href="#" data-target="${target.trim()}">${(alias || target).trim()}</a>`,
  ));

  // [texto](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const ok = safeUrl(url);
    return ok ? keep(`<a class="external-link" href="${ok}" target="_blank" rel="noopener noreferrer">${text}</a>`) : text;
  });

  // #etiqueta (no confunde &#39; ni los # de los encabezados, que llevan espacio)
  s = s.replace(TAG_RE, (_, pre, tag) => `${pre}${keep(`<span class="tag" data-tag="${tag}">#${tag}</span>`)}`);

  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

// ---------------------------------------------------------------------------
// Frontmatter (propiedades): un YAML sencillo entre dos líneas "---" al principio.
// Se entiende lo que usa Obsidian: clave: valor, listas con "- " y listas [a, b].

function yamlScalar(v) {
  const t = v.trim();
  if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1);
  if (t === 'true' || t === 'false') return t === 'true';
  if (t === '' || t === 'null' || t === '~') return null;
  return t;
}

export function parseFrontmatter(md) {
  const text = md.replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { data: null, body: text, lines: 0 };
  const data = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = line.match(/^\s+-\s*(.*)$/) || line.match(/^-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = data[key] == null ? [] : [data[key]];
      const v = yamlScalar(item[1]);
      if (v != null) data[key].push(v);
      continue;
    }
    const kv = line.match(/^([^:\s][^:]*):(?:\s+(.*)|\s*)$/);
    if (!kv) continue;
    key = kv[1].trim();
    const raw = (kv[2] || '').trim();
    if (/^\[.*\]$/.test(raw)) {
      data[key] = raw.slice(1, -1).split(',').map(yamlScalar).filter((v) => v != null);
    } else {
      data[key] = yamlScalar(raw);
    }
  }
  return { data, body: text.slice(m[0].length), lines: m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0) };
}

function renderProperties(data) {
  const tagChip = (t) => {
    const name = escapeHtml(String(t).replace(/^#/, ''));
    return `<span class="tag" data-tag="${name}">#${name}</span>`;
  };
  const rows = Object.entries(data).map(([k, v]) => {
    let value;
    const isTags = /^tags?$/i.test(k);
    if (isTags && typeof v === 'string') v = v.split(/[\s,]+/).filter(Boolean);
    if (Array.isArray(v)) {
      value = v.length
        ? v.map((x) => (isTags ? tagChip(x) : `<span class="pill">${inline(String(x))}</span>`)).join(' ')
        : '<span class="empty-value">vacío</span>';
    } else if (typeof v === 'boolean') {
      value = `<input type="checkbox" disabled${v ? ' checked' : ''} aria-label="${v ? 'sí' : 'no'}">`;
    } else if (v == null) {
      value = '<span class="empty-value">vacío</span>';
    } else {
      value = inline(String(v));
    }
    return `<div class="property"><dt>${escapeHtml(k)}</dt><dd>${value}</dd></div>`;
  });
  return `<dl class="properties" aria-label="Propiedades">${rows.join('')}</dl>`;
}

// ---------------------------------------------------------------------------
// Tablas

const SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const isTableStart = (lines, i) => i + 1 < lines.length
  && lines[i].includes('|')
  && SEP_RE.test(lines[i + 1])
  && lines[i + 1].includes('-')
  && (lines[i + 1].includes('|') || lines[i].trim().startsWith('|'));

function renderTable(lines, start) {
  const head = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  let i = start + 2;
  const rows = [];
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }
  const cell = (tag, text, c) => `<${tag}${aligns[c] ? ` class="align-${aligns[c]}"` : ''}>${inline(text || '')}</${tag}>`;
  const html = '<div class="table-wrap"><table>'
    + `<thead><tr>${head.map((t, c) => cell('th', t, c)).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${head.map((_, c) => cell('td', r[c], c)).join('')}</tr>`).join('')}</tbody>`
    + '</table></div>';
  return { html, next: i };
}

// ---------------------------------------------------------------------------
// Callouts: > [!tipo]+/- Título opcional

const CALLOUT_KIND = {
  note: 'note',
  abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
  info: 'info', todo: 'info',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger', error: 'danger', bug: 'danger',
  example: 'example',
  quote: 'quote', cite: 'quote',
};

function renderQuote(quoteLines) {
  const head = quoteLines[0].match(/^\[!([\w-]+)\]([+-]?)\s*(.*)$/);
  if (!head) return `<blockquote>${render(quoteLines.join('\n'))}</blockquote>`;
  const type = head[1].toLowerCase();
  const kind = CALLOUT_KIND[type] || 'note';
  const title = head[3].trim() || type.charAt(0).toUpperCase() + type.slice(1);
  const body = quoteLines.slice(1).join('\n');
  const content = body.trim() ? `<div class="callout-content">${render(body)}</div>` : '';
  const titleHtml = `<span class="callout-icon" aria-hidden="true"></span><span>${inline(title)}</span>`;
  if (head[2]) {
    return `<details class="callout" data-callout="${kind}"${head[2] === '+' ? ' open' : ''}>`
      + `<summary class="callout-title">${titleHtml}</summary>${content}</details>`;
  }
  return `<div class="callout" data-callout="${kind}"><div class="callout-title">${titleHtml}</div>${content}</div>`;
}

// ---------------------------------------------------------------------------

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function render(md, { frontmatter = false } = {}) {
  let text = md.replace(/\r\n?/g, '\n');
  const out = [];
  if (frontmatter) {
    const fm = parseFrontmatter(text);
    if (fm.data && Object.keys(fm.data).length) out.push(renderProperties(fm.data));
    text = fm.body;
  }
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bloque de código
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(renderQuote(quote));
      continue;
    }

    if (isTableStart(lines, i)) {
      const t = renderTable(lines, i);
      out.push(t.html);
      i = t.next;
      continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const [, indent, marker, itemText] = lines[i].match(LIST_RE);
        items.push({ indent: indent.replace(/\t/g, '    ').length, ordered: /\d/.test(marker), text: itemText });
        i += 1;
      }
      out.push(renderList(items));
      continue;
    }

    const para = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^\s*(```|~~~)/.test(lines[i])
      && !/^\s*>/.test(lines[i])
      && !LIST_RE.test(lines[i])
      && !isTableStart(lines, i)
    ) {
      para.push(inline(lines[i]));
      i += 1;
    }
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('\n');
}

function renderList(items) {
  // Los niveles salen de la sangría real: da igual usar 2, 4 espacios o tabuladores.
  let html = '';
  const stack = []; // [{ tag, indent }]
  for (const item of items) {
    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) {
      // Sangría intermedia: sigue en el mismo nivel en vez de abrir otra lista.
      if (item.indent > stack[stack.length - 2].indent) {
        stack[stack.length - 1].indent = item.indent;
        break;
      }
      html += `</li></${stack.pop().tag}>`;
    }
    const top = stack[stack.length - 1];
    if (!top || item.indent > top.indent) {
      const tag = item.ordered ? 'ol' : 'ul';
      stack.push({ tag, indent: item.indent });
      html += `<${tag}>`;
    } else {
      html += '</li>';
    }
    const task = item.text.match(/^\[([ xX])\]\s*(.*)$/);
    if (task) {
      const done = task[1] !== ' ';
      html += `<li class="task${done ? ' done' : ''}"><input type="checkbox" disabled${done ? ' checked' : ''}><span class="task-text">${inline(task[2])}</span>`;
    } else {
      html += `<li>${inline(item.text)}`;
    }
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

// Encabezados para el panel de esquema (los números de línea son del texto completo).
export function outline(md) {
  const text = md.replace(/\r\n?/g, '\n');
  const skip = parseFrontmatter(text).lines;
  const heads = [];
  let inCode = false;
  text.split('\n').forEach((line, n) => {
    if (n < skip) return;
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) return;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) heads.push({ level: h[1].length, text: h[2].replace(/[*_`=~]/g, ''), line: n });
  });
  return heads;
}

export function wordCount(md) {
  const words = parseFrontmatter(md).body.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}
