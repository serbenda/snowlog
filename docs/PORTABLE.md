# Snowlog portable

A single file, `snowlog-portable.html`, that opens with a double click. **Nothing to install and no internet
needed.** It works on Windows and Mac. With Google Chrome or Microsoft Edge it stores the notes in a folder; with
Firefox or Safari, inside the browser.

## Getting it

- Download it from <https://snowlog.bendi.dev/snowlog-portable.html> (or from the *Download the portable version*
  link on the sign-in screen).
- Keep it wherever you want: the desktop, a documents folder or a USB stick.

## Using it

1. Open `snowlog-portable.html` with Chrome or Edge (right click → *Open with*). It also works with Firefox or
   Safari: see below.
2. Click **Open a folder** and choose (or create) the folder for your notes. The browser asks for permission to
   change it: accept.
3. Next time you see **Continue with “your folder”**: one click and you are in.
4. Menu ⋯ → **Set up my space** creates the dashboard, the daily notes and the templates. **Load examples** adds
   an example project.

Everything in the online version works: daily note, dashboard, queries, calendar, templates, backlinks and folder
import.

## How it stores the notes

- Each note is a normal `.md` file inside your folder, with its subfolders: you can open them with any editor, copy
  them or back them up like any document.
- What you delete goes to the `.trash` subfolder, where you can recover it by hand.
- It leaves alone whatever is not a note (images, PDFs, other apps' settings folders…).
- **Backup (.zip)** in the ⋯ menu downloads every note and attachment in a zip.
- If you change files from outside while Snowlog is open (another editor, OneDrive, Dropbox…), Snowlog sees it
  when you come back to the window and every 10 seconds. **Reload the folder** (⋯ menu) forces a full look.
- Each note keeps earlier versions in `.history` (at most one every 10 minutes): menu ⋯ → **Version history**.
- Settings go in `.snowlog/settings.json` inside the folder (folders set up before the English version still have
  `.snowlog/ajustes.json`, which is read until the settings are saved again).

## With Firefox or Safari

These browsers don't let a page pick folders on disk. Snowlog offers **Store inside the browser**: the notes are
kept in the browser's storage on that computer and are still there the next time you open the file. Keep in mind:

- If you clear the browser data (or use a private window), the notes are cleared too.
- Make a **Backup (.zip)** from time to time; Snowlog reminds you.
- To move them to a folder or to the online version, use that backup (see *Moving notes* below).

## Security

- The portable version **cannot connect to anything**: its security policy forbids every network connection. No
  note leaves your computer.
- Notes are **not encrypted** (unlike the online version): they are protected by your computer account, like the
  rest of your documents.
- Before using it at work, check that your company allows opening downloaded HTML files.

## Online and portable, compared

| | Online (snowlog.bendi.dev) | Portable (snowlog-portable.html) |
| --- | --- | --- |
| Where the notes are | A private GitHub repository, encrypted | A folder on your computer, as `.md` |
| Internet | Needed (it also works offline once loaded) | No |
| Installation | None | None |
| Several devices | Yes | No (it is a local folder) |
| Encryption | End to end | No (protected by the system) |
| Browsers | Any modern one | Chrome or Edge (folder); Firefox or Safari (inside the browser) |

From the online version you can also use a local folder with *Use notes on this computer, without GitHub*.

## Moving notes from one version to the other

- **From online to portable:** in the online version, menu ⋯ → **Encrypted backup** (a `.snowlog` file). In the
  portable one, menu ⋯ → **Import a backup (.snowlog or .zip)…**, type your passphrase (or the recovery code) and
  choose **Import them as they are**. It works without internet: decryption happens in the browser.
- **From portable to online:** in the portable version, menu ⋯ → **Backup (.zip)**. In the online one, menu ⋯ →
  **Import a backup (.snowlog or .zip)…** and **Import them as they are**: they are encrypted in the browser before
  upload.
- **Import them into the “Backup YYYY-MM-DD” folder** leaves your current notes untouched, to review calmly.
- If a name already exists, the imported note is called “… (imported)”: nothing is ever overwritten.
