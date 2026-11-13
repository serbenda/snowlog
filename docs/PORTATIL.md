# Snowlog portátil

Un único fichero, `snowlog-portable.html`, que se abre con doble clic. **No se instala nada y no necesita
internet.** Sirve en Windows y en Mac. Con Google Chrome o Microsoft Edge guarda las notas en una carpeta;
con Firefox o Safari, dentro del navegador.

## Conseguirlo

- Descárgalo de <https://snowlog.bendi.dev/snowlog-portable.html> (o desde el enlace *Descargar la versión
  portátil* de la pantalla de acceso).
- Guárdalo donde quieras: el escritorio, una carpeta de documentos o un pendrive.

## Usarlo

1. Abre `snowlog-portable.html` con Chrome o Edge (clic derecho → *Abrir con*). Con Firefox o Safari también
   funciona: ver más abajo.
2. Pulsa **Abrir una carpeta** y elige (o crea) la carpeta de tus notas. El navegador te pedirá permiso
   para modificarla: acéptalo.
3. La próxima vez verás **Continuar con «tu carpeta»**: un clic y estás dentro.
4. Menú ⋯ → **Configurar mi espacio** crea el panel, el diario y las plantillas. **Cargar ejemplos** añade
   un proyecto de ejemplo.

Funciona todo lo de la versión online: nota diaria, panel principal, consultas, calendario, plantillas,
enlaces entrantes e importar carpeta.

## Cómo guarda las notas

- Cada nota es un fichero `.md` normal dentro de tu carpeta, con sus subcarpetas: puedes abrirlas con
  cualquier editor, copiarlas o hacer copia de seguridad como cualquier documento.
- Lo que borras va a la subcarpeta `.trash`, de donde puedes recuperarlo a mano.
- No toca lo que no son notas (imágenes, PDF, `.obsidian`…).
- **Copia de seguridad (.zip)** en el menú ⋯ descarga todas las notas y adjuntos en un zip.
- Si cambias ficheros desde fuera mientras Snowlog está abierto (otro editor, OneDrive, Dropbox…), Snowlog
  lo ve al volver a la ventana y cada 10 segundos. **Recargar la carpeta** (menú ⋯) fuerza a mirarla entera.
- Cada nota guarda versiones anteriores en `.history` (como mucho una cada 10 minutos): menú ⋯ →
  **Historial de versiones**.

## Con Firefox o Safari

Estos navegadores no dejan elegir carpetas del disco. Snowlog ofrece **Guardar dentro del navegador**: las
notas se guardan en el almacenamiento del navegador de ese ordenador y siguen ahí la próxima vez que abras el
fichero. Ten en cuenta:

- Si borras los datos del navegador (o usas una ventana privada), se borran también las notas.
- Haz **Copia de seguridad (.zip)** de vez en cuando; Snowlog te lo recuerda.
- Para pasarlas a una carpeta o a la versión online, usa esa copia (ver *Pasar notas* más abajo).

## Seguridad

- La versión portátil **no puede conectarse a nada**: su política de seguridad prohíbe cualquier conexión
  de red. Ninguna nota sale de tu ordenador.
- Las notas **no se cifran** (a diferencia de la versión online): quedan protegidas por la sesión de tu
  ordenador, igual que el resto de tus documentos.
- Antes de usarla en el trabajo, comprueba que tu empresa permite abrir ficheros HTML descargados.

## Online y portátil, comparadas

| | Online (snowlog.bendi.dev) | Portátil (snowlog-portable.html) |
| --- | --- | --- |
| Dónde están las notas | Repo privado de GitHub, cifradas | Carpeta de tu ordenador, en `.md` |
| Internet | Necesario | No |
| Instalación | Ninguna | Ninguna |
| Varios dispositivos | Sí | No (es una carpeta local) |
| Cifrado | De extremo a extremo | No (protección del sistema) |
| Navegadores | Cualquiera moderno | Chrome o Edge (carpeta); Firefox o Safari (dentro del navegador) |

Desde la versión online también puedes usar una carpeta local con *Usar notas de este ordenador, sin GitHub*.
