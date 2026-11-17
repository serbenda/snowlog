# Deployment

There are two ways to sign in. Start with A, which works in 5 minutes, and set up B when you want sign-in with
GitHub.

## 0. Publish the site

1. In this repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge the `development` PR into `main`. The *Publish to GitHub Pages* workflow deploys the `public/` folder.
3. The site is at **https://snowlog.bendi.dev/** (custom domain set in Settings → Pages → Custom domain). Use that
   URL in the next steps.

The notes repository `serbenda/snowlog-notes` must exist, be **private** and may be empty.

## A. Sign in with a personal token (quick)

1. Go to <https://github.com/settings/personal-access-tokens/new> (*Fine-grained token*).
2. **Expiration:** 90 days (or whatever you prefer; when it expires, create another).
3. **Repository access:** *Only select repositories* → `snowlog-notes`.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. Generate the token, open Snowlog, click *Use a personal token* and paste it.
6. The first time it asks you to create the vault: choose a long passphrase and **write the recovery code down on
   paper**.

The token is stored in the browser encrypted with your key; without the passphrase it is useless.

## B. Sign in with GitHub (GitHub App + Cloudflare Worker)

### 1. Create the GitHub App

At <https://github.com/settings/apps/new>:

| Field | Value |
| --- | --- |
| GitHub App name | `snowlog-serbenda` (must be unique on GitHub) |
| Homepage URL | your Snowlog URL |
| Callback URL | your Snowlog URL, with the trailing slash (`https://snowlog.bendi.dev/`) |
| Expire user authorization tokens | checked (8-hour tokens that refresh themselves) |
| Webhook → Active | unchecked |
| Repository permissions → Contents | Read and write |
| Where can this GitHub App be installed? | Only on this account |

Then:

1. Copy the **Client ID** (starts with `Iv`).
2. Click **Generate a new client secret** and copy it (it is shown only once).
3. **Install App** → your account → *Only select repositories* → `snowlog-notes`.

### 2. Deploy the Worker

You need a free Cloudflare account and Node.js on your computer.

```bash
cd worker
# edit wrangler.toml: GITHUB_CLIENT_ID and, if needed, ALLOWED_ORIGIN
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret
npx wrangler deploy                            # gives you the URL: https://snowlog-auth.<your-subdomain>.workers.dev
```

`ALLOWED_ORIGIN` is only the origin, with no path or trailing slash: `https://snowlog.bendi.dev`.

### 3. Configure the site

In `public/js/config.js`, on the `development` branch:

```js
githubClientId: 'Iv23…',
authWorker: 'https://snowlog-auth.<your-subdomain>.workers.dev',
```

And put the same URL in `connect-src` of the CSP in `public/index.html` (the CSP only allows connecting to GitHub
and that Worker; `npm test` fails if they don't match).

Open the PR to `main` and, once published, the *Sign in with GitHub* button is active.

## Current setup

- Published at https://snowlog.bendi.dev/ with GitHub Pages (source: GitHub Actions) from `main`.
- GitHub App with client ID `Iv23li5tmgS4GIWdO2HH` and redirect URI `https://snowlog.bendi.dev/`.
- Worker at https://snowlog-auth.serbenda.workers.dev (`ALLOWED_ORIGIN=https://snowlog.bendi.dev`,
  `GITHUB_CLIENT_SECRET` as a Cloudflare secret). The personal token is still available as an alternative.

## If something goes wrong

- **Revoke all access:** <https://github.com/settings/apps/authorizations> (OAuth), or delete the personal token.
- **Forgot the passphrase:** on the unlock screen, *I forgot the passphrase*, and enter the recovery code.
- **Recover a deleted note or an older version:** menu ⋯ → *Version history…*; a deleted note is also in the notes
  repository's history.
- **Change device:** sign in again and unlock with the same passphrase.
