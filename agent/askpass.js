// Ask for the passphrase without it passing through the agent that uses the server.
//
// - By default (macOS), a system dialog with hidden input. The passphrase goes from the dialog
//   to this process through a pipe; it is never written to disk, arguments or environment variables.
// - SNOWLOG_ASKPASS=/path/program: like SSH_ASKPASS. The program runs with the message as its
//   argument and its standard output is the passphrase. It serves other systems and tests with
//   a test vault.
//
// Returns the passphrase, or null if cancelled.

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

// Text for AppleScript, between quotes.
const asString = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;

export async function askPassphrase(message = 'Snowlog vault passphrase') {
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
