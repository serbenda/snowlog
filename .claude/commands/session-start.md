---
description: Cargar el contexto de Snowlog y resumir el estado actual
---
1. Lee `CLAUDE.md`, `docs/CONTEXT.md`, `CHANGELOG.md` y `docs/DEFINITION-OF-DONE.md`.
2. Comprueba la rama (`git status -sb`), los últimos commits (`git log --oneline -10`) y que
   `git config user.name` / `user.email` sean los del dueño.
3. Ejecuta `npm test`.
4. Resume en pocas líneas: rama, estado de los tests, qué se hizo por última vez y cuál es el siguiente paso
   según `docs/CONTEXT.md`. No cambies nada.
