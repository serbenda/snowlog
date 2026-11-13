# Seguridad de Snowlog

Revisión del cifrado, de la CSP y de lo que queda en el dispositivo. Fecha: 2026-11-13.

> **Importante:** es una revisión interna, hecha con el código delante. La Definition of Done pide además una
> revisión **independiente** (una persona que no haya escrito el código). Este documento sirve de punto de
> partida para esa revisión.

## Qué protege y frente a quién

| Quién | Qué puede ver o hacer | Protección |
| --- | --- | --- |
| Alguien que lee el repo de notas (fuga, token robado, GitHub) | Ficheros cifrados, número de notas y tamaños, fechas de los commits | AES-256-GCM con una DEK aleatoria; nombres de fichero aleatorios; rutas y títulos dentro del índice cifrado |
| Alguien con acceso de **escritura** al repo | Borrar o volver a poner versiones antiguas de un fichero cifrado | El AAD (id del fichero) impide mover contenido de un fichero a otro; **no** se detecta que se repongan versiones antiguas del mismo fichero (ver riesgos aceptados) |
| Alguien con el ordenador o el móvil, sin la frase | `vault.json` en `localStorage`, caché cifrada en IndexedDB, credenciales cifradas | Todo cifrado con la DEK; para sacarla hace falta la frase (PBKDF2-SHA256, 600.000 iteraciones) |
| Una página maliciosa que mete Snowlog en un iframe | Engañar con clics | Snowlog no arranca dentro de un iframe |
| Una nota con contenido hostil (importada, pegada) | Intentar ejecutar código | `markdown.js` escapa todo antes de dar formato; CSP sin `unsafe-inline`; Trusted Types |

## Cifrado (`crypto.js`)

- DEK de 256 bits de `crypto.getRandomValues`, importada como no extraíble.
- AES-GCM con IV de 12 bytes aleatorio por cada cifrado. AAD: el id del fichero (`n/<id>`, `a/<id>`), o
  `index`, `outbox`, `expanded`, `snowlog-backup` según el tipo. Un fichero cambiado de sitio no se descifra.
- La DEK se guarda envuelta dos veces en `vault.json`: con la frase de paso y con el código de recuperación
  (125 bits, alfabeto de 32 símbolos sin sesgo). PBKDF2-SHA256 con 600.000 iteraciones (lo que recomienda
  OWASP para PBKDF2). WebCrypto no tiene Argon2.
- Cambiar la frase y generar un código nuevo solo vuelven a envolver la DEK. Al cambiar la frase se suben las
  iteraciones si la configuración pide más.

Comprobado con tests: IV distinto cada vez, AAD equivocado falla, `vault.json` sin la clave en claro, frase
antigua rechazada tras cambiarla, código antiguo rechazado tras renovarlo, copias manipuladas rechazadas.

## Qué queda en el dispositivo

| Dónde | Qué | ¿En claro? |
| --- | --- | --- |
| `localStorage` | `vault.json` (claves envueltas, sales), credenciales de GitHub cifradas, id de la última nota, carpetas abiertas cifradas, fecha de la última copia, paneles abiertos | Solo datos no sensibles; nombres de carpetas y tokens van cifrados |
| IndexedDB `snowlog-cache` | Notas, adjuntos, índice y cambios pendientes, tal como están en el repo | No: todo cifrado con la DEK |
| Caché del service worker | La propia web (HTML, CSS, JS, icono) | Sí, pero no contiene datos |
| `sessionStorage` | El `state` del login con GitHub, mientras dura | No es secreto |
| Memoria | DEK, notas descifradas | Se borran al bloquear |

Al bloquear (a mano o tras 10 minutos) se vacían el editor, la vista de lectura, el resaltado, el árbol, el
esquema, los enlaces entrantes, la búsqueda, las etiquetas, los avisos, los diálogos abiertos, las migas, el
título de la pestaña y las URL `blob:` de los adjuntos.

## CSP y ejecución de código

