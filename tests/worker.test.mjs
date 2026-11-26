// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env = { ALLOWED_ORIGIN: 'https://bendi.dev', GITHUB_CLIENT_ID: 'Iv1.test', GITHUB_CLIENT_SECRET: 'shh' };
const req = (path, body, origin = 'https://bendi.dev', method = 'POST') => new Request(`https://auth.example${path}`, {
  method,
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

let sent = null;
globalThis.fetch = async (url, opts) => {
  sent = { url, body: JSON.parse(opts.body) };
  return new Response(JSON.stringify({ access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_y', refresh_token_expires_in: 15811200 }));
};

test('rejects other origins', async () => {
  const res = await worker.fetch(req('/token', { code: 'abc' }, 'https://evil.example'), env);
  assert.equal(res.status, 403);
});

test('CORS preflight only for the allowed origin', async () => {
  const res = await worker.fetch(req('/token', null, 'https://bendi.dev', 'OPTIONS'), env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://bendi.dev');
});

test('exchanges the code for a token without returning the secret', async () => {
  const res = await worker.fetch(req('/token', { code: 'abc', redirect_uri: 'https://bendi.dev/snowlog/' }), env);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.access_token, 'ghu_x');
  assert.equal(sent.body.client_secret, 'shh');
  assert.equal(sent.body.redirect_uri, 'https://bendi.dev/snowlog/');
  assert.ok(!JSON.stringify(data).includes('shh'));
});

test('ignores a redirect_uri on another domain', async () => {
  await worker.fetch(req('/token', { code: 'abc', redirect_uri: 'https://evil.example/' }), env);
  assert.equal(sent.body.redirect_uri, undefined);
});

test('refreshes with a refresh token', async () => {
  const res = await worker.fetch(req('/refresh', { refresh_token: 'ghr_y' }), env);
  assert.equal(res.status, 200);
  assert.equal(sent.body.grant_type, 'refresh_token');
});

test('unknown routes and invalid bodies', async () => {
  assert.equal((await worker.fetch(req('/other', {}), env)).status, 404);
  assert.equal((await worker.fetch(req('/token', { code: 5 }), env)).status, 400);
});
