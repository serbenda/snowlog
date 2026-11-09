# Snowlog

Cuaderno de notas personal al estilo Obsidian, **cifrado de extremo a extremo**, que vive en GitHub.

- La app es una web estática publicada en GitHub Pages (este repo, público, sin notas).
- Las notas se guardan en un repo **privado** (`snowlog-notes`) como ficheros cifrados.
- Se cifra en el navegador con AES-256-GCM. La clave sale de tu frase de paso y nunca abandona el dispositivo.
- Cada guardado es un commit: tienes historial completo y copia de seguridad gratis.

## Interfaz

La disposición se inspira en Obsidian: barra lateral de iconos (ribbon), explorador de archivos con carpetas,
editor con título en línea, modo lectura, panel de esquema y barra de estado. Todo el código y los iconos son
propios; no se usa código ni recursos de Obsidian.

| Atajo | Acción |
| --- | --- |
| Ctrl/Cmd + N | Nota nueva |
| Ctrl/Cmd + O (o P) | Selector rápido: abrir o crear nota |
| Ctrl/Cmd + E | Cambiar entre editar y leer |
| Ctrl/Cmd + S | Guardar ya |
| F2 (en el árbol) | Renombrar |

También: clic derecho en el árbol, arrastrar notas a carpetas, enlaces `[[Otra nota]]` que abren o crean notas.

## Cómo está montado

```
public/            la web (lo que publica GitHub Pages)
  js/crypto.js     cifrado con WebCrypto: clave de datos envuelta con frase de paso y con código de recuperación
  js/github.js     cliente de la API de GitHub: un commit atómico por guardado
  js/vault.js      bóveda: índice cifrado + notas cifradas
  js/auth.js       login con GitHub (OAuth) o token personal; credenciales locales cifradas
  js/markdown.js   Markdown seguro (todo se escapa antes de dar formato)
  js/app.js        interfaz
worker/            Cloudflare Worker para el login con GitHub (guarda el client secret)
tests/             tests con node --test, incluido un GitHub falso en memoria
```

En el repo de notas solo hay:

```
.snowlog/vault.json   parámetros del cifrado y la clave de datos envuelta (nada legible)
.snowlog/index.enc    índice cifrado (títulos, carpetas, fechas)
n/<id>.enc            una nota cifrada por fichero, con nombre aleatorio
```

## Puesta en marcha

Ver [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md). Resumen: activar Pages, y entrar con un token
personal de momento, o crear la GitHub App y el Worker para el login con GitHub.

## Desarrollo

```bash
npm test                                  # tests (Node 20+)
python3 -m http.server 8000 -d public     # servir la web en local
```

Se trabaja en la rama `development` y se pasa a `main` con una PR. Al fusionar en `main`, GitHub Actions
pasa los tests y publica `public/` en GitHub Pages.

## Estado: fase 1 (núcleo seguro)

- [x] Login con token personal y con GitHub OAuth (vía Worker), con renovación automática del token
- [x] Frase de paso, código de recuperación y cifrado E2E de notas, índice y credenciales locales
- [x] Crear, editar, renombrar, mover y borrar notas y carpetas; cada acción es un commit
- [x] Nombres de fichero aleatorios: el repo no revela títulos
- [x] Bloqueo automático tras 10 minutos sin actividad
- [x] Interfaz tipo Obsidian en escritorio y móvil, tema claro y oscuro
- [ ] Fase 2: backlinks, etiquetas, búsqueda de texto completo, editor con resaltado
- [ ] Fase 3: PWA y uso sin conexión
- [ ] Fase 4: grafo, notas diarias, plantillas, adjuntos
