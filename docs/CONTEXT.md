# Contexto actual de Snowlog

Última actualización: 2026-11-13

## Estado

- **Fase 1 (núcleo seguro): hecha.** Login, bóveda cifrada, notas y carpetas, interfaz tipo Obsidian.
- **Fase 1b (lectura): hecha.** Frontmatter como propiedades, tablas, callouts y etiquetas.
- **Día a día: hecho** (en `development`). Nota diaria, plantillas, consultas tipo Dataview, tareas que se marcan,
  calendario, enlaces entrantes, panel en columnas, «Configurar mi espacio», importar carpeta y «Cargar ejemplos»
  (proyecto «Web de recetas» con historias que tienen `estado`, `prioridad` y `puntos` en el frontmatter).
- Publicado en https://snowlog.bendi.dev/ con GitHub Pages (origen: GitHub Actions) desde `main`.
- Login con GitHub configurado: GitHub App (Client ID `Iv23li5tmgS4GIWdO2HH`, Redirect URI
  `https://snowlog.bendi.dev/`) y Worker en https://snowlog-auth.serbenda.workers.dev
  (`ALLOWED_ORIGIN=https://snowlog.bendi.dev`, `GITHUB_CLIENT_SECRET` como secreto en Cloudflare).
  El token personal sigue disponible como alternativa.

## Dos versiones

| | Online | Portátil |
| --- | --- | --- |
| Fichero | `public/` en GitHub Pages | `snowlog-portable.html` (lo genera `scripts/build-portable.mjs`) |
| Bóveda | `Vault` (`vault.js`): GitHub, cifrada | `LocalVault` (`localvault.js`): `.md` en una carpeta o en OPFS |
| Red | GitHub API y el Worker | Ninguna (`connect-src 'none'`) |
| `CONFIG.mode` | `online` | `portable` |

`LocalVault` tiene la misma interfaz que `Vault`, así que la interfaz no distingue una de otra (`S.local`
solo cambia el arranque, cerrar/olvidar y el exportar). La carpeta elegida se recuerda en IndexedDB. En
`file://` el almacenamiento del navegador (OPFS) no está disponible: solo carpeta, con Chrome o Edge.

## Arquitectura en una frase

Web estática en GitHub Pages que lee y escribe, con la API de GitHub, un repo privado
(`serbenda/snowlog-notes`) donde todo está cifrado en el navegador antes de subir.

## Repos

| Repo | Visibilidad | Contenido |
| --- | --- | --- |
| `serbenda/snowlog` | público | código de la app, Worker, tests, docs |
| `serbenda/snowlog-notes` | privado | `.snowlog/vault.json`, `.snowlog/index.enc`, `n/<id>.enc`, `a/<id>.enc` (adjuntos) |

Se mantienen separados a propósito: el token de la app solo puede escribir en las notas, así que
aunque se robe no puede modificar el código de la web.

## Cifrado

- Una clave de datos (DEK) AES-256-GCM aleatoria cifra todo.
- La DEK se guarda envuelta dos veces en `vault.json`: con la frase de paso y con el código de
  recuperación (PBKDF2-SHA256, 600.000 iteraciones).
- Cada fichero: `base64(IV de 12 bytes || cifrado)`, con su id como dato autenticado (AAD).
- Las credenciales de GitHub se guardan en `localStorage` cifradas con la DEK.

## Decisiones vigentes

- Sin framework ni build: módulos ES servidos tal cual. Menos superficie de ataque.
- Markdown propio en `markdown.js` en lugar de una librería: escapa todo antes de dar formato.
- Un commit por guardado (con retardo de 2,5 s), con un reintento si otro dispositivo escribió antes.
- Bloqueo automático a los 10 minutos sin actividad.
- Editor sin librerías (`editor.js`): el cuadro de texto se queda transparente y un `<pre>` detrás muestra el
  mismo texto coloreado. El resaltado solo cambia colores, nunca tamaños, para que coincidan al píxel. Las
  ediciones van por `execCommand('insertText')` para conservar el deshacer. Al bloquear se vacía el `<pre>`.
- Adjuntos: nombre, tipo y tamaño en el índice cifrado (`index.files`); el contenido en `a/<id>.enc` con el id
  como AAD. Solo imágenes y PDF (nada de SVG ni HTML, que podrían ejecutar código). Las imágenes se muestran
  como `data:` (la CSP ya lo permitía) y los PDF se abren en otra pestaña con una URL `blob:` que se revoca
  al bloquear.
- Búsqueda (`search.js`) sobre el índice en memoria: el texto se pliega (sin acentos ni mayúsculas, misma
  longitud) una vez por versión de nota; 1.000 notas en pocos milisegundos. Los resultados se pintan como texto,
  nunca como HTML, y se vacían al bloquear.
- Renombrar o mover reescribe los `[[enlaces]]` de todas las notas (`links.js`) en un solo commit (`saveMany`).

## Cómo se organiza el día a día

Modelado sobre cómo el dueño usa Obsidian (estructura y plugins, nunca sus notas de trabajo):

| Obsidian | Snowlog |
| --- | --- |
| Daily notes + `openBehavior: daily` | `Diario/AAAA-MM-DD`, se abre al entrar si existe la carpeta del diario |
| Templates (`{{date}}`, `{{title}}`) | `templates.js`; carpeta `Plantillas/` |
| Dataview (`TASK … WHERE contains(text, "#tag") AND !completed GROUP BY file.link`) | `query.js`: subconjunto compatible de TASK/LIST/TABLE |
| Calendar | Calendario en el panel derecho |
| Backlinks | Enlaces entrantes en el panel derecho |
| Snippet `dashboard` | `cssclasses: dashboard` |

Configuración en `CONFIG.workspace` (`config.js`). El índice para consultas y enlaces entrantes se construye
en memoria descifrando todas las notas tras desbloquear (`noteindex.js`); se borra al bloquear.

## Siguiente

Plan en tres fases (Imprescindible, Confianza, Pulido) en [ROADMAP.md](ROADMAP.md), con criterios en
[DEFINITION-OF-DONE.md](DEFINITION-OF-DONE.md). En curso: **Fase 1** (hecho: enlaces al renombrar, editor, búsqueda, etiquetas y adjuntos; sigue conflictos entre dispositivos).

Pendiente de decidir: cómo pueden escribir notas los scripts externos (un CLI que cifre y haga commit).

## Proyectos relacionados

- Pizarra estilo Excalidraw (repo por crear): reutilizará login y cifrado de Snowlog.
