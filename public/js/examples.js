// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Example project: shows how to organize a project with stories, meetings, knowledge pills
// and daily notes that link to each other and show up on the dashboard.
// Dates are relative to the day they are loaded.

import { formatDate, isoDate } from './templates.js';


export function exampleSpace({ dailyFolder = 'Daily', now = new Date() } = {}) {
  const P = 'Projects/Example - Recipe website';
  const H = `${P}/Stories`;
  const d = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const iso = (offset) => isoDate(d(offset));
  const long = (offset) => formatDate(d(offset), 'dddd, MMMM D, YYYY');
  const daily = (offset) => (dailyFolder ? `${dailyFolder}/${iso(offset)}` : iso(offset));
  const us = (n) => `${H}/${n}`;
  const US1 = 'US-01 Search recipes by ingredient';
  const US2 = 'US-02 Save favorite recipes';
  const US3 = 'US-03 Automatic shopping list';
  const US4 = 'US-04 Step-by-step cooking mode';
  const MEETING = `Meeting ${iso(-2)} Sprint 1 planning`;
  const PILL = 'Pill - Publish on GitHub Pages';

  const notes = [
    {
      path: `${P}/How to use this example`,
      text: `---
type: guide
tags:
  - example
---
# How to use this example

> [!tip] The idea
> A project is a folder. Inside it: a main note, its **stories**, its **meetings** and its knowledge **pills**. Day-to-day work goes in the **daily note**, linking to whatever you touch.

## How it is put together

| Piece | Where | What for |
| --- | --- | --- |
| Project note | [[Recipe website]] | Goal, status of the stories and open tasks |
| Stories | \`Stories/US-xx …\` | One per feature, with acceptance criteria as tasks |
| Board | [[Board]] | Stories grouped by status |
| Meetings | [[${MEETING}]] | Decisions and commitments (\`#commitment\`) |
| Pills | [[${PILL}]] | What you learn and want to be able to repeat |
| Daily | [[${daily(-1)}|yesterday]], [[${daily(0)}|today]] | What you did, linking stories |

## The flow

1. Each story has \`status\` (idea, to do, in progress, done), \`priority\` and \`points\` in its properties.
2. When you work on a story, change its \`status\` and tick its acceptance criteria.
3. In the daily note, write down what you do and link the story with \`[[US-02 Save favorite recipes]]\`.
4. What you promise to do gets \`#commitment\`; what you need to talk about, \`#to-discuss\`. It shows up on the **Home** dashboard until you tick it.
5. Open [[Recipe website]] in reading mode (Ctrl+E): the tables fill themselves in.

> [!info] Deleting the example
> When you no longer need it, delete the \`Projects/Example - Recipe website\` folder and the example daily notes from the tree (right click → Delete).
`,
    },
    {
      path: `${P}/Recipe website`,
      text: `---
date: ${iso(-3)}
type: project
status: active
area: Personal
tags:
  - project
  - example
---
# Recipe website

> [!abstract] Goal
> A simple website to find recipes from what is in my fridge, save the ones I like and get the shopping list. First version published on GitHub Pages before the end of the month.

## Stories

\`\`\`dataview
TABLE status AS "Status", priority AS "Priority", points AS "Points"
FROM "${H}"
SORT priority ASC
\`\`\`

## Open project tasks

\`\`\`dataview
TASK
FROM "${P}"
WHERE !completed
GROUP BY file.link
\`\`\`

## Decisions
- A static website on GitHub Pages, with no server. See [[${PILL}]].
- Recipes are stored in a JSON file in the repository itself (decided in [[${MEETING}]]).

## Links
- [[Board]] · [[How to use this example]]
`,
    },
    {
      path: `${P}/Board`,
      text: `---
type: board
tags:
  - example
---
# Story board

## In progress

\`\`\`dataview
LIST
FROM "${H}"
WHERE status = "in progress"
SORT priority ASC
\`\`\`

## To do

\`\`\`dataview
LIST
FROM "${H}"
WHERE status = "to do"
SORT priority ASC
\`\`\`

## Ideas

\`\`\`dataview
LIST
FROM "${H}"
WHERE status = "idea"
\`\`\`

## Done

\`\`\`dataview
LIST
FROM "${H}"
WHERE status = "done"
\`\`\`
`,
    },
    {
      path: us(US1),
      text: `---
type: story
project: "[[Recipe website]]"
status: done
priority: 1
points: 3
tags:
  - story
---
# ${US1}

> [!quote] Story
> **As** someone who cooks with what is at home, **I want** to search recipes by typing the ingredients I have, **so that** I do not need to go shopping.

## Acceptance criteria
- [x] I type one or more ingredients separated by commas
- [x] Recipes that use more of my ingredients come first
- [x] If there are no results, it says so clearly

## Notes
- Accent-insensitive search: “creme” finds “crème”.

## Log
- ${iso(-2)}: finished and tested on the phone. See [[${daily(-2)}]].
`,
    },
    {
      path: us(US2),
      text: `---
type: story
project: "[[Recipe website]]"
status: in progress
priority: 2
points: 5
tags:
  - story
---
# ${US2}

> [!quote] Story
> **As** a regular user, **I want** to mark recipes as favorites, **so that** I find them quickly next time.

## Acceptance criteria
- [x] A star button on each recipe
- [ ] Favorites are kept even if I close the browser
- [ ] A “My favorites” section on the home page

## Questions
- [ ] #to-discuss Store them in the browser or in an account? Talk it over with Blanca

## Log
- ${iso(-1)}: the star button is done. See [[${daily(-1)}]].
`,
    },
    {
      path: us(US3),
      text: `---
type: story
project: "[[Recipe website]]"
status: to do
priority: 3
points: 8
tags:
  - story
---
# ${US3}

> [!quote] Story
> **As** the one who does the weekend shopping, **I want** to pick several recipes and get the list of ingredients added up, **so that** I buy everything in one go.

## Acceptance criteria
- [ ] I can add recipes to “This week”
- [ ] Repeated ingredients are added up (2 + 1 eggs = 3 eggs)
- [ ] I can cross out what I already have
- [ ] I can share the list by WhatsApp

> [!warning] Risk
> Adding quantities with different units (grams and spoons). Start with matching units only.
`,
    },
    {
      path: us(US4),
      text: `---
type: story
project: "[[Recipe website]]"
status: idea
priority: 4
points: 5
tags:
  - story
---
# ${US4}

> [!quote] Story
> **As** someone cooking with messy hands, **I want** to see the recipe step by step in large type and with timers, **so that** I do not touch the screen all the time.

## Acceptance criteria
- [ ] One step per screen, in large type
- [ ] A timer on the steps that take time
- [ ] The screen does not turn off while I cook

## Ideas
- Move to the next step by voice (“next”).
`,
    },
    {
      path: `${P}/Meetings/${MEETING}`,
      text: `---
date: ${iso(-2)}
type: meeting
area: Personal
attendees: Blanca, me
tags:
  - meeting
---
# Sprint 1 planning

> [!info] Context
> **Date:** ${iso(-2)} · **Project:** [[Recipe website]]

## Agenda
- What goes into the first version
- Where we store the recipes

## Decisions
- First version: [[${US1}]] and [[${US2}]].
- [[${US3}]] moves to sprint 2.
- Recipes go in a JSON file inside the repository.

## Next actions
- [x] #commitment Set up the repository and publish an empty page
- [ ] #commitment Move 20 recipes into the JSON before Friday
- [ ] #to-discuss Ask Blanca for the recipes on her bar's menu
`,
    },
    {
      path: `${P}/${PILL}`,
      text: `---
date: ${iso(-3)}
type: knowledge-pill
area: Personal
technology: GitHub Pages
tags:
  - knowledge-pill
---
# Publish on GitHub Pages

> [!abstract] Summary
> Publish a static website from the \`public/\` folder with GitHub Actions, without a \`gh-pages\` branch.

## Solution
1. In the repository: **Settings → Pages → Source: GitHub Actions**.
2. Add a workflow that uploads \`public/\` and deploys it.
3. Every merge into \`main\` publishes on its own.

## Key commands

\`\`\`bash
git switch -c development
git push -u origin development
\`\`\`

## Check
- [x] The website answers at the Pages URL
- [x] No errors in the browser console

## References
- Used in [[Recipe website]].
`,
    },
    {
      path: daily(-2),
      text: `---
date: ${iso(-2)}
type: daily
tags:
  - daily
---
# ${long(-2)}

## Today's focus
- [x] Finish [[${US1}]]
- [x] Planning meeting

## Log

| Time | What | Area |
|------|------|------|
| 18:30 | Search by ingredients finished | Recipe website |
| 21:00 | [[${MEETING}]] | Recipe website |

## Notes and ideas
- Accent-insensitive search was easier than I thought.

## Commitments
- [x] #commitment Publish the empty page
`,
    },
    {
      path: daily(-1),
      text: `---
date: ${iso(-1)}
type: daily
tags:
  - daily
---
# ${long(-1)}

## Today's focus
- [x] Favorites button for [[${US2}]]
- [ ] Keep favorites in the browser

## Log

| Time | What | Area |
|------|------|------|
| 19:00 | Star button | Recipe website |

## Blockers
- Not sure whether to keep favorites in the browser or in an account.

## Commitments
- [ ] #commitment Send Blanca the website link

## To discuss
- [ ] #to-discuss Ask Blanca whether she wants to try it at the bar
`,
    },
    {
      path: daily(0),
      text: `---
date: ${iso(0)}
type: daily
tags:
  - daily
---
# ${long(0)}

## Today's focus
- [ ] Decide where to keep favorites ([[${US2}]])
- [ ] Review the [[Board]]

## Log

| Time | What | Area |
|------|------|------|
| | | |

## Notes and ideas
- Idea for later: [[${US4}]].

## Commitments
- [ ] #commitment Move 20 recipes into the JSON

## To discuss
- [ ]
`,
    },
  ];

  return { notes, folders: [P, H, `${P}/Meetings`, dailyFolder].filter(Boolean), root: P };
}
