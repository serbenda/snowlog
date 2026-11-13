# Changelog

Todos los cambios relevantes de Snowlog. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versiones según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- Editor: resaltado de Markdown mientras escribes (solo color, sin mover el texto); Intro continúa listas, tareas y citas, y en un elemento vacío sale de la lista; Tab y Mayús+Tab sangran.
- Editor: al escribir `[[` aparecen sugerencias de notas; si la nota no existe, se puede crear desde ahí.
- Atajos: Ctrl+B (negrita), Ctrl+I (cursiva), Ctrl+K (enlace) y Ctrl+Intro (marcar o crear tarea), con deshacer normal.
- Renombrar o mover una nota o carpeta actualiza los `[[enlaces]]` que apuntan a ella en todas las notas (un solo commit en la versión online).
- Modo lectura: el frontmatter se muestra como propiedades (con etiquetas, listas y casillas).
- Tablas Markdown con alineación, celdas vacías y `\|` escapado.
- Callouts (`> [!info]`, `[!warning]`, `[!danger]`…) con colores, alias y versión plegable (`+`/`-`).
- Etiquetas `#tag` en el texto y en las tareas.
- `CLAUDE.md`, `docs/CONTEXT.md`, `docs/DEFINITION-OF-DONE.md` y comandos en `.claude/commands/`.
- Comprobación en CI de la autoría de los commits.
- Login con GitHub activo: Client ID de la GitHub App y URL del Worker en la configuración.
- Nota diaria: botón **Hoy** (Ctrl+D), se abre sola al entrar y se crea desde la plantilla `Plantillas/Nota diaria`.
- Plantillas con `{{title}}`, `{{date:FORMATO}}` y `{{time}}`: «Insertar plantilla» y «Nueva nota desde plantilla».
- Consultas al estilo Dataview en bloques ```` ```dataview ````: `TASK`, `LIST` y `TABLE` con `FROM`, `WHERE`, `GROUP BY`, `SORT` y `LIMIT`.
- Tareas que se marcan con un clic en el modo lectura y desde los resultados de una consulta; el cambio se guarda en su nota.
- Panel derecho con calendario mensual (puntos en los días con nota) y enlaces entrantes.
- Panel principal con `cssclasses: dashboard`: las listas de primer nivel se muestran en columnas.
- «Configurar mi espacio»: crea Inicio, Diario, Proyectos, Plantillas (nota diaria, nota, proyecto, reunión, píldora de conocimiento y procedimiento) y Archivo.
- Importar una carpeta de Markdown (por ejemplo, una bóveda de Obsidian): se cifra en el navegador y se sube por lotes.
- **Versión portátil** `snowlog-portable.html`: un solo fichero que se abre con doble clic en Chrome o Edge, sin instalar nada y sin internet. Las notas son ficheros `.md` en una carpeta del ordenador; la CSP prohíbe cualquier conexión.
- Modo local también en la versión online: «Usar notas de este ordenador, sin GitHub».
- Exportar copia (.zip) de todas las notas, en las dos versiones.
- Lo que se borra en modo local va a `.trash` dentro de la carpeta.
- GitHub Actions construye la versión portátil y la publica en `https://snowlog.bendi.dev/snowlog-portable.html`.
- «Cargar ejemplos»: un proyecto de ejemplo (Web de recetas) con 4 historias, tablero, reunión, píldora y notas diarias enlazadas, para ver cómo organizarse.

### Cambiado
- Snowlog se publica en `https://snowlog.bendi.dev`; el Worker solo acepta ese origen.
- En las tareas hechas solo se tacha el texto, no la casilla ni el espacio.
- El esquema y el contador de palabras ignoran el frontmatter.
- Las listas se anidan según la sangría real (2 o 4 espacios, o tabuladores).
- Los enlaces y etiquetas escritos dentro de `código` ya no cuentan como enlaces ni etiquetas.

### Corregido
- La pantalla de acceso ya no muestra el texto «null» cuando el login con GitHub está activo.

## [0.1.0] - 2026-11-09

### Añadido
- Cifrado de extremo a extremo con WebCrypto: clave de datos envuelta con frase de paso y código de recuperación.
- Bóveda en un repo privado de GitHub: índice cifrado y una nota cifrada por fichero con nombre aleatorio.
- Un commit atómico por guardado, con reintento ante escrituras simultáneas.
- Login con token personal o con GitHub (GitHub App y Cloudflare Worker), con renovación automática.
- Interfaz al estilo Obsidian: ribbon, explorador con carpetas, editor, lectura, selector rápido, esquema y barra de estado.
- Bloqueo automático tras 10 minutos sin actividad.
- Tests con `node --test`, publicación en GitHub Pages con GitHub Actions y guía de puesta en marcha.
