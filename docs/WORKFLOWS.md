# Workflows

Every way of using this template, as diagrams. Start with the first one: it sends you to the right flow for
what you want to do. GitHub renders the diagrams; in an editor, use a Mermaid preview.

- [1. What do you want to do?](#1-what-do-you-want-to-do)
- [2. Start a new project](#2-start-a-new-project)
- [3. Light or full mode](#3-light-or-full-mode)
- [4. A working session with Claude](#4-a-working-session-with-claude)
- [5. A phase, in full mode](#5-a-phase-in-full-mode)
- [6. A piece of work, in light mode](#6-a-piece-of-work-in-light-mode)
- [7. A hard-to-undo decision](#7-a-hard-to-undo-decision)
- [8. From a change to `main`](#8-from-a-change-to-main)
- [9. Security: where each check runs](#9-security-where-each-check-runs)
- [10. When something is blocked](#10-when-something-is-blocked)
- [11. Before a release](#11-before-a-release)
- [12. Bring an existing project up to date](#12-bring-an-existing-project-up-to-date)
- [13. Update a third-party skill](#13-update-a-third-party-skill)

## 1. What do you want to do?

```mermaid
flowchart TD
    A{"What do you want to do?"} -->|"Start something new"| B["Start a new project · 2"]
    A -->|"Work on a project"| C["Working session · 4"]
    A -->|"Choose something hard to undo<br/>stack, database, auth, hosting"| D["Decision · 7"]
    A -->|"Get my changes into main"| E["From a change to main · 8"]
    A -->|"Publish a version"| F["Before a release · 11"]
    A -->|"A project made from an<br/>older version of the template"| G["Bring it up to date · 12"]
    A -->|"Claude or CI blocked me"| H["When something is blocked · 10"]
    C --> M{"Mode in docs/STATE.md"}
    M -->|"full"| P["Phase, full mode · 5"]
    M -->|"light"| L["Piece of work, light mode · 6"]
```

## 2. Start a new project

```mermaid
flowchart TD
    A["GitHub: Use this template<br/>Create a new repository"] --> B["git clone and cd"]
    B --> C{"Experiment or small tool?"}
    C -->|"yes"| D["MODE=light ./scripts/setup-repo.sh"]
    C -->|"no"| E["./scripts/setup-repo.sh"]
    D --> F
    E --> F["setup-repo.sh:<br/>authorship and git hooks, development branch,<br/>main ruleset with 6 required checks,<br/>Dependabot alerts, labels,<br/>empty CHANGELOG and WORKLOG"]
    F --> G{"Private repo on GitHub Free?"}
    G -->|"yes"| H["Warns and exits 1: main can't be protected.<br/>Make it public or use GitHub Pro"]
    G -->|"no"| I["Write docs/VISION.md<br/>(or dictate it to Claude and review it)"]
    I --> J["/decision project stack"]
    J --> K["Fill in docs/THREAT_MODEL.md<br/>before the first sensitive code"]
    K --> L["/new-phase local environment<br/>= P03 stack checklist"]
    L --> N["SETUP Verify, launch.json, CI job of the stack,<br/>Dependabot ecosystem, .gitignore"]
    N --> O["Owner: add the stack's CI job<br/>to the required checks of main"]
    O --> P["Day-to-day work: section 4"]
```

## 3. Light or full mode

```mermaid
flowchart TD
    A{"Does any of these hold?"} --> B["Someone else uses it"]
    A --> C["It is deployed"]
    A --> D["Personal data or money"]
    A --> E["More than a month of work"]
    A --> F["Another contributor"]
    B & C & D & E & F --> G["full mode"]
    A -->|"none"| H["light mode"]
    H --> I["Keeps VISION, STATE, WORKLOG,<br/>SETUP and THREAT_MODEL"]
    G --> J["Also ROADMAP, phase files, ADRs,<br/>RISKS, ARCHITECTURE and CHANGELOG"]
    H -. "/status proposes switching<br/>as soon as one holds" .-> G
```

## 4. A working session with Claude

```mermaid
flowchart TD
    A["Open Claude Code in the repo"] --> B["/status"]
    B --> C["Claude reads STATE, WORKLOG<br/>and ROADMAP and the phase in full mode"]
    C --> D{"What now?"}
    D -->|"New feature or block of work"| E["/new-phase what"]
    D -->|"Something hard to undo"| F["/decision what"]
    D -->|"Small fix within the approved plan"| G["Claude changes it, runs Verify,<br/>records-changes writes WORKLOG, commits"]
    D -->|"The work is finished"| H["/close-phase"]
    D -->|"Ready for main"| I["/prepare-pr"]
    E --> J{"Clashes with VISION<br/>What NOT to do or an ADR?"}
    J -->|"yes"| K["Claude stops and quotes it.<br/>You decide: drop it or change VISION/ADR"]
    J -->|"no"| L["Plan, then your approval, then code"]
```

## 5. A phase, in full mode

```mermaid
sequenceDiagram
    actor O as Owner
    participant C as Claude
    participant R as Reviewers
    participant G as GitHub CI
    O->>C: /new-phase what
    C->>C: read VISION, STATE, ROADMAP, ARCHITECTURE, THREAT_MODEL, ADRs
    C->>C: docs/phases/PNN-title.md with goal, In/Out,<br/>criteria, plan, security impact
    C-->>O: plan summary and open questions
    O->>C: approval and answers
    C->>C: record approval with date in the phase file
    loop each change
        C->>C: code + tests, Verify, WORKLOG entry
        C->>C: commit (pre-commit Gitleaks, commit-msg)
    end
    O->>C: /close-phase
    C->>C: Verify, check every criterion and owner approval
    C->>R: dod-reviewer
    R-->>C: READY or MISSING
    C->>C: Result, STATE, ROADMAP, CHANGELOG once, RISKS
    O->>C: /prepare-pr
    C->>C: phases closed? development has all of main?
    C->>R: dod, security and architecture reviewers
    R-->>C: verdicts and findings
    C-->>O: PR text from the PR template
    O->>C: confirm
    C->>G: push development, open PR
    G-->>O: 6 checks
    O->>G: merge
    O->>O: after the merge: DoD section 7
    O->>C: /status
    C->>C: merge origin/main into development
```

## 6. A piece of work, in light mode

```mermaid
flowchart TD
    A["/new-phase what"] --> B["Claude checks VISION and the code"]
    B --> C["Plan in chat: goal, what is out,<br/>how we'll know it works, security impact"]
    C --> D{"Your approval"}
    D -->|"changes"| C
    D -->|"approved"| E["Plan written under<br/>Current work in STATE"]
    E --> F["Code + tests, Verify, WORKLOG, commits"]
    F --> G["/close-phase"]
    G --> H["Verify, plan met,<br/>moved to Recently done, Next updated"]
    H --> I["No phase file, no CHANGELOG"]
```

## 7. A hard-to-undo decision

```mermaid
flowchart TD
    A["/decision what"] --> B{"An accepted ADR<br/>already covers it?"}
    B -->|"yes"| C["Claude quotes it and asks<br/>whether to supersede it"]
    B -->|"no"| D["docs/decisions/NNNN-title.md<br/>context, 2+ real options, pros and cons"]
    C -->|"supersede"| D
    D --> CH["Challenge: 2 challengers<br/>attack the recommendation cold"]
    CH --> E["Status proposed, with a recommendation<br/>and the challenge comparison"]
    E --> F{"You decide"}
    F -->|"accept"| G["Status accepted, indexed;<br/>the old one marked superseded"]
    F -->|"reject or change"| D
    G --> H["ARCHITECTURE updated<br/>if components or flows change"]
```

## 8. From a change to `main`

```mermaid
flowchart LR
    A["Change on development"] --> B["git commit"]
    B --> C{"pre-commit:<br/>Gitleaks"}
    C -->|"secret found"| X1["Commit refused"]
    C -->|"clean"| D{"commit-msg:<br/>AI signature, author"}
    D -->|"wrong author"| X2["Commit refused"]
    D -->|"ok"| E["git push<br/>(Claude asks first)"]
    E --> F["CI: Secrets, Hook, Records,<br/>SAST, Dependencies"]
    F --> G["/prepare-pr<br/>3 reviewers"]
    G --> H["PR development to main<br/>+ Authorship check"]
    H --> I{"6 checks green?"}
    I -->|"no"| X3["Merge blocked by the ruleset"]
    I -->|"yes"| J["Owner merges"]
```

## 9. Security: where each check runs

```mermaid
flowchart TB
    subgraph MAC["Your Mac: ~/.claude/settings.json"]
        M1["No reading secrets, browser data or keychain<br/>No editing its own settings, shell profile, git config<br/>No bypass-permissions mode, MCP needs approval"]
    end
    subgraph AGENT["Claude in the project"]
        A1["permissions deny / ask / allow"]
        A2["guard.sh hook and its tests"]
        A3["Sandbox: writes only in the project,<br/>allow-listed domains, no credential files"]
    end
    subgraph DESIGN["Before and during the code"]
        D1["THREAT_MODEL.md"]
        D2["Security impact per phase"]
        D3["Security DoD per project type"]
        D4["security-reviewer"]
    end
    subgraph GIT["Local git"]
        G1["pre-commit: Gitleaks"]
        G2["commit-msg: AI signature, author"]
    end
    subgraph GH["GitHub"]
        H1["CI: Secrets, Authorship, Hook,<br/>Records, SAST, Dependencies"]
        H2["Ruleset: PR + 6 green checks,<br/>no force-push, no deletion"]
        H3["Dependabot with 7-day cooldown"]
    end
    MAC --> AGENT --> DESIGN --> GIT --> GH
```

## 10. When something is blocked

```mermaid
flowchart TD
    A{"What blocked?"} -->|"guard.sh or a deny rule"| B["Claude stops and explains what it wanted.<br/>It never looks for another way"]
    B --> B1{"Was it legitimate?"}
    B1 -->|"no"| B2["Good: the control worked"]
    B1 -->|"yes"| B3["You run it yourself, or you change<br/>the rule in .claude/ (owner only)"]
    A -->|"Sandbox: domain or path"| C["Add the domain to sandbox.network.allowedDomains<br/>only if it is needed, on purpose"]
    A -->|"SAST finding"| D["Fix the code.<br/>False positive: nosemgrep + reason + owner approval"]
    A -->|"Dependencies finding"| E["Update the dependency to the fixed version"]
    A -->|"Records"| F["Add the WORKLOG entry, or trim STATE"]
    A -->|"Authorship"| G["Remove the AI signature or fix the author"]
    A -->|"A reviewer: MISSING or REVIEW"| H["Fix what it lists, then /prepare-pr again"]
```

## 11. Before a release

```mermaid
flowchart TD
    A["Stage S3: publish"] --> B{"Open High risks<br/>in RISKS.md?"}
    B -->|"yes"| X["Not yet: mitigate them"]
    B -->|"no"| C["Full audit with security-audit<br/>(only when the owner asks for it)"]
    C --> D{"Open confirmed findings?"}
    D -->|"yes"| X
    D -->|"no"| E["repo-security-posture:<br/>no Critical or High"]
    E --> F["Backups exist and a restore was tested"]
    F --> G["CHANGELOG: Unreleased to x.y.z,<br/>tag and GitHub release"]
```

## 12. Bring an existing project up to date

```mermaid
flowchart TD
    A["In the template repo"] --> B["scripts/sync-from-template.sh ../project"]
    B --> C["Report: NEW / CHANGED template-owned files,<br/>files to merge by hand,<br/>legacy Spanish files"]
    C --> D{"Apply?"}
    D -->|"no"| E["Nothing changed"]
    D -->|"yes"| F["Template committed; project on development<br/>or a branch, clean, no symlinks in the way"]
    F --> G["sync-from-template.sh ../project --apply"]
    G --> H["Template-owned files replaced,<br/>.claude/TEMPLATE_VERSION written"]
    H --> I["Merge settings.json, ci.yml, AGENTS.md…<br/>by hand, using --diff"]
    I --> J["./scripts/setup-repo.sh in the project,<br/>with the same variables,<br/>to update the rulesets"]
    J --> K["Tests, WORKLOG entry, owner commit<br/>with GUARDRAILS_OWNER_CHANGE=1, PR"]
```

## 13. Update a third-party skill

```mermaid
flowchart TD
    A["New upstream version"] --> B["git clone --depth 1 the source repo"]
    B --> C["Replace the whole skill folder;<br/>never edit it by hand"]
    C --> D["Review the diff:<br/>new scripts, network calls, instructions"]
    D --> E{"Anything suspicious?"}
    E -->|"yes"| F["Discard the update"]
    E -->|"no"| G["Update commit and date in UPSTREAM.md"]
    G --> H["WORKLOG entry, PR"]
```
