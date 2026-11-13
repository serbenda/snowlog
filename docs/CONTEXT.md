# Contexto actual de Snowlog

Última actualización: 2026-11-13

## Estado

- **Fase 1 (núcleo seguro): hecha.** Login, bóveda cifrada, notas y carpetas, interfaz tipo Obsidian.
- **Fase 1b (lectura): hecha.** Frontmatter como propiedades, tablas, callouts y etiquetas.
- **Fases 1, 2 y 3 de la hoja de ruta: hechas** (en `development`, PR #4). Ver «Siguiente».
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
- Cambiar la frase o el código de recuperación solo reenvuelve la DEK (`changePassphrase`, `renewRecoveryCode`).
  Rotar la DEK (`Vault.rotate`, `C.rotateVault`) recifra todo en un commit; las DEK antiguas van a
  `.snowlog/keyring.enc` (cifrado con la actual; `index.hasKeyring`) para leer el historial. Otros dispositivos
  detectan `key_changed` al leer el índice, guardan lo pendiente en `outbox` y piden la frase.

## Decisiones vigentes

- Sin framework ni build: módulos ES servidos tal cual. Menos superficie de ataque.
- Markdown propio en `markdown.js` en lugar de una librería: escapa todo antes de dar formato.
- CSP con Trusted Types: todo `innerHTML` pasa por la política `snowlog` (`trusted()` en `app.js`). Si cambia la
  URL del Worker, hay que cambiarla también en la CSP de `index.html` (un test lo comprueba).
- Un commit por guardado (4 s sin escribir o 30 s como mucho), con un reintento si otro dispositivo escribió antes.
- Caché cifrada (`cache.js`, IndexedDB `snowlog-cache`): guarda el texto cifrado de `n/` y `a/` tal cual está en
  el repo, con la versión del índice (`updated`). Si coincide, no se descarga; si no descifra (dañada o
  manipulada), se vuelve a pedir. Lo que falta se baja en bloques de 100 con GraphQL (`readMany`/`prefetch`);
  si GraphQL falla, uno a uno. Medido con 1.000 notas y 150 ms de latencia: entrar 0,3 s; índice completo 2,9 s
  en un dispositivo nuevo (antes 17,5 s) y 1,2 s con la caché.
- Sin conexión: `sw.js` guarda solo la web (mismo origen; nunca GitHub ni el login), red primero y caché si
  falla. Las notas salen de la caché cifrada. Si un commit falla por red (`TypeError`), `Vault` pasa a
  `offline` y los guardados y notas nuevas van a `outbox` (cifrada con la DEK en IndexedDB, junto con el índice
  local). `sync()` (evento `online` o cada 30 s) recarga el índice y sube cada nota con `saveOnline`, así que los
  conflictos se tratan igual. Si al abrir no se puede renovar el token por falta de red, se entra igual.
- Copias (`backup.js`): `.snowlog` = JSON con `vault.json` (claves envueltas) y un .zip cifrado con la DEK
  (AAD `snowlog-backup`). Se abre con `unlockWithAny` (frase o código). El navegador no deja guardar ficheros
  solo, así que «periódica» es un recordatorio: en `localStorage` solo se guarda la fecha de la última copia.
- Historial: online, `GET /commits?path=n/<id>.enc` y cada versión se descifra al elegirla; restaurar es un
  guardado más. Local: copias en `.history/<ruta>/<fecha>.md` (oculta, no se carga como nota), que siguen a la
  nota al renombrarla.
- Conflictos: primero se intenta fusionar a tres bandas por líneas (`merge.js`, base = texto leído aquí,
  `baseText`); solo si chocan las mismas líneas se guarda la copia. Cada nota recuerda la fecha `updated` con la que se leyó (`Vault.base`). Si al guardar el índice
  trae otra, la versión remota se guarda como copia «(otro dispositivo …)» en el mismo commit; gana la de aquí
  porque es la que se está viendo. En local se compara el fichero con lo que se leyó.
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

Valores por defecto en `CONFIG.workspace` (`config.js`); cada bóveda los cambia en «Ajustes» (`index.settings`,
cifrado; en local `.snowlog/ajustes.json`) y `applySettings()` los mezcla en `WS`. El tema es por dispositivo. El índice para consultas y enlaces entrantes se construye
en memoria descifrando todas las notas tras desbloquear (`noteindex.js`); se borra al bloquear.

## Siguiente

Plan en tres fases (Imprescindible, Confianza, Pulido) en [ROADMAP.md](ROADMAP.md), con criterios en
[DEFINITION-OF-DONE.md](DEFINITION-OF-DONE.md). Las tres están hechas en `development`, con dos puntos que
dependen de alguien más:

- Revisión de seguridad por una persona externa (la interna, con sus hallazgos resueltos, está en
  [SEGURIDAD.md](SEGURIDAD.md)).
- Probar la versión portátil en Firefox y Safari reales (está probada en Chrome simulando esos navegadores).

Ideas para después: PKCE en el login y firmar el índice para detectar que alguien
reponga versiones antiguas.

Scripts y agentes externos: servidor MCP en `agent/` (fase 1 hecha: leer, buscar, enlaces, crear, añadir, nota
diaria), sobre un clon del repo de notas con `GitDirRepo` y `Vault` tal cual. Ver [AGENTES.md](AGENTES.md). Fase 2:
editar por sección, mover, borrar, tareas, consultas, huérfanas y un CLI.

## Proyectos relacionados

- Escritorio (Tauri 2, `desktop/`): una ventana que carga `public/` tal cual, sin órdenes del sistema expuestas
  a la web (`withGlobalTauri: false`, sin plugins). Usa el motor del sistema: en Windows (WebView2) funciona la
  carpeta del ordenador; en macOS y Linux (WebKit) no hay File System Access y la bóveda local va dentro de la
  app (kvdir). El login con GitHub App no sirve (su vuelta va a la web publicada): se entra con token personal.
- [sketch](https://github.com/serbenda/sketch): pizarra a mano alzada, web propia sin red. Su motor
  (`js/{trazo,escena,pintar,editor}.js` y `css/sketch.css`) se copia en `public/js/sketch-*.js` y
  `public/css/sketch.css`, y su letra a mano (Caveat, OFL) en `public/fonts/`, con
  `node scripts/update-sketch.mjs <ruta-a-sketch>`; no se editan aquí. La portátil quita el `@font-face` (sin
  `font-src`) y usa la cursiva del sistema. Los dibujos
  son adjuntos `.sketch` (JSON) cifrados como cualquier otro; se incrustan con `![[x.sketch]]` como SVG hecho
  con DOM (sin innerHTML). Si un dibujo cambia en dos dispositivos se fusiona por elemento
  (`mergeScenes` de sketch, que `app.js` pasa a `saveFile` como `merge`); solo si chocan en el mismo elemento
  se guarda además la otra versión como copia. La búsqueda descifra los dibujos para buscar en sus textos
  (`S.drawText`, solo en memoria; se vacía al bloquear).
