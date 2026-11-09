// Configuración de Snowlog. Ningún valor de aquí es secreto:
// el client secret de la GitHub App vive solo en el Worker.
export const CONFIG = {
  // Repo privado donde se guardan las notas cifradas.
  notesRepo: { owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' },

  // Client ID de la GitHub App (empieza por "Iv"). Vacío = solo login con token personal.
  githubClientId: '',

  // URL del Cloudflare Worker que intercambia el login, sin barra final.
  // Ejemplo: 'https://snowlog-auth.serbenda.workers.dev'
  authWorker: '',

  // Minutos sin actividad antes de bloquear y borrar la clave de memoria.
  lockAfterMinutes: 10,

  // Iteraciones de PBKDF2-SHA256 al crear una bóveda nueva.
  kdfIterations: 600000,

  // Espera tras dejar de escribir antes de guardar (ms).
  saveDelayMs: 2500,
};
