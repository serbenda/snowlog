# Definition of Done

Un cambio está terminado cuando cumple **todo** lo de esta lista.

## Siempre

- [ ] `npm test` en verde, en local y en GitHub Actions.
- [ ] Hay tests para lo nuevo; obligatorios si toca `crypto.js`, `vault.js`, `github.js` o `markdown.js`.
- [ ] Nada en claro en el repo de notas (los tests de `vault.test.mjs` lo comprueban).
- [ ] Sin scripts ni estilos externos, y la CSP de `index.html` sin relajar.
- [ ] Sin secretos en el código.
- [ ] Si cambia la interfaz: probado en escritorio y móvil, en tema claro y oscuro, y sin errores en consola.
- [ ] Accesible: botones reales, `aria-label` en los de solo icono y navegación con teclado.
- [ ] `CHANGELOG.md` con la entrada en `[Sin publicar]`.
- [ ] `docs/CONTEXT.md` actualizado si cambian el estado, la arquitectura o una decisión.
- [ ] Commits firmados solo por Sergio Santiago Bendaña Quesada, sin atribuciones de IA.
- [ ] En `development` y llevado a `main` con una PR que fusiona el dueño.

## Por fase

La hoja de ruta completa, con el motivo de cada punto, está en [ROADMAP.md](ROADMAP.md).

### Base (hecha)
- [x] Login con GitHub y con token personal; cerrar sesión borra token y clave.
- [x] Sin frase de paso no se lee nada; una frase incorrecta da un error claro.
- [x] Crear, editar, renombrar, mover y borrar notas y carpetas; cada acción es un commit.
- [x] Los nombres de fichero del repo no revelan títulos.
- [x] Bloqueo automático tras 10 minutos sin actividad.
- [x] Nota diaria, plantillas, consultas, calendario, enlaces entrantes y panel principal.
- [x] Importar una carpeta de Markdown sin perder enlaces; exportar copia .zip.
- [x] Versión portátil en un solo fichero, sin red.

### Fase 1: Imprescindible (para dejar Obsidian)
- [x] Renombrar o mover una nota o carpeta actualiza todos los `[[enlaces]]` que apuntan a ella.
- [x] Editor: resaltado de Markdown mientras escribes, Intro continúa listas y tareas, Tab y Mayús+Tab sangran.
- [x] Editor: `[[` sugiere notas; un enlace a una nota que no existe permite crearla.
- [x] Editor: Ctrl+B, Ctrl+I, Ctrl+K (enlace) y Ctrl+Intro (marcar tarea).
- [x] Búsqueda de texto completo con contexto, en menos de 300 ms con 1.000 notas.
- [x] Panel de etiquetas con recuento; pulsar una etiqueta filtra.
- [x] Imágenes y PDF: pegar o arrastrar, `![[adjunto]]`; cifrados en online, ficheros normales en portátil.
- [ ] Un cambio hecho en otro dispositivo nunca se pierde: se detecta y se conservan las dos versiones.

### Fase 2: Confianza
- [ ] Historial de una nota con vista de cada versión y botón de restaurar.
- [ ] Cambiar la frase de paso desde la app (reenvolver la clave sin recifrar todo).
- [ ] Recordatorio y copia de seguridad: exportar .zip cifrado de forma periódica.
- [ ] Rendimiento: con 1.000 notas, entrar en menos de 3 s; guardados agrupados para no generar un commit por tecla.
- [ ] Versión online sin conexión (PWA): leer y editar sin red, con cola de cambios y caché cifrada.
- [ ] Revisión de seguridad independiente del cifrado y de la CSP, con sus hallazgos resueltos.

### Fase 3: Pulido
- [ ] Ajustes dentro de la app (carpetas, plantillas, panel, bloqueo) en lugar de `config.js`.
- [ ] Paleta de comandos (Ctrl+P), marcadores y vista previa al pasar sobre un enlace.
- [ ] Kanban sobre Markdown y vista de grafo.
- [ ] Portátil en Safari y Firefox; detectar cambios hechos desde fuera de la app.
- [ ] Pasar notas entre la versión portátil y la online (exportar de una, importar en la otra).
- [ ] Tests de navegador en la CI para los recorridos principales.
