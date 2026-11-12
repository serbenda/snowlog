# Contexto actual de Snowlog

Última actualización: 2026-11-12

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

## Arquitectura en una frase

Web estática en GitHub Pages que lee y escribe, con la API de GitHub, un repo privado
(`serbenda/snowlog-notes`) donde todo está cifrado en el navegador antes de subir.

## Repos

| Repo | Visibilidad | Contenido |
| --- | --- | --- |
| `serbenda/snowlog` | público | código de la app, Worker, tests, docs |
| `serbenda/snowlog-notes` | privado | `.snowlog/vault.json`, `.snowlog/index.enc`, `n/<id>.enc` |

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

1. Búsqueda de texto completo y panel de etiquetas.
2. Editor con resaltado y autocompletado de `[[enlaces]]`; renombrar actualiza enlaces.
3. Atajos de listas (mover líneas, sangrar) y edición de tablas.
4. Kanban y marcadores.
5. PWA y uso sin conexión.

Pendiente de decidir: cómo pueden escribir notas los scripts externos (un CLI que cifre y haga commit).

## Proyectos relacionados

- Pizarra estilo Excalidraw (repo por crear): reutilizará login y cifrado de Snowlog.
