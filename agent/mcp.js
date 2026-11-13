#!/usr/bin/env node
// Servidor MCP de Snowlog (JSON-RPC 2.0 por stdio, sin dependencias).
//
//   node agent/mcp.js --dir ~/ruta/al/clon/de/snowlog-notes [--remote origin] [--branch main]
//
// Descifra y cifra en local con los módulos de la app. La frase de paso se pide con un diálogo del
// sistema (o SNOWLOG_ASKPASS) la primera vez que hace falta; ninguna herramienta la recibe ni la
// devuelve. Por stdout solo van mensajes del protocolo; los avisos van por stderr y nunca llevan
// texto de las notas.

import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { GitDirRepo } from './gitdir.js';
import { Session, SessionError } from './session.js';
import { askPassphrase } from './askpass.js';
import * as ops from './ops.js';

const VERSION = '0.1.0';
const PROTOCOL = '2025-06-18';

const INSTRUCTIONS = `Bóveda de notas de Snowlog (Markdown cifrado; aquí se ve ya descifrado).
- Las notas se nombran por su ruta sin extensión: «Carpeta/Nota». También vale solo el nombre si no se repite.
- Enlaza con [[Nota]], [[Carpeta/Nota]], [[Nota#Sección]] o [[Nota|texto]]. Etiquetas: #etiqueta o tags en el frontmatter.
- Para añadir a una nota existente usa append_note (con heading para una sección) en lugar de reescribirla entera.
- Cada escritura es un commit en el repo de notas; agrupa los cambios en pocas llamadas.
- Si la bóveda está bloqueada, la primera herramienta que la necesite pedirá la frase al usuario en un diálogo del sistema. Nunca pidas la frase en el chat.`;

const str = (description) => ({ type: 'string', description });
const tools = [
  {
    name: 'vault_status', fn: ops.status,
    description: 'Estado de la bóveda: si está desbloqueada, número de notas y carpetas, y las carpetas del diario y de plantillas. No pide la frase.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'unlock', fn: ops.unlock,
    description: 'Desbloquea la bóveda: muestra al usuario un diálogo del sistema para que escriba la frase de paso. La frase nunca llega aquí.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lock', fn: ops.lock,
    description: 'Bloquea la bóveda y borra de memoria la clave y las notas descifradas.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_notes', fn: ops.listNotes,
    description: 'Lista notas y carpetas, opcionalmente dentro de una carpeta.',
    inputSchema: { type: 'object', properties: { folder: str('Carpeta, p. ej. «Proyectos». Vacío = toda la bóveda.'), recursive: { type: 'boolean', description: 'Incluir subcarpetas (por defecto sí).' } } },
  },
  {
    name: 'read_note', fn: ops.readNote,
    description: 'Lee una nota (Markdown con su frontmatter).',
    inputSchema: { type: 'object', properties: { path: str('Ruta o nombre de la nota, sin .md.') }, required: ['path'] },
  },
  {
    name: 'search', fn: ops.search,
    description: 'Búsqueda de texto completo sin distinguir mayúsculas ni acentos. Sintaxis: palabras (todas), "frase exacta", -excluir, tag:#etiqueta, path:Carpeta.',
    inputSchema: { type: 'object', properties: { query: str('Consulta.'), limit: { type: 'integer', description: 'Máximo de notas (20 por defecto).' } }, required: ['query'] },
  },
  {
    name: 'list_tags', fn: ops.listTags,
    description: 'Etiquetas de la bóveda con el número de notas que las usan.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'links', fn: ops.links,
    description: 'Enlaces [[…]] que salen de una nota, con la nota a la que apuntan o null si no existe.',
    inputSchema: { type: 'object', properties: { path: str('Ruta o nombre de la nota.') }, required: ['path'] },
  },
  {
    name: 'backlinks', fn: ops.backlinks,
    description: 'Notas que enlazan a esta nota (enlaces entrantes), con las líneas donde la enlazan.',
    inputSchema: { type: 'object', properties: { path: str('Ruta o nombre de la nota.') }, required: ['path'] },
  },
  {
    name: 'create_note', fn: ops.createNote,
    description: 'Crea una nota nueva. Con template, parte de esa plantilla ({{title}}, {{date}}…) y añade text después.',
    inputSchema: { type: 'object', properties: { path: str('Ruta de la nota nueva, p. ej. «Proyectos/Idea».'), text: str('Contenido Markdown.'), template: str('Plantilla (ruta o nombre dentro de la carpeta de plantillas).') }, required: ['path'] },
  },
  {
    name: 'write_note', fn: ops.writeNote,
    description: 'Reemplaza el contenido entero de una nota. Si cambió en otro dispositivo, se juntan los cambios o se guarda una copia.',
    inputSchema: { type: 'object', properties: { path: str('Ruta o nombre de la nota.'), text: str('Contenido completo nuevo.'), create: { type: 'boolean', description: 'Crearla si no existe.' } }, required: ['path', 'text'] },
  },
  {
    name: 'append_note', fn: ops.appendNote,
    description: 'Añade texto al final de una nota, o al final de una sección si se indica heading.',
    inputSchema: { type: 'object', properties: { path: str('Ruta o nombre de la nota.'), text: str('Texto Markdown que añadir.'), heading: str('Encabezado de la sección, sin #.'), create: { type: 'boolean', description: 'Crearla si no existe (sin heading).' } }, required: ['path', 'text'] },
  },
  {
    name: 'daily_note', fn: ops.dailyNote,
    description: 'Nota diaria (carpeta del diario, AAAA-MM-DD). Devuelve su texto; si no existe la crea con la plantilla del diario.',
    inputSchema: { type: 'object', properties: { date: str('Fecha AAAA-MM-DD (hoy por defecto).'), create: { type: 'boolean', description: 'Crearla si no existe (sí por defecto).' } } },
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
  if (!o.dir) throw new Error('Falta --dir (o SNOWLOG_VAULT_DIR) con el clon del repo de notas.');
  o.dir = resolve(o.dir.replace(/^~(?=\/|$)/, homedir()));
  return o;
}

export function createServer(session, write) {
  let queue = Promise.resolve();
  const reply = (id, result) => write({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

  async function call(name, args) {
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: 'text', text: `Herramienta desconocida: ${name}` }], isError: true };
    try {
      const result = await tool.fn(session, args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      // Solo mensajes propios (sin texto de notas ni secretos); el resto, genérico.
      const msg = e instanceof SessionError ? e.message : `Error al operar con la bóveda (${e.status ?? e.code ?? e.name}).`;
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
      // De una en una: cada escritura parte del índice que dejó la anterior.
      queue = queue.then(() => call(params?.name, params?.arguments)).then((r) => reply(id, r));
    } else if (method.startsWith('notifications/')) {
      // initialized, cancelled…: nada que hacer
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
