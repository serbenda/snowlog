---
description: Llevar development a main con una PR (o actualizar la abierta)
---
1. `npm test` en verde y `docs/DEFINITION-OF-DONE.md` cumplido.
2. Comprueba que ningún commit de `origin/main..development` tenga un autor distinto del dueño ni líneas
   `Co-Authored-By` o menciones a Claude.
3. Push de `development`.
4. Si ya hay una PR abierta de `development` a `main`, actualiza su descripción; si no, créala.
   Título en español; descripción con: qué cambia, cómo se ha probado y qué tiene que hacer el dueño.
   **Sin** pie de "Generated with Claude" ni enlaces de sesión.
5. No fusiones: la PR la fusiona el dueño.
