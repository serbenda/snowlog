// Snowlog auth: a Cloudflare Worker that exchanges the GitHub sign-in code for a token.
// It holds the GitHub App client secret (as a Worker secret) and nothing else:
// it does not store tokens or log the content of requests.
//
// Variables:
//   ALLOWED_ORIGIN        origin of the web app, e.g. https://bendi.dev (no trailing slash)
//   GITHUB_CLIENT_ID      GitHub App client ID
//   GITHUB_CLIENT_SECRET  secreto (wrangler secret put GITHUB_CLIENT_SECRET)

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'forbidden_origin' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    const { pathname } = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch {
      return reply(400, { error: 'bad_json' });
    }

    const params = { client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET };
    if (pathname === '/token') {
      if (typeof body.code !== 'string' || body.code.length > 200) return reply(400, { error: 'bad_code' });
      params.code = body.code;
      if (typeof body.redirect_uri === 'string' && body.redirect_uri.startsWith(`${env.ALLOWED_ORIGIN}/`)) {
        params.redirect_uri = body.redirect_uri;
      }
    } else if (pathname === '/refresh') {
      if (typeof body.refresh_token !== 'string' || body.refresh_token.length > 500) return reply(400, { error: 'bad_refresh_token' });
      params.grant_type = 'refresh_token';
      params.refresh_token = body.refresh_token;
    } else {
      return reply(404, { error: 'not_found' });
    }

    const res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'snowlog-auth' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.access_token) {
      return reply(400, { error: data.error || 'github_error' });
    }
    return reply(200, {
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      refresh_token_expires_in: data.refresh_token_expires_in,
      token_type: data.token_type,
    });
  },
};
