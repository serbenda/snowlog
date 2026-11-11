---
description: Actualizar docs/CONTEXT.md y añadir la entrada al CHANGELOG
---
1. Revisa lo cambiado desde el último commit de documentación (`git log`, `git diff`).
2. Actualiza `docs/CONTEXT.md`: estado, decisiones y siguiente paso. Cambia la fecha de "Última actualización".
   Describe el estado real, no planes inventados.
3. Añade en `CHANGELOG.md`, bajo `[Sin publicar]`, las entradas en `Añadido`, `Cambiado`, `Corregido` o
   `Seguridad`, una línea por cambio y escritas para el usuario, no para el código.
4. No toques el `README.md` salvo que haya cambiado cómo se usa o se instala.
