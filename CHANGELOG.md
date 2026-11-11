# Changelog

Todos los cambios relevantes de Snowlog. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versiones según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- Modo lectura: el frontmatter se muestra como propiedades (con etiquetas, listas y casillas).
- Tablas Markdown con alineación, celdas vacías y `\|` escapado.
- Callouts (`> [!info]`, `[!warning]`, `[!danger]`…) con colores, alias y versión plegable (`+`/`-`).
- Etiquetas `#tag` en el texto y en las tareas.
- `CLAUDE.md`, `docs/CONTEXT.md`, `docs/DEFINITION-OF-DONE.md` y comandos en `.claude/commands/`.
- Comprobación en CI de la autoría de los commits.
- Client ID de la GitHub App en la configuración de la web y del Worker.

### Cambiado
- En las tareas hechas solo se tacha el texto, no la casilla ni el espacio.
- El esquema y el contador de palabras ignoran el frontmatter.

## [0.1.0] - 2026-11-09

### Añadido
- Cifrado de extremo a extremo con WebCrypto: clave de datos envuelta con frase de paso y código de recuperación.
- Bóveda en un repo privado de GitHub: índice cifrado y una nota cifrada por fichero con nombre aleatorio.
- Un commit atómico por guardado, con reintento ante escrituras simultáneas.
- Login con token personal o con GitHub (GitHub App y Cloudflare Worker), con renovación automática.
- Interfaz al estilo Obsidian: ribbon, explorador con carpetas, editor, lectura, selector rápido, esquema y barra de estado.
- Bloqueo automático tras 10 minutos sin actividad.
- Tests con `node --test`, publicación en GitHub Pages con GitHub Actions y guía de puesta en marcha.
