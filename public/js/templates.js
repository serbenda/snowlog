// Plantillas y nota diaria.
// Variables: {{title}}, {{date}}, {{date:FORMATO}}, {{time}}, {{time:FORMATO}}.
// FORMATO usa los códigos habituales: YYYY YY MMMM MMM MM M DD D dddd ddd HH H mm ss y [texto literal].

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pad = (n) => String(n).padStart(2, '0');

export function formatDate(d, fmt) {
  const tokens = {
    YYYY: () => String(d.getFullYear()),
    YY: () => String(d.getFullYear()).slice(-2),
    MMMM: () => MONTHS[d.getMonth()],
    MMM: () => MONTHS[d.getMonth()].slice(0, 3),
    MM: () => pad(d.getMonth() + 1),
    M: () => String(d.getMonth() + 1),
    dddd: () => DAYS[d.getDay()],
    ddd: () => DAYS[d.getDay()].slice(0, 3),
    DD: () => pad(d.getDate()),
    D: () => String(d.getDate()),
    HH: () => pad(d.getHours()),
    H: () => String(d.getHours()),
    mm: () => pad(d.getMinutes()),
    ss: () => pad(d.getSeconds()),
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|mm|ss/g, (m, lit) => (lit != null ? lit : tokens[m]()));
}

export const isoDate = (d) => formatDate(d, 'YYYY-MM-DD');

export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function applyTemplate(text, { title = '', date = new Date() } = {}) {
  return text.replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/gi, (_, kind, fmt) => {
    const k = kind.toLowerCase();
    if (k === 'title') return title;
    if (k === 'date') return formatDate(date, (fmt || 'YYYY-MM-DD').trim());
    return formatDate(date, (fmt || 'HH:mm').trim());
  });
}

export const dailyPath = (folder, date) => (folder ? `${folder}/${isoDate(date)}` : isoDate(date));

// ---------------------------------------------------------------------------
// Espacio inicial: la misma forma de trabajar que una bóveda de Obsidian con
// panel principal, nota diaria, proyectos, plantillas y archivo.

export const DAILY_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: diario
tags:
  - diario
---
# {{date:dddd, D [de] MMMM [de] YYYY}}

## Foco de hoy
- [ ]

## Registro

| Hora | Qué | Área |
|------|-----|------|
| {{time}} | | |

## Citas y reuniones
-

## Notas e ideas
-

## Bloqueos
-

## Compromisos
- [ ] #compromiso

## Pendiente de hablar
- [ ] #pendiente
`;

const NOTE_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: nota
area:
status: activo
tags:
---
# {{title}}

`;

const PROJECT_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: proyecto
status: activo
area:
tags:
  - proyecto
---
# {{title}}

> [!abstract] Objetivo
> Qué quiero conseguir y para cuándo.

## Próximos pasos
- [ ]

## Notas
-

## Enlaces
-
`;

const MEETING_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: reunión
area:
status: activo
asistentes:
tags:
  - reunión
---
# {{title}}

> [!info] Contexto
> **Fecha:** {{date:YYYY-MM-DD}} · **Área:**

## Asistentes
-

## Orden del día
-

## Notas
-

## Decisiones
-

## Próximas acciones
- [ ] #compromiso
`;

const PILL_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: píldora
area:
tecnología:
status: activo
tags:
  - píldora
---
# {{title}}

> [!abstract] Resumen
> El problema y su solución en dos líneas.

## Problema / contexto


## Solución


## Comandos clave

\`\`\`bash

\`\`\`

## Comprobación

\`\`\`bash

\`\`\`

## Referencias
-
`;

const PROCEDURE_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: procedimiento
area:
status: activo
revisión: trimestral
tags:
  - procedimiento
---
# {{title}}

> [!abstract] Objetivo
> Qué consigue este procedimiento y cuándo se usa.

## Antes de empezar
- [ ]

## Pasos

### 1.

\`\`\`bash

\`\`\`

## Comprobación
- [ ]

## Si algo sale mal
-
`;

const HOME = `---
cssclasses: dashboard
type: panel
---
> [!tip] Cómo funciona
> En la nota diaria, marca con #compromiso lo que te comprometes a hacer y con #pendiente lo que tienes que hablar con alguien. Aparece aquí hasta que lo marques como hecho, desde aquí mismo.

- Empezar
    - Pulsa **Hoy** (o Ctrl+D) para la nota diaria
    - Ctrl+O para buscar o crear una nota
- Plantillas
    - [[Plantillas/Nota diaria|Nota diaria]]
    - [[Plantillas/Proyecto|Proyecto]]
    - [[Plantillas/Reunión|Reunión]]
- Más plantillas
    - [[Plantillas/Píldora de conocimiento|Píldora de conocimiento]]
    - [[Plantillas/Procedimiento|Procedimiento]]
    - [[Plantillas/Nota|Nota]]

## Foco de hoy

\`\`\`dataview
TASK
FROM "Diario"
WHERE file.day = date(today) AND !completed AND !contains(text, "#compromiso") AND !contains(text, "#pendiente")
\`\`\`

## Compromisos abiertos

\`\`\`dataview
TASK
WHERE contains(text, "#compromiso") AND !completed
GROUP BY file.link
\`\`\`

## Pendiente de hablar

\`\`\`dataview
TASK
WHERE contains(text, "#pendiente") AND !completed
GROUP BY file.link
\`\`\`

## Proyectos activos

\`\`\`dataview
TABLE area AS "Área", status AS "Estado"
FROM "Proyectos"
WHERE status = "activo"
SORT file.mtime DESC
\`\`\`

## Últimos días

\`\`\`dataview
LIST
FROM "Diario"
SORT file.name DESC
LIMIT 7
\`\`\`
`;

// Notas y carpetas que crea "Configurar mi espacio". Las rutas usan las carpetas configuradas.
export function starterSpace({ home = 'Inicio', dailyFolder = 'Diario', templatesFolder = 'Plantillas' } = {}) {
  const t = (name) => `${templatesFolder}/${name}`;
  const fix = (text) => text
    .replaceAll('FROM "Diario"', `FROM "${dailyFolder}"`)
    .replaceAll('[[Plantillas/', `[[${templatesFolder}/`);
  return {
    folders: ['Proyectos', 'Archivo', dailyFolder, templatesFolder],
    notes: [
      { path: home, text: fix(HOME) },
      { path: t('Nota diaria'), text: DAILY_TEMPLATE },
      { path: t('Nota'), text: NOTE_TEMPLATE },
      { path: t('Proyecto'), text: PROJECT_TEMPLATE },
      { path: t('Reunión'), text: MEETING_TEMPLATE },
      { path: t('Píldora de conocimiento'), text: PILL_TEMPLATE },
      { path: t('Procedimiento'), text: PROCEDURE_TEMPLATE },
    ],
  };
}
