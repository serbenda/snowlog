// Pedir la frase de paso sin que pase por el agente que usa el servidor.
//
// - Por defecto (macOS), un diálogo del sistema con la entrada oculta. La frase va del diálogo
//   a este proceso por una tubería; no se escribe en disco, ni en argumentos, ni en variables de entorno.
// - SNOWLOG_ASKPASS=/ruta/programa: como SSH_ASKPASS. Se ejecuta el programa con el mensaje como
//   argumento y su salida estándar es la frase. Sirve para otros sistemas y para las pruebas con
//   una bóveda de prueba.
//
// Devuelve la frase, o null si se cancela.

import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out: Buffer.concat(out).toString('utf8') }));
  });
}

// Texto para AppleScript entre comillas.
const asString = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;

export async function askPassphrase(message = 'Frase de paso de la bóveda de Snowlog') {
  const askpass = process.env.SNOWLOG_ASKPASS;
  if (askpass) {
    const { code, out } = await run(askpass, [message]);
    const secret = out.replace(/\r?\n$/, '');
    return code === 0 && secret ? secret : null;
  }
  if (process.platform !== 'darwin') throw new Error('no_askpass');
  const script = `text returned of (display dialog ${asString(message)} default answer "" with hidden answer `
    + 'with title "Snowlog" with icon note buttons {"Cancelar", "Desbloquear"} default button "Desbloquear" '
    + 'cancel button "Cancelar" giving up after 120)';
  const { code, out } = await run('osascript', ['-e', script]);
  const secret = out.replace(/\r?\n$/, '');
  return code === 0 && secret ? secret : null;
}
