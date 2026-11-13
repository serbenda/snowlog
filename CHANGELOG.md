# Changelog

Todos los cambios relevantes de Snowlog. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versiones según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- **Fusión automática:** si la misma nota cambia en dos dispositivos (o fuera de Snowlog, en la versión portátil) en partes distintas, se juntan los dos cambios sin crear copias. Si los dos añaden líneas en el mismo sitio, se quedan ambas. Solo cuando cambian las mismas líneas de forma distinta se guarda la otra versión como copia, como antes.
- Primera entrada en un dispositivo nuevo mucho más rápida: las notas se descargan en bloques de 100 (GraphQL de GitHub) en lugar de una a una. Con 1.000 notas y 150 ms de latencia, el índice completo pasa de 17,5 s a 2,9 s. Si GraphQL no está disponible, se sigue como antes.
- **Tests en el navegador** (`npm run test:e2e`, y en la CI en cada push y PR): crear bóveda, escribir, bloquear y volver a entrar sin nada en claro en el repo; que el HTML de una nota no se ejecute y la CSP no se queje; ejemplos, búsqueda y renombrar con enlaces; y la versión portátil desde el disco sin ninguna conexión. Usan Chrome directamente por el protocolo de DevTools, sin dependencias.
- **Pasar notas entre la versión portátil y la online:** «Importar copia (.snowlog o .zip)…» acepta la copia cifrada de la online y el .zip de la portátil (o de «Exportar sin cifrar»). Se puede importar en una carpeta aparte o tal cual, con sus carpetas y adjuntos.
- Versión portátil en Firefox y Safari (y en cualquier navegador que no deje elegir carpetas): «Guardar dentro del navegador» guarda las notas en IndexedDB (o en localStorage si no hay) y siguen ahí al volver a abrir el fichero.
- Carpetas del ordenador: Snowlog detecta lo que cambia desde fuera (otro editor, OneDrive, Dropbox…) al volver a la ventana y cada 10 s. Actualiza el explorador y la nota abierta; si la nota abierta se borra fuera mientras escribes, lo escrito se guarda en «Recuperada».
- **Tableros Kanban** sobre Markdown normal (`## Columna` y `- [ ] tarjeta`, con `kanban-plugin: basic` o `kanban: true` en las propiedades): arrastrar tarjetas entre columnas, añadir, editar, marcar y borrar tarjetas, y crear, renombrar, mover y borrar columnas. «Nuevo tablero Kanban» en el menú y en la paleta. El texto sigue siendo editable con Ctrl+E.
- **Vista de grafo** (Ctrl+G o el botón del ribbon): notas y enlaces con disposición por fuerzas, zoom, arrastrar, resaltar vecinas al pasar el ratón y abrir una nota al pulsarla. «Grafo de esta nota» muestra solo la nota y sus vecinas (1 a 3 saltos); se pueden ocultar las notas sin enlaces.
- **Paleta de comandos** (Ctrl+P o el botón `>_`): todas las acciones por nombre, sin acentos ni mayúsculas, con las últimas usadas primero. Ctrl+O sigue abriendo notas.
- **Marcadores:** «Añadir a marcadores» en el menú de la nota o del explorador, y pestaña Marcadores en el panel izquierdo. Siguen a la nota al renombrarla o moverla y se comparten entre dispositivos (van en los ajustes cifrados).
- **Vista previa** de la nota al pasar el ratón por un `[[enlace]]` en el modo lectura.
- **Ajustes** dentro de la app (botón de engranaje o menú ⋯): panel principal, carpeta y plantilla del diario, abrir la nota de hoy al entrar, carpetas de plantillas y adjuntos, minutos hasta el bloqueo, días del recordatorio de copia y tema (automático, claro u oscuro). En online se guardan cifrados en la bóveda y valen en todos los dispositivos; en local, en `.snowlog/ajustes.json` dentro de la carpeta. `config.js` queda como valores por defecto.
- `docs/SEGURIDAD.md`: qué protege Snowlog y frente a quién, qué queda en el dispositivo, CSP, hallazgos de la revisión y riesgos aceptados.
- La versión online funciona sin conexión: la web se guarda en el navegador (service worker) y se abre sin red; se pueden leer las notas ya descargadas, editarlas y crear notas nuevas. Lo escrito queda cifrado en este dispositivo y se sube solo al volver la red, con la detección de conflictos de siempre. La barra de estado avisa: «Sin conexión · 2 cambios por subir». Renombrar, borrar, mover o adjuntar sin conexión avisa de que hace falta red (salvo renombrar una nota creada sin conexión).
- Se puede instalar como aplicación desde el navegador (manifiesto web).
- Caché local cifrada (IndexedDB) de las notas y adjuntos de la versión online: solo se descargan los que han cambiado. Con 1.000 notas, entrar tarda menos de medio segundo y la búsqueda está lista en menos de 1 s; en un dispositivo nuevo, la primera vez se descargan todas en segundo plano (10 a la vez) mientras ya puedes trabajar. «Cerrar sesión» y «Olvidar este dispositivo» la borran.
- La búsqueda dice cuántas notas encajan aunque solo muestre las 200 primeras, y cuántas lleva descifradas mientras prepara el índice.
- Copias de seguridad: «Copia de seguridad cifrada» descarga un fichero `.snowlog` con todas las notas y adjuntos cifrados, que se abre con la frase de paso o con el código de recuperación, sin GitHub. «Abrir copia de seguridad…» la importa en una carpeta aparte o la descarga como .zip sin cifrar; también funciona en la versión portátil, sin red. En local, la copia es el .zip de siempre.
- Recordatorio cuando pasan 7 días sin copia (`backupReminderDays` en la configuración), con «Hacer copia ahora» o «Mañana».
- Al bloquear también se vacían los avisos de la pantalla.
- «Frase de paso y recuperación…» en el menú ⋯: cambiar la frase de paso (pide la actual) y generar un código de recuperación nuevo (el anterior deja de servir). Solo se vuelve a envolver la clave; las notas no se recifran. Al cambiarla se aplican las iteraciones de PBKDF2 de la configuración si son más.
- Historial de versiones de cada nota (menú ⋯ › «Historial de versiones…»): lista de versiones con fecha, vista previa, cuántas líneas cambian frente a la actual y botón para restaurar (restaurar no borra nada del historial). En online se leen de los commits del repo, cifradas; en local se guarda una copia en `.history/` como mucho cada 10 minutos (las 50 últimas por nota).
- Ningún cambio se pierde entre dispositivos: si la misma nota se cambió en otro sitio desde que la abriste, al guardar se conserva tu versión y la otra queda en una copia «Nota (otro dispositivo AAAA-MM-DD HHMM)», con un aviso que la abre. Si la borraron en otro dispositivo, guardarla la recupera. En la versión portátil pasa lo mismo cuando la carpeta se sincroniza (OneDrive, Dropbox…) y el fichero cambió fuera.
- Adjuntos: pegar o arrastrar imágenes y PDF en el editor (o «Adjuntar imagen o PDF…» en el menú). Se guardan en `Adjuntos/` y se insertan como `![[nombre]]`; en lectura se ve la imagen (`![[foto.png|300]]` fija el ancho) o una ficha del PDF para abrirlo. En la versión online van cifrados (`a/<id>.enc`); en la portátil son ficheros normales. Máximo 20 MB por adjunto.
- Los adjuntos aparecen en el explorador (abrir, insertar en la nota, eliminar), se mueven con su carpeta y entran en la copia .zip.
- Búsqueda en todas las notas (Ctrl+Mayús+F): sin acentos ni mayúsculas, con el fragmento de cada coincidencia resaltado; admite `"frase"`, `-palabra`, `tag:#etiqueta` y `path:carpeta`. Pulsar un resultado abre la nota con el texto seleccionado.
- Panel de etiquetas con el número de notas de cada una; pulsar una etiqueta busca sus notas.
- Panel izquierdo con pestañas: Archivos, Buscar y Etiquetas.
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
- Seguridad: la CSP solo permite conectar con GitHub y con el Worker configurado (antes, cualquier `*.workers.dev`); Trusted Types obligatorios para todo el HTML que se pinta; Snowlog no arranca dentro de un iframe; al bloquear se vacían también el título de la pestaña, las migas y los diálogos abiertos; las carpetas abiertas se recuerdan cifradas.
- Guardados agrupados: en online se guarda tras 4 s sin escribir (antes 2,5 s) y como mucho cada 30 s escribiendo sin parar, así hay menos commits y no se pierde nada; al cambiar de pestaña o de app se guarda enseguida. En local, 1 s.
- Snowlog se publica en `https://snowlog.bendi.dev`; el Worker solo acepta ese origen.
- En las tareas hechas solo se tacha el texto, no la casilla ni el espacio.
- El esquema y el contador de palabras ignoran el frontmatter.
- Las listas se anidan según la sangría real (2 o 4 espacios, o tabuladores).
- Los enlaces y etiquetas escritos dentro de `código` ya no cuentan como enlaces ni etiquetas.

### Corregido
- El menú ⋯ se abre debajo de su botón sin taparlo (antes, con el menú abierto no se podía volver a pulsar).
- Tableros en el móvil: una columna por pantalla, con desplazamiento que se ajusta a cada columna.
- El menú ⋯ ya no se sale de la pantalla (tiene su propio desplazamiento) y se cierra al usar un atajo de teclado.
- Con muchas notas, el explorador ya no estira la página entera: cada panel tiene su propio desplazamiento.
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
