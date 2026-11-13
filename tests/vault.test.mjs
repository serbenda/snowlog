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

test('saveMany guarda varias notas en un solo commit', async () => {
  const a = await vault.createNote('Lote/A', 'a');
  const b = await vault.createNote('Lote/B', 'b');
  const before = fake.commitCount();
  await vault.saveMany([{ id: a, text: 'a2' }, { id: b, text: 'b2' }]);
  assert.equal(fake.commitCount() - before, 1);
  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  assert.equal(await fresh.read(a), 'a2');
  assert.equal(await fresh.read(b), 'b2');
});

test('adjuntos: se cifran, se leen desde otro dispositivo y se mueven con su carpeta', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const a = await vault.addFile('Fotos de viaje', 'playa secreta.png', png);
  assert.equal(a.path, 'Fotos de viaje/playa secreta.png');
  const b = await vault.addFile('Fotos de viaje', 'playa secreta.png', png);
  assert.equal(b.path, 'Fotos de viaje/playa secreta 1.png');
  await assert.rejects(vault.addFile('', 'virus.exe', png), /bad_type/);
  await assert.rejects(vault.addFile('', 'enorme.pdf', new Uint8Array(21 * 1024 * 1024)), /too_big/);
  for (const [path, content] of fake.files()) {
    assert.ok(!path.includes('playa') && !content.includes('playa') && !content.includes('Fotos'), path);
  }
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  assert.equal(other.findFile('PLAYA SECRETA.png').id, a.id);
  assert.deepEqual(await other.readFile(a.id), png);
  await vault.renameFolder('Fotos de viaje', 'Archivo/Fotos');
  assert.equal(vault.findFile('playa secreta.png').path, 'Archivo/Fotos/playa secreta.png');
  await vault.deleteFile(b.id);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(b.id)));
  await vault.deleteFolder('Archivo');
  assert.equal(vault.files().length, 0);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(a.id)));
});

test('si la misma nota cambia en dos dispositivos, se conservan las dos versiones', async () => {
  const id = await vault.createNote('Compartida', 'versión inicial');
  const movil = new Vault(newRepo(), vault.dek);
  await movil.loadIndex();
  assert.equal(await movil.read(id), 'versión inicial');
  // El portátil guarda primero; el móvil, que no lo sabe, guarda después.
  assert.deepEqual(await vault.saveNote(id, 'desde el portátil'), {});
  const res = await movil.saveNote(id, 'desde el móvil');
  assert.ok(res.conflict, 'debe detectar el conflicto');
  assert.match(res.conflict.path, /^Compartida \(otro dispositivo \d{4}-\d\d-\d\d \d{4}\)$/);
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(await check.read(id), 'desde el móvil');
  assert.equal(await check.read(res.conflict.id), 'desde el portátil');
  // Ya sincronizados: guardar otra vez no crea más copias.
  assert.deepEqual(await movil.saveNote(id, 'otra vez'), {});
  // Y el portátil, al guardar con su versión vieja, también conserva la del móvil.
  const res2 = await vault.saveNote(id, 'portátil de nuevo');
  assert.ok(res2.conflict);
  const check2 = new Vault(newRepo(), vault.dek);
  await check2.loadIndex();
  assert.equal(await check2.read(res2.conflict.id), 'otra vez');
});

test('si otro dispositivo borró la nota, guardarla la recupera', async () => {
  const id = await vault.createNote('Se borra fuera', 'texto');
  const otro = new Vault(newRepo(), vault.dek);
  await otro.loadIndex();
  await otro.deleteNote(id);
  await vault.saveNote(id, 'texto que no se pierde');
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(check.findByTitle('Se borra fuera').id, id);
  assert.equal(await check.read(id), 'texto que no se pierde');
});

test('cambios en notas distintas no se consideran conflicto', async () => {
  const a = await vault.createNote('Nota A', 'a');
  const b = await vault.createNote('Nota B', 'b');
  const otro = new Vault(newRepo(), vault.dek);
  await otro.loadIndex();
  await otro.read(b);
  await vault.saveNote(a, 'a2');
  assert.deepEqual(await otro.saveNote(b, 'b2'), {});
  assert.equal(otro.notes().filter((n) => n.path.includes('otro dispositivo')).length, 2, 'solo las copias de la prueba anterior');
});

test('historial: lista las versiones de una nota, las descifra y permite restaurar', async () => {
  const id = await vault.createNote('Con historia', 'v1');
  await vault.saveNote(id, 'v2');
  await vault.createNote('Otra nota cualquiera', 'x');
  await vault.saveNote(id, 'v3');
  const versions = await vault.history(id);
  assert.equal(versions.length, 3);
  assert.ok(versions[0].date > versions[2].date);
  assert.deepEqual(await Promise.all(versions.map((v) => vault.readVersion(id, v.ref))), ['v3', 'v2', 'v1']);
  await vault.saveNote(id, await vault.readVersion(id, versions[2].ref));
  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  assert.equal(await fresh.read(id), 'v1');
  assert.equal((await fresh.history(id)).length, 4, 'restaurar no borra el historial');
});

test('caché local cifrada: no vuelve a bajar lo que no ha cambiado y sigue al día', async () => {
  const { memoryCache } = await import('../public/js/cache.js');
  const store = memoryCache();
  const a = await vault.createNote('Cache/A', 'a1');
  const b = await vault.createNote('Cache/B', 'b1');
  let gets = 0;
  const counting = async (url, opts) => {
    if ((opts?.method || 'GET') === 'GET' && url.includes('/contents/n/')) gets += 1;
    return fake.fetch(url, opts);
  };
  globalThis.fetch = counting;
  try {
    const first = new Vault(newRepo(), vault.dek, { store });
    await first.loadIndex();
    await first.read(a);
    await first.read(b);
    assert.equal(gets, 2);
    for (const [, v] of store.map) assert.ok(!v.content.includes('a1') && !v.content.includes('b1'), 'la caché va cifrada');
    gets = 0;
    const second = new Vault(newRepo(), vault.dek, { store });
    await second.loadIndex();
    assert.equal(await second.read(a), 'a1');
    assert.equal(await second.read(b), 'b1');
    assert.equal(gets, 0, 'todo sale de la caché');
    await vault.saveNote(a, 'a2'); // cambia en otro dispositivo
    const third = new Vault(newRepo(), vault.dek, { store });
    await third.loadIndex();
    gets = 0;
    assert.equal(await third.read(a), 'a2');
    assert.equal(await third.read(b), 'b1');
    assert.equal(gets, 1, 'solo baja la que cambió');
    await third.saveNote(b, 'b2'); // lo guardado aquí entra en la caché
    const fourth = new Vault(newRepo(), vault.dek, { store });
    await fourth.loadIndex();
    gets = 0;
    assert.equal(await fourth.read(b), 'b2');
    assert.equal(gets, 0);
    // Una entrada manipulada no se descifra y se vuelve a pedir al repo.
    const key = [...store.map.keys()].find((k) => k.includes(a));
    store.map.set(key, { ...store.map.get(key), content: store.map.get(key).content.slice(0, -6) + 'AAAAA=' });
    const fifth = new Vault(newRepo(), vault.dek, { store });
    await fifth.loadIndex();
    assert.equal(await fifth.read(a), 'a2');
  } finally {
    globalThis.fetch = fake.fetch;
  }
});
