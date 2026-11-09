// Renderizador de Markdown pequeño y seguro.
// Todo el texto se escapa ANTES de aplicar formato, así que ningún HTML de una nota
// llega a ejecutarse. Los enlaces solo admiten http(s), mailto y anclas.

export function escapeHtml(s) {
  return s
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

export function inline(raw) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = escapeHtml(raw);

  // Código en línea: su contenido no se formatea.
  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));

  // [[Nota]] y [[Nota|alias]]
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => keep(
    `<a class="internal-link" href="#" data-target="${target.trim()}">${(alias || target).trim()}</a>`,
  ));

  // [texto](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const ok = safeUrl(url);
    return ok ? keep(`<a class="external-link" href="${ok}" target="_blank" rel="noopener noreferrer">${text}</a>`) : text;
  });

  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function render(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
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
      out.push(`<blockquote>${render(quote.join('\n'))}</blockquote>`);
      continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const [, indent, marker, text] = lines[i].match(LIST_RE);
        items.push({ depth: Math.floor(indent.replace(/\t/g, '    ').length / 2), ordered: /\d/.test(marker), text });
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
    ) {
      para.push(inline(lines[i]));
      i += 1;
    }
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return out.join('\n');
}

function renderList(items) {
  let html = '';
  const stack = [];
  for (const item of items) {
    const depth = Math.min(item.depth, stack.length);
    while (stack.length > depth + 1) html += `</li></${stack.pop()}>`;
    if (stack.length === depth) {
      const tag = item.ordered ? 'ol' : 'ul';
      stack.push(tag);
      html += `<${tag}>`;
    } else {
      html += '</li>';
    }
    const task = item.text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      const done = task[1] !== ' ';
      html += `<li class="task${done ? ' done' : ''}"><input type="checkbox" disabled${done ? ' checked' : ''}> ${inline(task[2])}`;
    } else {
      html += `<li>${inline(item.text)}`;
    }
  }
  while (stack.length) html += `</li></${stack.pop()}>`;
  return html;
}

// Encabezados para el panel de esquema.
export function outline(md) {
  const heads = [];
  let inCode = false;
  md.split('\n').forEach((line, n) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) return;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) heads.push({ level: h[1].length, text: h[2].replace(/[*_`=~]/g, ''), line: n });
  });
  return heads;
}

export function wordCount(md) {
  const words = md.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}
