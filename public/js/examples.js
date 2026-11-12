// Proyecto de ejemplo: enseña cómo organizar un proyecto con historias, reuniones,
// píldoras y notas diarias que se enlazan entre sí y aparecen en el panel principal.
// Las fechas son relativas al día en que se cargan.

import { formatDate, isoDate } from './templates.js';


export function exampleSpace({ dailyFolder = 'Diario', now = new Date() } = {}) {
  const P = 'Proyectos/Ejemplo - Web de recetas';
  const H = `${P}/Historias`;
  const d = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const iso = (offset) => isoDate(d(offset));
  const long = (offset) => formatDate(d(offset), 'dddd, D [de] MMMM [de] YYYY');
  const daily = (offset) => (dailyFolder ? `${dailyFolder}/${iso(offset)}` : iso(offset));
  const hu = (n) => `${H}/${n}`;
  const HU1 = 'HU-01 Buscar recetas por ingrediente';
  const HU2 = 'HU-02 Guardar recetas favoritas';
  const HU3 = 'HU-03 Lista de la compra automática';
  const HU4 = 'HU-04 Modo cocina paso a paso';
  const MEETING = `Reunión ${iso(-2)} Planificación del sprint 1`;
  const PILL = 'Píldora - Publicar en GitHub Pages';

  const notes = [
    {
      path: `${P}/Cómo usar este ejemplo`,
      text: `---
type: guía
tags:
  - ejemplo
---
# Cómo usar este ejemplo

> [!tip] La idea
> Un proyecto es una carpeta. Dentro: una nota principal, sus **historias**, sus **reuniones** y sus **píldoras** de conocimiento. El día a día se apunta en la **nota diaria**, enlazando a lo que tocas.

## Cómo está montado

| Pieza | Dónde | Para qué |
| --- | --- | --- |
| Nota del proyecto | [[Web de recetas]] | Objetivo, estado de las historias y tareas abiertas |
| Historias | \`Historias/HU-xx …\` | Una por funcionalidad, con criterios de aceptación como tareas |
| Tablero | [[Tablero]] | Historias agrupadas por estado |
| Reuniones | [[${MEETING}]] | Decisiones y compromisos (\`#compromiso\`) |
| Píldoras | [[${PILL}]] | Lo que aprendes y quieres poder repetir |
| Diario | [[${daily(-1)}|ayer]], [[${daily(0)}|hoy]] | Qué has hecho, enlazando historias |

## El flujo

1. Cada historia lleva en sus propiedades \`estado\` (idea, pendiente, en curso, hecha), \`prioridad\` y \`puntos\`.
2. Al trabajar en una historia, cambia su \`estado\` y marca sus criterios de aceptación.
3. En la nota diaria, apunta lo que haces y enlaza la historia con \`[[HU-02 Guardar recetas favoritas]]\`.
4. Lo que prometes hacer va con \`#compromiso\`; lo que tienes que hablar, con \`#pendiente\`. Aparece en el panel **Inicio** hasta que lo marques.
5. Abre [[Web de recetas]] en modo lectura (Ctrl+E): las tablas se rellenan solas.

> [!info] Borrar el ejemplo
> Cuando ya no lo necesites, elimina la carpeta \`Proyectos/Ejemplo - Web de recetas\` y las notas diarias de ejemplo desde el árbol (clic derecho → Eliminar).
`,
    },
    {
      path: `${P}/Web de recetas`,
      text: `---
date: ${iso(-3)}
type: proyecto
status: activo
area: Personal
tags:
  - proyecto
  - ejemplo
---
# Web de recetas

> [!abstract] Objetivo
> Una web sencilla para buscar recetas por lo que tengo en la nevera, guardar las que me gustan y sacar la lista de la compra. Primera versión publicada en GitHub Pages antes de fin de mes.

## Historias

\`\`\`dataview
TABLE estado AS "Estado", prioridad AS "Prioridad", puntos AS "Puntos"
FROM "${H}"
SORT prioridad ASC
\`\`\`

## Tareas abiertas del proyecto

\`\`\`dataview
TASK
FROM "${P}"
WHERE !completed
GROUP BY file.link
\`\`\`

## Decisiones
- Web estática en GitHub Pages, sin servidor. Ver [[${PILL}]].
- Las recetas se guardan en un JSON del propio repo (decidido en [[${MEETING}]]).

## Enlaces
- [[Tablero]] · [[Cómo usar este ejemplo]]
`,
    },
    {
      path: `${P}/Tablero`,
      text: `---
type: tablero
tags:
  - ejemplo
---
# Tablero de historias

## En curso

\`\`\`dataview
LIST
FROM "${H}"
WHERE estado = "en curso"
SORT prioridad ASC
\`\`\`

## Pendiente

\`\`\`dataview
LIST
FROM "${H}"
WHERE estado = "pendiente"
SORT prioridad ASC
\`\`\`

## Ideas

\`\`\`dataview
LIST
FROM "${H}"
WHERE estado = "idea"
\`\`\`

## Hecho

\`\`\`dataview
LIST
FROM "${H}"
WHERE estado = "hecha"
\`\`\`
`,
    },
    {
      path: hu(HU1),
      text: `---
type: historia
proyecto: "[[Web de recetas]]"
estado: hecha
prioridad: 1
puntos: 3
tags:
  - historia
---
# ${HU1}

> [!quote] Historia
> **Como** persona que cocina con lo que hay en casa, **quiero** buscar recetas escribiendo los ingredientes que tengo, **para** no tener que ir a comprar.

## Criterios de aceptación
- [x] Escribo uno o varios ingredientes separados por comas
- [x] Salen primero las recetas que usan más ingredientes míos
- [x] Si no hay resultados, me lo dice claramente

## Notas
- Búsqueda sin tildes: «limon» encuentra «limón».

## Registro
- ${iso(-2)}: terminada y probada en el móvil. Ver [[${daily(-2)}]].
`,
    },
    {
      path: hu(HU2),
      text: `---
type: historia
proyecto: "[[Web de recetas]]"
estado: en curso
prioridad: 2
puntos: 5
tags:
  - historia
---
# ${HU2}

> [!quote] Historia
> **Como** usuario habitual, **quiero** marcar recetas como favoritas, **para** encontrarlas rápido la próxima vez.

## Criterios de aceptación
- [x] Botón de estrella en cada receta
- [ ] Las favoritas se guardan aunque cierre el navegador
- [ ] Una sección «Mis favoritas» en la portada

## Dudas
- [ ] #pendiente ¿Guardar en el navegador o en una cuenta? Hablarlo con Blanca

## Registro
- ${iso(-1)}: hecho el botón de estrella. Ver [[${daily(-1)}]].
`,
    },
    {
      path: hu(HU3),
      text: `---
type: historia
proyecto: "[[Web de recetas]]"
estado: pendiente
prioridad: 3
puntos: 8
tags:
  - historia
---
# ${HU3}

> [!quote] Historia
> **Como** quien hace la compra del fin de semana, **quiero** elegir varias recetas y obtener la lista de ingredientes sumados, **para** comprar todo de una vez.

## Criterios de aceptación
- [ ] Puedo añadir recetas a «Esta semana»
- [ ] Los ingredientes repetidos se suman (2 + 1 huevos = 3 huevos)
- [ ] Puedo tachar lo que ya tengo
- [ ] Puedo compartir la lista por WhatsApp

> [!warning] Riesgo
> Sumar cantidades con unidades distintas (gramos y cucharadas). Empezar solo con unidades iguales.
`,
    },
    {
      path: hu(HU4),
      text: `---
type: historia
proyecto: "[[Web de recetas]]"
estado: idea
prioridad: 4
puntos: 5
tags:
  - historia
---
# ${HU4}

> [!quote] Historia
> **Como** quien cocina con las manos manchadas, **quiero** ver la receta paso a paso en grande y con temporizadores, **para** no tocar la pantalla a cada rato.

## Criterios de aceptación
- [ ] Un paso por pantalla, con letra grande
- [ ] Temporizador en los pasos con tiempo
- [ ] La pantalla no se apaga mientras cocino

## Ideas
- Pasar de paso con la voz («siguiente»).
`,
    },
    {
      path: `${P}/Reuniones/${MEETING}`,
      text: `---
date: ${iso(-2)}
type: reunión
area: Personal
asistentes: Blanca, yo
tags:
  - reunión
---
# Planificación del sprint 1

> [!info] Contexto
> **Fecha:** ${iso(-2)} · **Proyecto:** [[Web de recetas]]

## Orden del día
- Qué entra en la primera versión
- Dónde guardamos las recetas

## Decisiones
- Primera versión: [[${HU1}]] y [[${HU2}]].
- [[${HU3}]] pasa al sprint 2.
- Las recetas, en un JSON dentro del repo.

## Próximas acciones
- [x] #compromiso Montar el repo y publicar una página vacía
- [ ] #compromiso Pasar 20 recetas al JSON antes del viernes
- [ ] #pendiente Pedir a Blanca sus recetas de la carta del bar
`,
    },
    {
      path: `${P}/${PILL}`,
      text: `---
date: ${iso(-3)}
type: píldora
area: Personal
tecnología: GitHub Pages
tags:
  - píldora
---
# Publicar en GitHub Pages

> [!abstract] Resumen
> Publicar una web estática desde la carpeta \`public/\` con GitHub Actions, sin rama \`gh-pages\`.

## Solución
1. En el repo: **Settings → Pages → Source: GitHub Actions**.
2. Añadir un workflow que suba \`public/\` y lo despliegue.
3. Cada fusión en \`main\` publica sola.

## Comandos clave

\`\`\`bash
git switch -c development
git push -u origin development
\`\`\`

## Comprobación
- [x] La web responde en la URL de Pages
- [x] Sin errores en la consola del navegador

## Referencias
- Se usó en [[Web de recetas]].
`,
    },
    {
      path: daily(-2),
      text: `---
date: ${iso(-2)}
type: diario
tags:
  - diario
---
# ${long(-2)}

## Foco de hoy
- [x] Terminar [[${HU1}]]
- [x] Reunión de planificación

## Registro

| Hora | Qué | Área |
|------|-----|------|
| 18:30 | Búsqueda por ingredientes terminada | Web de recetas |
| 21:00 | [[${MEETING}]] | Web de recetas |

## Notas e ideas
- La búsqueda sin tildes era más fácil de lo que pensaba.

## Compromisos
- [x] #compromiso Publicar la página vacía
`,
    },
    {
      path: daily(-1),
      text: `---
date: ${iso(-1)}
type: diario
tags:
  - diario
---
# ${long(-1)}

## Foco de hoy
- [x] Botón de favoritas de [[${HU2}]]
- [ ] Guardar favoritas en el navegador

## Registro

| Hora | Qué | Área |
|------|-----|------|
| 19:00 | Botón de estrella | Web de recetas |

## Bloqueos
- No sé si guardar las favoritas en el navegador o en una cuenta.

## Compromisos
- [ ] #compromiso Mandar a Blanca el enlace de la web

## Pendiente de hablar
- [ ] #pendiente Preguntar a Blanca si quiere probarla en el bar
`,
    },
    {
      path: daily(0),
      text: `---
date: ${iso(0)}
type: diario
tags:
  - diario
---
# ${long(0)}

## Foco de hoy
- [ ] Decidir dónde guardar las favoritas ([[${HU2}]])
- [ ] Revisar el [[Tablero]]

## Registro

| Hora | Qué | Área |
|------|-----|------|
| | | |

## Notas e ideas
- Idea para más adelante: [[${HU4}]].

## Compromisos
- [ ] #compromiso Pasar 20 recetas al JSON

## Pendiente de hablar
- [ ]
`,
    },
  ];

  return { notes, folders: [P, H, `${P}/Reuniones`, dailyFolder].filter(Boolean), root: P };
}
