---
description: Creates a new phase file from the template and proposes the plan. Writes no code until the owner approves it.
argument-hint: "<what needs doing>"
---

Phase to plan: $ARGUMENTS

**Light mode** (`docs/STATE.md` → *Mode: light*): don't create a phase file. Read VISION and STATE, check the request against *What NOT to do*, explore the code read-only, propose a short plan (goal, what is out, how we'll know it works, security impact, steps) in chat and **wait for my approval**. Once approved, write it under *Current work* in STATE. Skip the numbered steps below.

**Full mode:**

1. Read `docs/VISION.md`, `docs/STATE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md` and the accepted decisions in `docs/decisions/`.
2. If the request clashes with the vision's **What NOT to do** section or with an accepted decision, **stop** and explain why, citing the document.
3. Work out the next phase number (`PNN`, global numbering) by looking at `docs/phases/` and `docs/ROADMAP.md`.
4. Explore the code the phase will touch (read-only) so the plan is realistic.
5. Create `docs/phases/PNN-short-title.md` from `docs/phases/_template.md` with: goal, scope (in / **out**), verifiable acceptance criteria, step-by-step plan, **security impact** (which threats it touches and how the controls are tested; if the phase adds the first code that handles input, accounts, personal data, money or network exposure and `docs/THREAT_MODEL.md` is still empty, filling it in is the first step of the plan) and risks. Status: ⬜ planned. If this is the local environment / stack tooling phase (P03 in the roadmap), copy every item of the *Stack checklist* in `docs/SETUP.md` into its acceptance criteria.
6. If the phase does not fit in one reviewable PR, propose splitting it in two.
7. Add the phase to the table in `docs/phases/README.md` and to its stage in `docs/ROADMAP.md`.
8. Show me a summary of the plan and **wait for my approval**. Do not write any code for the phase in this step.

Once I approve it: mark it ⏳ in progress, set the start date, add the approval with its date under *Owner approvals* in the phase file, and update "Current phase" in `docs/STATE.md`. Every later approval I give during the phase (a text, a design, a trade-off) is recorded there too, as soon as I give it.
