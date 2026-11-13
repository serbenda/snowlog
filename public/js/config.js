// Configuración de Snowlog. Ningún valor de aquí es secreto:
// el client secret de la GitHub App vive solo en el Worker.
export const CONFIG = {
  // 'online': notas cifradas en GitHub. 'portable': la versión de un solo fichero (la pone el empaquetador).
  mode: 'online',

  // Repo privado donde se guardan las notas cifradas.
  notesRepo: { owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' },

  // Client ID de la GitHub App (empieza por "Iv"). Vacío = solo login con token personal.
  githubClientId: 'Iv23li5tmgS4GIWdO2HH',

  // URL del Cloudflare Worker que intercambia el login, sin barra final.
  // Ejemplo: 'https://snowlog-auth.serbenda.workers.dev'
  authWorker: 'https://snowlog-auth.serbenda.workers.dev',

  // Organización del día a día (como una bóveda de Obsidian con panel y nota diaria).
  // Son los valores por defecto: cada bóveda puede cambiarlos en «Ajustes» dentro de la app.
  workspace: {
    home: 'Inicio', // nota del panel principal
    dailyFolder: 'Diario', // carpeta de las notas diarias (AAAA-MM-DD)
    templatesFolder: 'Plantillas', // carpeta de plantillas (no aparecen en las consultas)
    attachmentsFolder: 'Adjuntos', // donde van las imágenes y PDF que se pegan
    drawingsFolder: 'Dibujos', // donde se crean los dibujos (sketch)
    dailyTemplate: 'Plantillas/Nota diaria',
    openDailyOnStart: true, // abrir la nota de hoy al entrar, si existe la carpeta del diario
  },

  // Minutos sin actividad antes de bloquear y borrar la clave de memoria.
  lockAfterMinutes: 10,

  // Iteraciones de PBKDF2-SHA256 al crear una bóveda nueva.
  kdfIterations: 600000,

  // Espera tras dejar de escribir antes de guardar (ms).
  // Guardado: tras saveDelayMs sin escribir, y como mucho cada saveMaxWaitMs escribiendo sin parar.
  // En online cada guardado es un commit; en local, una escritura en disco (localSaveDelayMs).
  saveDelayMs: 4000,
  saveMaxWaitMs: 30000,
  localSaveDelayMs: 1000,
  // Días sin copia de seguridad antes de recordarla (0 = nunca).
  backupReminderDays: 7,
};
