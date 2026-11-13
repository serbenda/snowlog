# Hoja de ruta

Estado (2026-11-13): las tres fases están hechas en `development`. Quedan pendientes la revisión de seguridad
por una persona externa y probar la portátil en Firefox y Safari reales.

Punto de partida: base sólida (cifrado, versión online y portátil, día a día con nota diaria, panel y consultas).
Para llegar a un 10/10 se plantearon tres fases. Los criterios para dar cada punto por terminado están en
[DEFINITION-OF-DONE.md](DEFINITION-OF-DONE.md).

## Fase 1: Imprescindible (de 6,5 a 8,5)

Lo que se nota cada día al escribir y lo que evita perder trabajo.

| Punto | Por qué |
| --- | --- |
| Renombrar actualiza enlaces | Hoy renombrar rompe los `[[enlaces]]` que apuntaban a la nota |
| Editor de verdad | El editor es un cuadro de texto plano: sin resaltado, sin continuar listas, sin autocompletar `[[` |
| Búsqueda y etiquetas | Encontrar algo hoy exige recordar el título |
| Adjuntos | Imágenes y PDF son parte normal de las notas |
| Conflictos entre dispositivos | Editar la misma nota en dos sitios puede perder texto: gana el último en guardar |

## Fase 2: Confianza (de 8,5 a 9,5)

Poder fiarse de Snowlog con años de notas.

| Punto | Por qué |
| --- | --- |
| Historial y restaurar | Git ya guarda cada versión cifrada, pero no se puede ver ni recuperar desde la app |
| Cambiar la frase de paso | Hoy solo se puede con el código de recuperación |
| Copias de seguridad | Que no dependan de acordarse |
| Rendimiento | Al entrar se descifran todas las notas; cada guardado es un commit |
| Online sin conexión | Usar la versión online en el metro o en un avión |
| Revisión de seguridad | Un cifrado propio debe revisarlo alguien externo |

## Fase 3: Pulido (de 9,5 a 10)

| Punto | Por qué |
| --- | --- |
| Ajustes en la app | Cambiar carpetas o plantillas sin tocar código |
| Paleta de comandos, marcadores, vista previa | Ir rápido sin ratón |
| Kanban y grafo | Lo que se tenía en Obsidian |
| Portátil en Safari y Firefox | Hoy solo Chrome y Edge |
| Pasar notas entre portátil y online | Mover un proyecto de una a otra |
| Tests de navegador en la CI | Que las pruebas de interfaz se ejecuten solas |
