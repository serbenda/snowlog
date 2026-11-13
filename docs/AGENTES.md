# Acceso de agentes y scripts (servidor MCP)

`agent/` deja que un asistente con MCP o un script trabajen con la bóveda como con una carpeta de
Markdown: listar, leer, buscar, seguir enlaces y enlaces entrantes, crear, añadir y la nota diaria. El
cifrado ocurre en local con los mismos módulos que la web (`crypto.js`, `vault.js`, `noteindex.js`,
`search.js`, `templates.js`, `merge.js`). Nada de la bóveda sale en claro al repo.

## Cómo funciona

```
cliente MCP ──stdio (JSON-RPC)──▶ agent/mcp.js ──▶ Vault (public/js/vault.js)
                                                     └▶ GitDirRepo (agent/gitdir.js) ──git──▶ clon ──push──▶ GitHub
```

- **`GitDirRepo`** tiene la misma interfaz que `GitHubRepo`, pero sobre un clon local del repo de notas. Lee
  los ficheros cifrados de `origin/main` tras un `git fetch`, nunca del árbol de trabajo. Escribe cada
  cambio como un commit hecho con plomería (índice temporal, `commit-tree`) y lo sube con
  `git push <sha>:main`.
  - Si el push se rechaza porque la app escribió antes, lanza el mismo 409 que la API de GitHub. `Vault`
    recarga el índice y repite, y si la nota cambió en los dos sitios la fusiona igual que entre dos
    dispositivos.
  - Si el clon está limpio y en `main`, lo avanza (`merge --ff-only`). Si no, no lo toca.
- **`Session`** guarda la DEK solo en memoria y la olvida al bloquear: con la herramienta `lock`, tras
  `lockAfterMinutes` sin uso (10 por defecto, como la app) o al cerrar el proceso. Vuelve a leer el índice
  si han pasado más de 10 s desde la última vez, para ver lo que cambió la app.
- **Mensajes de commit**: los mismos que la app (`Snowlog: nueva nota`, `Snowlog: guardar nota`), sin
  títulos ni rutas. El autor es el `git config` del clon.

## La frase de paso

Nunca pasa por el cliente MCP. La primera herramienta que necesita la clave (o `unlock`) abre un diálogo
de macOS con la entrada oculta (`osascript … with hidden answer`). La frase llega a este proceso por una
tubería, se deriva la DEK y se descarta. No va en argumentos, variables de entorno, ficheros ni errores,
y ninguna herramienta la devuelve. Tras tres intentos fallidos, o si se cancela, la herramienta devuelve
un error.

`SNOWLOG_ASKPASS=/ruta/programa` cambia el diálogo por un programa cuya salida es la frase, como
`SSH_ASKPASS`. Sirve para otros sistemas y para las pruebas.

**Ojo:** lo que el servidor devuelve (texto de notas descifradas) llega al cliente MCP. Mientras está
desbloqueada, quien use el servidor puede leer toda la bóveda.

## Herramientas

| Herramienta | Qué hace |
| --- | --- |
| `vault_status` | Si está desbloqueada, número de notas, carpetas del diario y de plantillas. No pide la frase |
| `unlock` / `lock` | Desbloquear con el diálogo / olvidar la clave y las notas descifradas |
| `list_notes` | Notas y carpetas, de toda la bóveda o de una carpeta (`recursive`) |
| `read_note` | Texto de una nota; vale `Carpeta/Nota`, `Nota`, `Nota.md` o `[[Nota]]` |
| `search` | La búsqueda de la app: palabras, `"frase"`, `-excluir`, `tag:#x`, `path:Carpeta` |
| `list_tags` | Etiquetas con su número de notas |
| `links` | Enlaces salientes, con la nota destino o `null` si no existe |
| `backlinks` | Enlaces entrantes con las líneas donde aparecen |
| `create_note` | Nota nueva, opcionalmente desde una plantilla de la carpeta de plantillas |
| `write_note` | Reemplaza el texto entero (fusiona si cambió en otro sitio) |
| `append_note` | Añade al final o al final de una sección (`heading`) |
| `daily_note` | Nota diaria de hoy o de una fecha; la crea con la plantilla del diario |

## Uso

```bash
# Bóveda de PRUEBA (repo bare + clon, con el espacio inicial y el proyecto de ejemplo)
node agent/test-vault.mjs /ruta/nueva

# Servidor MCP sobre un clon del repo de notas
node agent/mcp.js --dir ~/ruta/al/clon/snowlog-notes
```

Opciones: `--remote origin` y `--branch main` (por defecto), o `SNOWLOG_VAULT_DIR` en lugar de `--dir`.

## Pruebas

`tests/agent.test.mjs` crea una bóveda en una carpeta temporal (remoto bare y clones que hacen de
dispositivos) y comprueba:

- desbloqueo, reintento y cancelación;
- lectura, enlaces y enlaces entrantes, búsqueda, añadir por sección y nota diaria;
- que la app lee lo que escribe el agente, y al revés;
- fusión con cambios simultáneos y push rechazado (409);
- que el repo no tiene nada en claro;
- bloqueo por inactividad;
- el protocolo MCP, también como proceso, y que la frase no aparece en ninguna salida.

## Siguiente (fase 2)

Editar por encabezado o propiedad del frontmatter, mover con reescritura de enlaces, borrar a `Archivo/`,
marcar tareas, consultas `dataview`, enlaces sin destino y notas huérfanas, cambios recientes, un CLI y
normas de la bóveda en una nota cifrada.
