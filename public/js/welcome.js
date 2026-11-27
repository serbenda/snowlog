// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// The first note of a new vault, in the interface's language (its title and its Markdown). The syntax shown inside
// (callout types, table pipes, [[links]]) is the same in every language: it is what the reader types.

const en = {
  title: 'Welcome',
  text: `Your personal notebook, end-to-end encrypted.

## The basics
- Notes save themselves when you stop typing.
- **Ctrl+E** switches between editing and reading.
- **Ctrl+O** opens the quick note switcher.
- **Ctrl+N** creates a new note.
- Press **?** for help and every keyboard shortcut.
- Link notes with [[Another note]]: if it does not exist, it is created when you click it.

## Formatting
- [x] Task lists
- **Bold**, *italic*, ~~strikethrough~~ and ==highlight==
- \`inline code\` and code blocks

| Format | How to write it |
| --- | --- |
| Table | \`| a | b |\` and below it \`|---|---|\` |
| Callout | \`> [!tip] Title\` |
| Tag | #idea |

> [!tip] Callouts
> Use [!note], [!info], [!warning], [!danger], [!example]… and add - to fold them.

> [!info] Truly private
> The repository only holds unreadable files. Without your passphrase, nobody can read this.
`,
};

const es = {
  title: 'Bienvenida',
  text: `Tu cuaderno personal, cifrado de extremo a extremo.

## Lo básico
- Las notas se guardan solas cuando dejas de escribir.
- **Ctrl+E** cambia entre editar y leer.
- **Ctrl+O** abre el selector rápido de notas.
- **Ctrl+N** crea una nota nueva.
- Pulsa **?** para ver la ayuda y todos los atajos de teclado.
- Enlaza notas con [[Otra nota]]: si no existe, se crea al pulsarla.

## Formato
- [x] Listas de tareas
- **Negrita**, *cursiva*, ~~tachado~~ y ==resaltado==
- \`código en línea\` y bloques de código

| Formato | Cómo se escribe |
| --- | --- |
| Tabla | \`| a | b |\` y debajo \`|---|---|\` |
| Destacado | \`> [!tip] Título\` |
| Etiqueta | #idea |

> [!tip] Destacados
> Usa [!note], [!info], [!warning], [!danger], [!example]… y añade - para plegarlos.

> [!info] Privado de verdad
> En el repositorio solo hay archivos ilegibles. Sin tu frase de paso, nadie puede leer esto.
`,
};

const ca = {
  title: 'Benvinguda',
  text: `El teu quadern personal, xifrat d'extrem a extrem.

## El més bàsic
- Les notes es desen soles quan deixes d'escriure.
- **Ctrl+E** canvia entre editar i llegir.
- **Ctrl+O** obre el selector ràpid de notes.
- **Ctrl+N** crea una nota nova.
- Prem **?** per veure l'ajuda i totes les dreceres de teclat.
- Enllaça notes amb [[Una altra nota]]: si no existeix, es crea quan hi fas clic.

## Format
- [x] Llistes de tasques
- **Negreta**, *cursiva*, ~~ratllat~~ i ==ressaltat==
- \`codi en línia\` i blocs de codi

| Format | Com s'escriu |
| --- | --- |
| Taula | \`| a | b |\` i a sota \`|---|---|\` |
| Destacat | \`> [!tip] Títol\` |
| Etiqueta | #idea |

> [!tip] Destacats
> Fes servir [!note], [!info], [!warning], [!danger], [!example]… i afegeix - per plegar-los.

> [!info] Privat de debò
> Al repositori només hi ha fitxers il·legibles. Sense la teva frase de pas, ningú no pot llegir això.
`,
};

const fr = {
  title: 'Bienvenue',
  text: `Votre carnet personnel, chiffré de bout en bout.

## L'essentiel
- Les notes s'enregistrent toutes seules quand vous arrêtez d'écrire.
- **Ctrl+E** bascule entre l'édition et la lecture.
- **Ctrl+O** ouvre le sélecteur rapide de notes.
- **Ctrl+N** crée une nouvelle note.
- Appuyez sur **?** pour l'aide et tous les raccourcis clavier.
- Reliez les notes avec [[Une autre note]] : si elle n'existe pas, elle est créée quand vous cliquez dessus.

## Mise en forme
- [x] Listes de tâches
- **Gras**, *italique*, ~~barré~~ et ==surligné==
- \`code en ligne\` et blocs de code

| Mise en forme | Comment l'écrire |
| --- | --- |
| Tableau | \`| a | b |\` et en dessous \`|---|---|\` |
| Encadré | \`> [!tip] Titre\` |
| Étiquette | #idee |

> [!tip] Encadrés
> Utilisez [!note], [!info], [!warning], [!danger], [!example]… et ajoutez - pour les replier.

> [!info] Vraiment privé
> Le dépôt ne contient que des fichiers illisibles. Sans votre phrase secrète, personne ne peut lire ceci.
`,
};

const pt = {
  title: 'Boas-vindas',
  text: `O seu caderno pessoal, cifrado de ponta a ponta.

## O essencial
- As notas guardam-se sozinhas quando para de escrever.
- **Ctrl+E** alterna entre editar e ler.
- **Ctrl+O** abre o seletor rápido de notas.
- **Ctrl+N** cria uma nota nova.
- Carregue em **?** para ver a ajuda e todos os atalhos de teclado.
- Ligue notas com [[Outra nota]]: se não existir, é criada quando clicar nela.

## Formatação
- [x] Listas de tarefas
- **Negrito**, *itálico*, ~~riscado~~ e ==destacado==
- \`código em linha\` e blocos de código

| Formatação | Como se escreve |
| --- | --- |
| Tabela | \`| a | b |\` e por baixo \`|---|---|\` |
| Destaque | \`> [!tip] Título\` |
| Etiqueta | #ideia |

> [!tip] Destaques
> Use [!note], [!info], [!warning], [!danger], [!example]… e acrescente - para os recolher.

> [!info] Privado a sério
> O repositório só contém ficheiros ilegíveis. Sem a sua frase-passe, ninguém consegue ler isto.
`,
};

export const WELCOMES = { en, es, ca, fr, pt };
