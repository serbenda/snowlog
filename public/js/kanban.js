// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Kanban boards saved as plain Markdown, readable in any editor:
//
//   ---
//   kanban-plugin: basic
//   ---
//
//   ## To do
//
//   - [ ] A card
//   - [ ] Another, with more text
//       that continues on indented lines
//
//   ## Done
//
//   - [x] Finished
//
// Each `## Title` is a column and each list item under it, a card. Whatever comes before
// the first column and a final `%% … %%` block are kept as they are. If nothing is touched,
// serialize(parse(text)) returns the same text.

import { parseFrontmatter } from './markdown.js';

const CARD_RE = /^([-*+])\s+(?:\[([ xX])\]\s+)?(.*)$/;

// Is it a board? By the `kanban-plugin` property (compatible) or `kanban: true`.
export function isBoard(text) {
  const fm = parseFrontmatter(text).data || {};
  return fm['kanban-plugin'] != null || fm.kanban === true || String(fm.kanban).toLowerCase() === 'true';
}

export function parseBoard(text) {
  const lines = text.split('\n');
  let i = 0;
  const pre = [];
  // Frontmatter and whatever comes before the first column.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      pre.push(...lines.slice(0, end + 1));
      i = end + 1;
    }
  }
  while (i < lines.length && !/^##\s/.test(lines[i])) pre.push(lines[i++]);
  // Final settings block (%% … %%), which other tools use: kept untouched.
  let postStart = lines.length;
  for (let j = lines.length - 1; j >= i; j--) {
    if (lines[j].trim() === '') continue;
    const last = lines[j].trim();
    if (last.endsWith('%%')) {
      // A single “%% … %%” line, or a block that starts on an earlier line with “%%”.
      let k = last.startsWith('%%') && last.length > 2 ? j : j - 1;
      while (k >= i && !lines[k].trim().startsWith('%%')) k--;
      if (k >= i) postStart = k;
    }
    break;
  }
  const lanes = [];
  let lane = null;
  let card = null;
  for (; i < postStart; i++) {
    const line = lines[i];
    const head = line.match(/^##\s+(.*)$/);
    if (head) {
      lane = { title: head[1].trim(), cards: [], extra: [] };
      lanes.push(lane);
      card = null;
      continue;
    }
    const m = line.match(CARD_RE);
    if (m) {
      card = { text: m[3], done: !!m[2] && m[2] !== ' ', task: m[2] != null, bullet: m[1], more: [] };
      lane.cards.push(card);
    } else if (card && /^\s+\S/.test(line)) {
      card.more.push(line);
    } else if (line.trim() === '') {
      card = null;
    } else {
      // Loose text inside the column (not a card): kept.
      lane.extra.push(line);
      card = null;
    }
  }
  return { pre, lanes, post: lines.slice(postStart) };
}

export function serializeBoard(board) {
  const out = [...board.pre];
  for (const lane of board.lanes) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push(`## ${lane.title}`, '');
    for (const line of lane.extra) out.push(line);
    if (lane.extra.length) out.push('');
    for (const c of lane.cards) {
      out.push(`${c.bullet || '-'} ${c.task === false ? '' : `[${c.done ? 'x' : ' '}] `}${c.text}`);
      out.push(...c.more);
    }
    if (lane.cards.length) out.push('');
  }
  if (board.post.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push(...board.post);
  } else if (out[out.length - 1] !== '') {
    out.push('');
  }
  return out.join('\n');
}

// --- Changes (they return a new board; the original is not touched) ---
const clone = (b) => structuredClone(b);

export function moveCard(board, from, to) {
  const b = clone(board);
  const [card] = b.lanes[from.lane].cards.splice(from.index, 1);
  if (!card) return board;
  let index = to.index;
  if (from.lane === to.lane && from.index < to.index) index -= 1;
  b.lanes[to.lane].cards.splice(Math.max(0, Math.min(index, b.lanes[to.lane].cards.length)), 0, card);
  return b;
}

export function addCard(board, lane, text) {
  const b = clone(board);
  b.lanes[lane].cards.push({ text: text.replace(/\n/g, ' ').trim(), done: false, task: true, bullet: '-', more: [] });
  return b;
}

export function editCard(board, lane, index, text) {
  const b = clone(board);
  Object.assign(b.lanes[lane].cards[index], { text: text.replace(/\n/g, ' ').trim() });
  return b;
}

export function toggleCard(board, lane, index) {
  const b = clone(board);
  const c = b.lanes[lane].cards[index];
  c.done = !c.done;
  c.task = true;
  return b;
}

export function deleteCard(board, lane, index) {
  const b = clone(board);
  b.lanes[lane].cards.splice(index, 1);
  return b;
}

export function addLane(board, title) {
  const b = clone(board);
  b.lanes.push({ title: title.replace(/\n/g, ' ').trim(), cards: [], extra: [] });
  return b;
}

export function renameLane(board, lane, title) {
  const b = clone(board);
  b.lanes[lane].title = title.replace(/\n/g, ' ').trim();
  return b;
}

export function moveLane(board, from, to) {
  const b = clone(board);
  const [l] = b.lanes.splice(from, 1);
  b.lanes.splice(Math.max(0, Math.min(to, b.lanes.length)), 0, l);
  return b;
}

export function deleteLane(board, lane) {
  const b = clone(board);
  b.lanes.splice(lane, 1);
  return b;
}

export const NEW_BOARD = `---
kanban-plugin: basic
---

## To do

- [ ] First card

## In progress

## Done
`;
