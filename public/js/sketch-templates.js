// Copied from serbenda/bsketch (js/templates.js, commit 0a573ca) by scripts/update-sketch.mjs. Do not edit here.
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. bsketch-7f3a9c2e
// Diagrams to start from. Each is written as text (an indented list or Mermaid) and drawn by textdiagram.js, so it
// stays small, editable and in the interface's language. `direction` overrides the text's own when given.

export const TEMPLATES = {
  flowchart: {
    name: { en: 'Flowchart', es: 'Diagrama de flujo', ca: 'Diagrama de flux', fr: 'Organigramme', pt: 'Fluxograma' },
    text: {
      en: 'graph TD\n  A([Start]) --> B[Receive the request]\n  B --> C{Is it complete?}\n  C -->|Yes| D[Process it]\n  C -->|No| E[Ask for what is missing]\n  E --> B\n  D --> F([End])',
      es: 'graph TD\n  A([Inicio]) --> B[Recibir la solicitud]\n  B --> C{¿Está completa?}\n  C -->|Sí| D[Tramitarla]\n  C -->|No| E[Pedir lo que falta]\n  E --> B\n  D --> F([Fin])',
      ca: 'graph TD\n  A([Inici]) --> B[Rebre la sol·licitud]\n  B --> C{És completa?}\n  C -->|Sí| D[Tramitar-la]\n  C -->|No| E[Demanar el que falta]\n  E --> B\n  D --> F([Fi])',
      fr: 'graph TD\n  A([Début]) --> B[Recevoir la demande]\n  B --> C{Est-elle complète ?}\n  C -->|Oui| D[La traiter]\n  C -->|Non| E[Demander ce qui manque]\n  E --> B\n  D --> F([Fin])',
      pt: 'graph TD\n  A([Início]) --> B[Receber o pedido]\n  B --> C{Está completo?}\n  C -->|Sim| D[Tratá-lo]\n  C -->|Não| E[Pedir o que falta]\n  E --> B\n  D --> F([Fim])',
    },
  },
  decision: {
    name: { en: 'Decision', es: 'Decisión', ca: 'Decisió', fr: 'Décision', pt: 'Decisão' },
    text: {
      en: 'graph LR\n  Q{Which option?} -->|A| A[Option A]\n  Q -->|B| B[Option B]\n  Q -->|C| C[Option C]\n  A --> R([Decide])\n  B --> R\n  C --> R',
      es: 'graph LR\n  Q{¿Qué opción?} -->|A| A[Opción A]\n  Q -->|B| B[Opción B]\n  Q -->|C| C[Opción C]\n  A --> R([Decidir])\n  B --> R\n  C --> R',
      ca: 'graph LR\n  Q{Quina opció?} -->|A| A[Opció A]\n  Q -->|B| B[Opció B]\n  Q -->|C| C[Opció C]\n  A --> R([Decidir])\n  B --> R\n  C --> R',
      fr: 'graph LR\n  Q{Quelle option ?} -->|A| A[Option A]\n  Q -->|B| B[Option B]\n  Q -->|C| C[Option C]\n  A --> R([Décider])\n  B --> R\n  C --> R',
      pt: 'graph LR\n  Q{Que opção?} -->|A| A[Opção A]\n  Q -->|B| B[Opção B]\n  Q -->|C| C[Opção C]\n  A --> R([Decidir])\n  B --> R\n  C --> R',
    },
  },
  architecture: {
    name: { en: 'Architecture', es: 'Arquitectura', ca: 'Arquitectura', fr: 'Architecture', pt: 'Arquitetura' },
    text: {
      en: 'graph LR\n  U([User]) --> W[Web app]\n  W --> API[API]\n  API --> DB[(Database)]\n  API --> Q[Queue]\n  Q --> J[Worker]\n  subgraph Server [Server]\n    API\n    DB\n    Q\n    J\n  end',
      es: 'graph LR\n  U([Usuario]) --> W[Aplicación web]\n  W --> API[API]\n  API --> DB[(Base de datos)]\n  API --> Q[Cola]\n  Q --> J[Proceso]\n  subgraph Server [Servidor]\n    API\n    DB\n    Q\n    J\n  end',
      ca: 'graph LR\n  U([Usuari]) --> W[Aplicació web]\n  W --> API[API]\n  API --> DB[(Base de dades)]\n  API --> Q[Cua]\n  Q --> J[Procés]\n  subgraph Server [Servidor]\n    API\n    DB\n    Q\n    J\n  end',
      fr: 'graph LR\n  U([Utilisateur]) --> W[Application web]\n  W --> API[API]\n  API --> DB[(Base de données)]\n  API --> Q[File]\n  Q --> J[Tâche]\n  subgraph Server [Serveur]\n    API\n    DB\n    Q\n    J\n  end',
      pt: 'graph LR\n  U([Utilizador]) --> W[Aplicação web]\n  W --> API[API]\n  API --> DB[(Base de dados)]\n  API --> Q[Fila]\n  Q --> J[Processo]\n  subgraph Server [Servidor]\n    API\n    DB\n    Q\n    J\n  end',
    },
  },
  mindmap: {
    name: { en: 'Mind map', es: 'Mapa mental', ca: 'Mapa mental', fr: 'Carte mentale', pt: 'Mapa mental' },
    direction: 'LR',
    text: {
      en: 'Project\n  Goals\n    Why\n    For whom\n  Tasks\n    Design\n    Build\n    Test\n  Risks\n  Dates',
      es: 'Proyecto\n  Objetivos\n    Por qué\n    Para quién\n  Tareas\n    Diseño\n    Desarrollo\n    Pruebas\n  Riesgos\n  Fechas',
      ca: 'Projecte\n  Objectius\n    Per què\n    Per a qui\n  Tasques\n    Disseny\n    Desenvolupament\n    Proves\n  Riscos\n  Dates',
      fr: 'Projet\n  Objectifs\n    Pourquoi\n    Pour qui\n  Tâches\n    Conception\n    Développement\n    Tests\n  Risques\n  Dates',
      pt: 'Projeto\n  Objetivos\n    Porquê\n    Para quem\n  Tarefas\n    Design\n    Desenvolvimento\n    Testes\n  Riscos\n  Datas',
    },
  },
  orgchart: {
    name: { en: 'Org chart', es: 'Organigrama', ca: 'Organigrama', fr: 'Organigramme hiérarchique', pt: 'Organograma' },
    direction: 'TD',
    text: {
      en: 'Director\n  Product\n    Design\n    Research\n  Engineering\n    Web\n    Mobile\n  Operations',
      es: 'Dirección\n  Producto\n    Diseño\n    Investigación\n  Ingeniería\n    Web\n    Móvil\n  Operaciones',
      ca: 'Direcció\n  Producte\n    Disseny\n    Recerca\n  Enginyeria\n    Web\n    Mòbil\n  Operacions',
      fr: 'Direction\n  Produit\n    Design\n    Recherche\n  Ingénierie\n    Web\n    Mobile\n  Opérations',
      pt: 'Direção\n  Produto\n    Design\n    Investigação\n  Engenharia\n    Web\n    Móvel\n  Operações',
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
