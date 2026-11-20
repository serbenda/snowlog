// Copied from serbenda/bsketch (js/templates.js, commit fe1613f) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// Diagrams to start from. Each is written as text (an indented list or Mermaid) and drawn by textdiagram.js, so it
// stays small, editable and in the interface's language. `direction` overrides the text's own when given.

export const TEMPLATES = {
  flowchart: {
    name: { en: 'Flowchart', es: 'Diagrama de flujo' },
    text: {
      en: 'graph TD\n  A([Start]) --> B[Receive the request]\n  B --> C{Is it complete?}\n  C -->|Yes| D[Process it]\n  C -->|No| E[Ask for what is missing]\n  E --> B\n  D --> F([End])',
      es: 'graph TD\n  A([Inicio]) --> B[Recibir la solicitud]\n  B --> C{¿Está completa?}\n  C -->|Sí| D[Tramitarla]\n  C -->|No| E[Pedir lo que falta]\n  E --> B\n  D --> F([Fin])',
    },
  },
  decision: {
    name: { en: 'Decision', es: 'Decisión' },
    text: {
      en: 'graph LR\n  Q{Which option?} -->|A| A[Option A]\n  Q -->|B| B[Option B]\n  Q -->|C| C[Option C]\n  A --> R([Decide])\n  B --> R\n  C --> R',
      es: 'graph LR\n  Q{¿Qué opción?} -->|A| A[Opción A]\n  Q -->|B| B[Opción B]\n  Q -->|C| C[Opción C]\n  A --> R([Decidir])\n  B --> R\n  C --> R',
    },
  },
  architecture: {
    name: { en: 'Architecture', es: 'Arquitectura' },
    text: {
      en: 'graph LR\n  U([User]) --> W[Web app]\n  W --> API[API]\n  API --> DB[(Database)]\n  API --> Q[Queue]\n  Q --> J[Worker]\n  subgraph Server [Server]\n    API\n    DB\n    Q\n    J\n  end',
      es: 'graph LR\n  U([Usuario]) --> W[Aplicación web]\n  W --> API[API]\n  API --> DB[(Base de datos)]\n  API --> Q[Cola]\n  Q --> J[Proceso]\n  subgraph Server [Servidor]\n    API\n    DB\n    Q\n    J\n  end',
    },
  },
  mindmap: {
    name: { en: 'Mind map', es: 'Mapa mental' },
    direction: 'LR',
    text: {
      en: 'Project\n  Goals\n    Why\n    For whom\n  Tasks\n    Design\n    Build\n    Test\n  Risks\n  Dates',
      es: 'Proyecto\n  Objetivos\n    Por qué\n    Para quién\n  Tareas\n    Diseño\n    Desarrollo\n    Pruebas\n  Riesgos\n  Fechas',
    },
  },
  orgchart: {
    name: { en: 'Org chart', es: 'Organigrama' },
    direction: 'TD',
    text: {
      en: 'Director\n  Product\n    Design\n    Research\n  Engineering\n    Web\n    Mobile\n  Operations',
      es: 'Dirección\n  Producto\n    Diseño\n    Investigación\n  Ingeniería\n    Web\n    Móvil\n  Operaciones',
    },
  },
};

// A template's name and text in a language (English when it has no translation).
export function template(id, lang = 'en') {
  const t = Object.hasOwn(TEMPLATES, id) ? TEMPLATES[id] : null;
  if (!t) return null;
  const pick = (m) => (Object.hasOwn(m, lang) ? m[lang] : m.en);
  return { id, name: pick(t.name), text: pick(t.text), direction: t.direction };
}