Online (`index.html`):

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self';
connect-src https://api.github.com https://snowlog-auth.serbenda.workers.dev; manifest-src 'self';
worker-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types snowlog
```

Portátil: `script-src` y `style-src` por hash, `connect-src 'none'`, mismas reglas de Trusted Types.

- Sin `unsafe-inline` ni `unsafe-eval`. Sin dependencias ni CDN.
- **Trusted Types:** todo `innerHTML` pasa por la política `snowlog`, que solo recibe HTML ya escapado
  (`markdown.js`, `editor.js`, `query.js`) o iconos propios. Un `innerHTML` nuevo sin pasar por ella falla en
  el navegador y en los tests (`tests/csp.test.mjs`).
- Enlaces de las notas: solo `http(s)`, `mailto` y anclas, con `rel="noopener noreferrer"`.
- Adjuntos: solo imágenes y PDF (nada de SVG ni HTML). Las imágenes se muestran como `data:`; los PDF se abren
  con una URL `blob:` de tipo `application/pdf`.
- El service worker solo guarda la web (mismo origen) y nunca respuestas de GitHub ni del login.

## Hallazgos de esta revisión

| # | Hallazgo | Gravedad | Estado |
| --- | --- | --- | --- |
| 1 | `connect-src` permitía cualquier `*.workers.dev`: con un fallo de XSS se podrían sacar datos a otro Worker | Media | **Resuelto:** solo el Worker configurado (un test lo comprueba) |
| 2 | Sin protección ante iframes (GitHub Pages no deja enviar `frame-ancestors`) | Media | **Resuelto:** no arranca dentro de un iframe |
| 3 | Al bloquear quedaban el nombre de la nota en el título de la pestaña y en las migas, y los diálogos abiertos (p. ej. el historial con su vista previa) | Media | **Resuelto:** se vacían al bloquear |
| 4 | Los nombres de las carpetas abiertas se guardaban en claro en `localStorage` | Baja | **Resuelto:** cifrados con la DEK (en local siguen en claro, como los propios ficheros) |
| 5 | Sin Trusted Types: un `innerHTML` nuevo descuidado podría abrir un XSS | Baja (defensa en profundidad) | **Resuelto:** CSP con Trusted Types y test que lo vigila |
| 6 | Los avisos podían mostrar nombres de notas después de bloquear | Baja | **Resuelto:** se vacían al bloquear |
| 7 | Tras cambiar la frase en otro dispositivo, aquí seguía valiendo la antigua (por el `vault.json` guardado) | Media | **Resuelto:** al desbloquear se compara con el del repo y se exige la nueva |
| 8 | No había forma de dejar inservible una clave que pudo conocerse | Media | **Resuelto:** rotación de la DEK desde la app |

## Riesgos aceptados y pendientes

- **Reposición de versiones antiguas:** quien pueda escribir en el repo podría volver a poner una versión
  anterior cifrada de una nota o del índice. No puede leerla ni falsificar contenido nuevo. Detectarlo
  exigiría firmar el índice con un contador; se deja para más adelante.
- **Rotar la clave:** «Cambiar la clave de cifrado» recifra todo con una DEK nueva (un commit, ficheros subidos
  como blobs) y renueva el código de recuperación. Lo que se escriba después no se puede abrir con la frase o la
  DEK antiguas. **Límite:** las versiones antiguas siguen en el historial de git cifradas con la clave de entonces;
  quien tenga la frase antigua y acceso al repo aún podría leer esas versiones antiguas (no las nuevas). Para
  borrarlas haría falta reescribir el historial del repo (fuera de la app). Las claves antiguas se guardan en
  `.snowlog/keyring.enc`, cifradas con la actual, para que la app pueda seguir mostrando el historial.
- **Login sin PKCE:** el login con GitHub usa `state`, pero no PKCE. GitHub ya lo admite; añadirlo requiere
  cambiar también el Worker. Gravedad baja (el `code` solo sirve con el client secret, que está en el Worker).
- **Metadatos visibles en GitHub:** número de ficheros, tamaños aproximados y horas de los commits.
- **Navegador comprometido o extensiones con permiso sobre la web:** pueden leer lo que se ve en pantalla. Fuera
  del alcance de una web.

## Cómo comprobarlo

```bash
npm test   # incluye crypto, csp, backup, caché, sin conexión y conflictos
```

Y en el navegador: la consola no debe mostrar infracciones de CSP ni de Trusted Types en ningún recorrido.
