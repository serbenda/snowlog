---
description: Independent second opinion on any decision, plan, idea or text. Two challengers that have not seen how it was reached attack it, and you get a side-by-side comparison with Claude's view.
argument-hint: "<what to challenge> (empty = the last proposal in this conversation)"
---

Challenge: $ARGUMENTS

Works for anything, not only code: a technical decision, a plan, a purchase, a text, a personal or work choice.

1. **What is being challenged.** If `$ARGUMENTS` is empty, take the last proposal, decision or recommendation in this conversation. If it is still unclear, ask me in one question.
2. **Write a standalone brief:** the proposal, the goal, the facts and constraints (from me, the repo or the conversation) and the options considered. **Leave out your reasoning and any wording that sells your preference**, so the challengers judge it cold. No secrets, tokens or personal data.
3. **Pick two lenses** that fit the topic and pull in different directions (for example: cost and simplicity vs. what fails; the end user vs. whoever maintains it; time vs. quality; security; money; impact on family or work).
4. **Launch two `challenger` subagents in parallel**, one per lens, each with the brief and its lens. If you can choose the subagent's model, use a **different model from this session** for at least one of them, so the second opinion does not share your criterion.
5. **Answer every objection honestly:** agree (and what you would change), partly, or disagree with a concrete reason. Do not defend the proposal by reflex: if you reject every objection, say so and justify each one.
6. **Show me the comparison**, in my language:

   | # | Objection (lens) | Severity | Challenger's alternative | Claude's view |
   |---|---|---|---|---|

   Then: the challengers' verdicts, where you all agree, where you disagree, the unanswered questions and your **final recommendation**: keep, adjust (what exactly) or rethink.
7. **I decide.** Change nothing until I do. If the challenge was about an ADR, add the summary to its *Challenge* section.
