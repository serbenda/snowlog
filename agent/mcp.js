#!/usr/bin/env node
// Snowlog MCP server (JSON-RPC 2.0 over stdio, no dependencies).
//
//   node agent/mcp.js --dir ~/path/to/the/snowlog-notes/clone [--remote origin] [--branch main]
//
// It decrypts and encrypts locally with the app's modules. The passphrase is asked for with a system
// dialog (or SNOWLOG_ASKPASS) the first time it is needed; no tool receives or returns it.
// Only protocol messages go to stdout; notices go to stderr and never include note
// text.

import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { GitDirRepo } from './gitdir.js';
import { Session, SessionError } from './session.js';
import { askPassphrase } from './askpass.js';
import * as ops from './ops.js';

const VERSION = '0.1.0';
const PROTOCOL = '2025-06-18';

const INSTRUCTIONS = `Snowlog notes vault (encrypted Markdown; seen here already decrypted).
- Notes are named by their path without extension: “Folder/Note”. The name alone also works if it is unique.
- Link with [[Note]], [[Folder/Note]], [[Note#Section]] or [[Note|text]]. Tags: #tag or tags in the frontmatter.
- To add to an existing note use append_note (with heading for a section) instead of rewriting it whole.
- Every write is a commit in the notes repository; group changes into few calls.
- If the vault is locked, the first tool that needs it asks the user for the passphrase in a system dialog. Never ask for the passphrase in the chat.`;

const str = (description) => ({ type: 'string', description });
const tools = [
  {
    name: 'vault_status', fn: ops.status,
    description: 'Vault status: whether it is unlocked, the number of notes and folders, and the daily and templates folders. Does not ask for the passphrase.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'unlock', fn: ops.unlock,
    description: 'Unlocks the vault: shows the user a system dialog to type the passphrase. The passphrase never reaches this tool.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lock', fn: ops.lock,
    description: 'Locks the vault and wipes the key and the decrypted notes from memory.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_notes', fn: ops.listNotes,
    description: 'Lists notes and folders, optionally inside a folder.',
    inputSchema: { type: 'object', properties: { folder: str('Folder, e.g. “Projects”. Empty = the whole vault.'), recursive: { type: 'boolean', description: 'Include subfolders (yes by default).' } } },
  },
  {
    name: 'read_note', fn: ops.readNote,
    description: 'Reads a note (Markdown with its frontmatter).',
    inputSchema: { type: 'object', properties: { path: str('Path or name of the note, without .md.') }, required: ['path'] },
  },
  {
    name: 'search', fn: ops.search,
    description: 'Full-text search, ignoring case and accents. Syntax: words (all of them), "exact phrase", -exclude, tag:#tag, path:Folder.',
    inputSchema: { type: 'object', properties: { query: str('Query.'), limit: { type: 'integer', description: 'Maximum number of notes (20 by default).' } }, required: ['query'] },
  },
  {
    name: 'list_tags', fn: ops.listTags,
    description: 'Tags in the vault with the number of notes that use them.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'links', fn: ops.links,
    description: 'Outgoing [[…]] links of a note, with the note they point to, or null if it does not exist.',
    inputSchema: { type: 'object', properties: { path: str('Path or name of the note.') }, required: ['path'] },
  },
  {
    name: 'backlinks', fn: ops.backlinks,
    description: 'Notes that link to this note (backlinks), with the lines where they link to it.',
    inputSchema: { type: 'object', properties: { path: str('Path or name of the note.') }, required: ['path'] },
  },
  {
    name: 'create_note', fn: ops.createNote,
    description: 'Creates a new note. With template, it starts from that template ({{title}}, {{date}}…) and appends text after it.',
    inputSchema: { type: 'object', properties: { path: str('Path of the new note, e.g. “Projects/Idea”.'), text: str('Markdown content.'), template: str('Template (path, or name inside the templates folder).') }, required: ['path'] },
  },
  {
    name: 'write_note', fn: ops.writeNote,
    description: 'Replaces the whole content of a note. If it changed on another device, the changes are combined or a copy is saved.',
    inputSchema: { type: 'object', properties: { path: str('Path or name of the note.'), text: str('The complete new content.'), create: { type: 'boolean', description: 'Create it if it does not exist.' } }, required: ['path', 'text'] },
  },
  {
    name: 'append_note', fn: ops.appendNote,
    description: 'Appends text at the end of a note, or at the end of a section if heading is given.',
    inputSchema: { type: 'object', properties: { path: str('Path or name of the note.'), text: str('Markdown text to append.'), heading: str('Heading of the section, without #.'), create: { type: 'boolean', description: 'Create it if it does not exist (without heading).' } }, required: ['path', 'text'] },
  },
  {
    name: 'daily_note', fn: ops.dailyNote,
    description: 'Daily note (daily folder, YYYY-MM-DD). Returns its text; if it does not exist, creates it from the daily template.',
    inputSchema: { type: 'object', properties: { date: str('Date YYYY-MM-DD (today by default).'), create: { type: 'boolean', description: 'Create it if it does not exist (yes by default).' } } },
  },
];
const byName = new Map(tools.map((t) => [t.name, t]));

function parseArgs(argv) {
  const o = { dir: process.env.SNOWLOG_VAULT_DIR, remote: 'origin', branch: 'main' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--remote') o.remote = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--no-remote') o.remote = null;
  }
  if (!o.dir) throw new Error('Missing --dir (or SNOWLOG_VAULT_DIR) with the clone of the notes repository.');
  o.dir = resolve(o.dir.replace(/^~(?=\/|$)/, homedir()));
  return o;
}

export function createServer(session, write) {
  let queue = Promise.resolve();
  const reply = (id, result) => write({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

  async function call(name, args) {
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    try {
      const result = await tool.fn(session, args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      // Only our own messages (no note text or secrets); anything else, generic.
      const msg = e instanceof SessionError ? e.message : `Error working with the vault (${e.status ?? e.code ?? e.name}).`;
      if (!(e instanceof SessionError)) process.stderr.write(`snowlog-mcp: ${name}: ${e.name} ${e.status ?? ''}\n`);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }

  return function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg && msg.id != null && !('result' in msg) && !('error' in msg)) fail(msg.id, -32600, 'Invalid Request');
      return queue;
    }
    const { id, method, params } = msg;
    const isRequest = id != null;
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'snowlog', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    } else if (method === 'ping') {
      if (isRequest) reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    } else if (method === 'tools/call') {
      // One at a time: each write starts from the index the previous one left.
      queue = queue.then(() => call(params?.name, params?.arguments)).then((r) => reply(id, r));
    } else if (method.startsWith('notifications/')) {
      // initialized, cancelled…: nothing to do
    } else if (isRequest) {
      fail(id, -32601, `Method not found: ${method}`);
    }
    return queue;
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const repo = new GitDirRepo({ dir: o.dir, remote: o.remote, branch: o.branch });
  const session = new Session({ repo, askPassphrase });
  const handle = createServer(session, (m) => process.stdout.write(`${JSON.stringify(m)}\n`));
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    handle(msg);
  });
  rl.on('close', () => {
    session.lock('exit');
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/agent/mcp.js')) {
  main().catch((e) => {
    process.stderr.write(`snowlog-mcp: ${e.message}\n`);
    process.exit(1);
  });
}
