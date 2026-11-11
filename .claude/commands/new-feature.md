---
description: Añadir o ajustar una funcionalidad con cambios mínimos y verificados
argument-hint: <qué quieres añadir>
---
Funcionalidad: $ARGUMENTS

1. Asegúrate de estar en `development` y al día con `origin/development`.
2. Lee los ficheros afectados y propone en 3-5 líneas el cambio más pequeño que lo resuelva.
   Si toca cifrado, CSP o el formato del repo de notas, explica el riesgo y espera confirmación.
3. Implementa siguiendo las reglas de `CLAUDE.md` (sin dependencias nuevas, todo en español).
4. Añade tests y ejecuta `npm test`. Si cambia la interfaz, pruébala en el navegador (escritorio y móvil).
5. Repasa `docs/DEFINITION-OF-DONE.md` y ejecuta `/update-context`.
6. Commit en `development` firmado solo por el dueño, sin atribución a Claude, y push.
