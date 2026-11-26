// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Snowlog configuration. Nothing here is secret:
// the GitHub App client secret lives only in the Worker.
export const CONFIG = {
  // 'online': encrypted notes on GitHub. 'portable': the single-file build (set by the bundler).
  mode: 'online',

  // Private repository that holds the encrypted notes.
  notesRepo: { owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' },

  // GitHub App client ID (starts with "Iv"). Empty = personal token sign-in only.
  githubClientId: 'Iv23li5tmgS4GIWdO2HH',

  // URL of the Cloudflare Worker that completes the sign-in, without a trailing slash.
  // Example: 'https://snowlog-auth.serbenda.workers.dev'
  authWorker: 'https://snowlog-auth.serbenda.workers.dev',

  // Day-to-day organization: a dashboard note and a daily note.
  // These are the defaults: each vault can change them in "Settings" inside the app.
  // Vaults that already use the earlier Spanish names keep them (templates.js → LEGACY_WORKSPACE).
  workspace: {
    home: 'Home', // dashboard note
    dailyFolder: 'Daily', // folder of the daily notes (YYYY-MM-DD)
    templatesFolder: 'Templates', // templates folder (left out of queries)
    attachmentsFolder: 'Attachments', // where pasted images and PDFs go
    drawingsFolder: 'Drawings', // where drawings (sketch) are created
    dailyTemplate: 'Templates/Daily note',
    openDailyOnStart: true, // open today's note on start, if the daily folder exists
  },

  // Minutes of inactivity before locking and wiping the key from memory.
  lockAfterMinutes: 10,

  // PBKDF2-SHA256 iterations when creating a new vault.
  kdfIterations: 600000,

  // Saving: after saveDelayMs without typing, and at most every saveMaxWaitMs while typing non-stop.
  // Online, every save is a commit; locally, a write to disk (localSaveDelayMs).
  saveDelayMs: 4000,
  saveMaxWaitMs: 30000,
  localSaveDelayMs: 1000,
  // Days without a backup before a reminder (0 = never).
  backupReminderDays: 7,
};
