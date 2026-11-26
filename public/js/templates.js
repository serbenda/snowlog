// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Templates and the daily note.
// Variables: {{title}}, {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}.
// FORMAT uses the usual codes: YYYY YY MMMM MMM MM M DD D dddd ddd HH H mm ss and [literal text].

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
// Starter space: a dashboard, a daily note, projects, templates and an archive.

export const DAILY_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: daily
tags:
  - daily
---
# {{date:dddd, MMMM D, YYYY}}

## Today's focus
- [ ]

## Log

| Time | What | Area |
|------|------|------|
| {{time}} | | |

## Appointments and meetings
-

## Notes and ideas
-

## Blockers
-

## Commitments
- [ ] #commitment

## To discuss
- [ ] #to-discuss
`;

const NOTE_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: note
area:
status: active
tags:
---
# {{title}}

`;

const PROJECT_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: project
status: active
area:
tags:
  - project
---
# {{title}}

> [!abstract] Goal
> What I want to achieve, and by when.

## Next steps
- [ ]

## Notes
-

## Links
-
`;

const MEETING_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: meeting
area:
status: active
attendees:
tags:
  - meeting
---
# {{title}}

> [!info] Context
> **Date:** {{date:YYYY-MM-DD}} · **Area:**

## Attendees
-

## Agenda
-

## Notes
-

## Decisions
-

## Next actions
- [ ] #commitment
`;

const PILL_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: knowledge-pill
area:
technology:
status: active
tags:
  - knowledge-pill
---
# {{title}}

> [!abstract] Summary
> The problem and its solution in two lines.

## Problem / context


## Solution


## Key commands

\`\`\`bash

\`\`\`

## Check

\`\`\`bash

\`\`\`

## References
-
`;

const PROCEDURE_TEMPLATE = `---
date: {{date:YYYY-MM-DD}}
type: procedure
area:
status: active
review: quarterly
tags:
  - procedure
---
# {{title}}

> [!abstract] Goal
> What this procedure achieves and when it is used.

## Before you start
- [ ]

## Steps

### 1.

\`\`\`bash

\`\`\`

## Check
- [ ]

## If something goes wrong
-
`;

const HOME = `---
cssclasses: dashboard
type: dashboard
---
> [!tip] How it works
> In the daily note, tag what you commit to doing with #commitment and what you need to talk to someone about with #to-discuss. It shows up here until you tick it off, right from this page.

- Get started
    - Press **Today** (or Ctrl+D) for the daily note
    - Ctrl+O to find or create a note
- Templates
    - [[Templates/Daily note|Daily note]]
    - [[Templates/Project|Project]]
    - [[Templates/Meeting|Meeting]]
- More templates
    - [[Templates/Knowledge pill|Knowledge pill]]
    - [[Templates/Procedure|Procedure]]
    - [[Templates/Note|Note]]

## Today's focus

\`\`\`dataview
TASK
FROM "Daily"
WHERE file.day = date(today) AND !completed AND !contains(text, "#commitment") AND !contains(text, "#to-discuss")
\`\`\`

## Open commitments

\`\`\`dataview
TASK
WHERE contains(text, "#commitment") AND !completed
GROUP BY file.link
\`\`\`

## To discuss

\`\`\`dataview
TASK
WHERE contains(text, "#to-discuss") AND !completed
GROUP BY file.link
\`\`\`

## Active projects

\`\`\`dataview
TABLE area AS "Area", status AS "Status"
FROM "Projects"
WHERE status = "active"
SORT file.mtime DESC
\`\`\`

## Recent days

\`\`\`dataview
LIST
FROM "Daily"
SORT file.name DESC
LIMIT 7
\`\`\`
`;

// Notes and folders created by "Set up my space". Paths use the configured folders.
export function starterSpace({ home = 'Home', dailyFolder = 'Daily', templatesFolder = 'Templates' } = {}) {
  const t = (name) => `${templatesFolder}/${name}`;
  const fix = (text) => text
    .replaceAll('FROM "Daily"', `FROM "${dailyFolder}"`)
    .replaceAll('[[Templates/', `[[${templatesFolder}/`);
  return {
    folders: ['Projects', 'Archive', dailyFolder, templatesFolder],
    notes: [
      { path: home, text: fix(HOME) },
      { path: t('Daily note'), text: DAILY_TEMPLATE },
      { path: t('Note'), text: NOTE_TEMPLATE },
      { path: t('Project'), text: PROJECT_TEMPLATE },
      { path: t('Meeting'), text: MEETING_TEMPLATE },
      { path: t('Knowledge pill'), text: PILL_TEMPLATE },
      { path: t('Procedure'), text: PROCEDURE_TEMPLATE },
    ],
  };
}

// Folder and note names used before the interface was translated to English. A vault that already
// has them, and has not chosen its own names in Settings, keeps using them.
export const LEGACY_WORKSPACE = {
  home: 'Inicio',
  dailyFolder: 'Diario',
  templatesFolder: 'Plantillas',
  attachmentsFolder: 'Adjuntos',
  drawingsFolder: 'Dibujos',
  dailyTemplate: 'Plantillas/Nota diaria',
};

// Settings in force: the defaults, then the legacy names the vault already uses, then the vault's own.
// index: the vault index ({ notes, files, folders }), whose paths say which legacy names are in use.
export function workspaceSettings(defaults, stored = {}, index = {}) {
  const paths = [
    ...Object.values(index.notes || {}).map((n) => n.path),
    ...Object.values(index.files || {}).map((f) => f.path),
    ...(index.folders || []),
  ].filter(Boolean).map((p) => p.toLowerCase());
  const inUse = (name) => {
    const n = name.toLowerCase();
    return paths.some((p) => p === n || p.startsWith(`${n}/`));
  };
  const out = { ...defaults };
  for (const [key, legacy] of Object.entries(LEGACY_WORKSPACE)) {
    if (key in defaults && !(key in stored) && inUse(legacy)) out[key] = legacy;
  }
  return { ...out, ...stored };
}
