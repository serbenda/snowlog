import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGitHub } from './fake-github.mjs';

const ITER = 1000;
const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
globalThis.fetch = fake.fetch;

const { GitHubRepo } = await import('../public/js/github.js');
const { Vault, VAULT_FILE, INDEX_FILE } = await import('../public/js/vault.js');
const C = await import('../public/js/crypto.js');

const repoCfg = { owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' };
const newRepo = () => new GitHubRepo(repoCfg, async () => 'token');

let vault;
let recovery;

test('crear la bóveda en un repo vacío', async () => {
  const r = await Vault.create(newRepo(), 'frase de paso de prueba', ITER);
  vault = r.vault;
  recovery = r.recoveryCode;
  const files = fake.files();
  assert.ok(files.has(VAULT_FILE));
  assert.ok(files.has(INDEX_FILE));
  assert.equal(vault.notes().length, 1);
  assert.equal(vault.notes()[0].path, 'Bienvenido');
  await assert.rejects(Vault.create(newRepo(), 'otra frase de prueba', ITER), /vault_exists/);
});

test('crear, guardar y leer notas desde otro dispositivo', async () => {
  const id = await vault.createNote('Trabajo/Ideas/Plan secreto', 'texto inicial');
  await vault.saveNote(id, '# Plan\nContenido muy secreto');
  assert.deepEqual(vault.index.folders.sort(), ['Trabajo', 'Trabajo/Ideas']);

  const vaultFile = await Vault.fetchVaultFile(newRepo());
  const dek = await C.unlockVault(vaultFile, 'frase de paso de prueba');
  const other = new Vault(newRepo(), dek);
  await other.loadIndex();
  const hit = other.findByTitle('plan secreto');
  assert.equal(hit.id, id);
  assert.equal(await other.read(id), '# Plan\nContenido muy secreto');
});

test('en el repo no hay títulos ni contenido en claro', () => {
  for (const [path, content] of fake.files()) {
    for (const secret of ['Plan secreto', 'Trabajo', 'Contenido', 'Bienvenido']) {
      assert.ok(!path.includes(secret), `ruta ${path}`);
      assert.ok(!content.includes(secret), `contenido de ${path}`);
    }
  }
});

test('no se permiten nombres repetidos ni caracteres raros', async () => {
  await assert.rejects(vault.createNote('trabajo/ideas/plan SECRETO'), /exists/);
  await assert.rejects(vault.createNote('a:b'), /bad_chars/);
  await assert.rejects(vault.createNote('  /  '), /empty_name/);
  assert.equal(vault.freePath('Trabajo', 'Sin título'), 'Trabajo/Sin título');
});

test('renombrar y mover carpetas arrastra sus notas', async () => {
  const id = vault.findByTitle('Plan secreto').id;
  await vault.renameFolder('Trabajo', 'Oficina');
  assert.equal(vault.index.notes[id].path, 'Oficina/Ideas/Plan secreto');
  assert.ok(!vault.index.folders.some((f) => f.startsWith('Trabajo')));
  await assert.rejects(vault.renameFolder('Oficina', 'Oficina/Ideas/Dentro'), /into_itself/);
  await vault.renameNote(id, 'Plan secreto');
  assert.equal(vault.index.notes[id].path, 'Plan secreto');
});

test('si otro dispositivo escribe a la vez, se reintenta sin perder nada', async () => {
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  const idOther = await other.createNote('Desde el móvil', 'hola');
  // `vault` sigue con un head viejo: el commit choca y debe reintentar sobre el nuevo índice.
  const idMine = await vault.createNote('Desde el portátil', 'adiós');
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.ok(check.index.notes[idOther]);
  assert.ok(check.index.notes[idMine]);
});

test('eliminar nota y carpeta borra sus ficheros', async () => {
  const id = await vault.createNote('Temporal/Borrar', 'x');
  const before = fake.files().size;
  await vault.deleteFolder('Temporal');
  assert.equal(fake.files().size, before - 1);
  assert.equal(vault.index.notes[id], undefined);
  assert.ok(!vault.index.folders.includes('Temporal'));
  const id2 = vault.findByTitle('Desde el móvil').id;
  await vault.deleteNote(id2);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(id2)));
});

test('recuperar con el código cambia la frase en el repo', async () => {
  const vaultFile = await Vault.fetchVaultFile(newRepo());
  const { vault: updated } = await C.recoverVault(vaultFile, recovery, 'frase nueva de prueba');
  await vault.writeVaultFile(updated);
  const again = await Vault.fetchVaultFile(newRepo());
  const dek = await C.unlockVault(again, 'frase nueva de prueba');
  const v = new Vault(newRepo(), dek);
  await v.loadIndex();
  assert.ok(v.findByTitle('Plan secreto'));
});

test('importar notas en lotes, sin texto en claro y resolviendo nombres repetidos', async () => {
  const commitsBefore = fake.commitCount();
  const items = [
    { path: 'Personal/Ideas/Viaje a Japón', text: '# Japón\nVer [[Lista de la compra]] #viaje' },
    { path: 'Personal/Lista de la compra', text: '- [ ] leche' },
    { path: 'Plan secreto', text: 'otra versión' },
    ...Array.from({ length: 5 }, (_, i) => ({ path: `Diario/2026-11-0${i + 1}`, text: `día ${i + 1}` })),
  ];
  const progress = [];
  const result = await vault.importNotes(items, { batchSize: 3, onProgress: (d, t) => progress.push(`${d}/${t}`) });
  assert.equal(result.length, 8);
  assert.deepEqual(progress, ['3/8', '6/8', '8/8']);
  assert.equal(fake.commitCount() - commitsBefore, 3);
  assert.equal(result[2].path, 'Plan secreto (importada)');
  assert.ok(vault.index.folders.includes('Personal/Ideas'));

  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  const japon = fresh.findByTitle('Viaje a Japón');
  assert.equal(await fresh.read(japon.id), '# Japón\nVer [[Lista de la compra]] #viaje');
  for (const [path, content] of fake.files()) {
    assert.ok(!path.includes('Japón') && !content.includes('Japón') && !content.includes('leche'), path);
  }
});

test('importNotes puede crear carpetas vacías y usar otro mensaje', async () => {
  await vault.importNotes([{ path: 'Inicio', text: '# Inicio' }], { message: 'configurar mi espacio', folders: ['Archivo', 'Proyectos'] });
  assert.ok(vault.index.folders.includes('Archivo'));
  assert.ok(vault.findByPath('Inicio'));
});
