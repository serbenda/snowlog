---
description: Records a numbered architecture or product decision (ADR) in docs/decisions/.
argument-hint: "<what needs deciding>"
---

Decision: $ARGUMENTS

1. Read `docs/decisions/README.md` and the accepted decisions. If one already covers this, cite it and ask me whether we want to supersede it.
2. Work out the next number (`NNNN`) and create `docs/decisions/NNNN-short-title.md` from `_template.md`.
3. Fill in the context with facts from the repo and the project, and at least **two real options** with honest pros and cons. If information is missing to compare them, say so instead of making it up.
4. Leave the status as **proposed**, with your recommendation under *Decision*.
5. **Challenge it before showing it to me:** follow steps 2-5 of `/challenge` on the recommendation and fill in the ADR's *Challenge* section, adding it above *Decision* if the ADR lacks it (objections, your view on each, whether the recommendation changed). Then show me the ADR and the comparison.
6. Once I accept it: status **accepted**, add it to the table in `docs/decisions/README.md` and, if it replaces another, mark the old one as "superseded by NNNN".
7. If the decision changes components or flows, update `docs/ARCHITECTURE.md`.
