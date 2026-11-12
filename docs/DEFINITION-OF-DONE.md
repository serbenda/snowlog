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

### Fase 1: núcleo seguro
- [x] Login con GitHub y con token personal; cerrar sesión borra token y clave.
- [x] Sin frase de paso no se lee nada; una frase incorrecta da un error claro.
- [x] Crear, editar, renombrar, mover y borrar notas y carpetas; cada acción es un commit.
- [x] Los nombres de fichero del repo no revelan títulos.
- [x] Bloqueo automático tras 10 minutos sin actividad.

### Fase 2: conocimiento enlazado
- [ ] `[[` sugiere notas; un enlace a una nota que no existe permite crearla.
- [ ] Renombrar una nota actualiza los enlaces que apuntan a ella.
- [ ] Panel de etiquetas y búsqueda en menos de 300 ms con 1.000 notas (backlinks: hecho).
- [x] Nota diaria y plantillas.
- [x] Importar una carpeta de Markdown sin perder enlaces.
- [x] Consultas de tareas por etiqueta, agrupadas por nota, que se pueden marcar.

### Fase 3: móvil y sin conexión
- [ ] PWA instalable; leer y editar sin conexión, con la caché local cifrada.
- [ ] Un conflicto entre dispositivos nunca pierde texto.

### Fase 4: extras
- [ ] Grafo, adjuntos cifrados, historial con restaurar y exportar a ZIP.
