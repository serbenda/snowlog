# Puesta en marcha

Hay dos formas de entrar. Empieza por la A, que funciona en 5 minutos, y monta la B cuando quieras el login con GitHub.

## 0. Publicar la web

1. En este repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Fusiona la PR de `development` a `main`. El workflow *Publicar en GitHub Pages* despliega la carpeta `public/`.
3. La web queda en `https://bendi.dev/snowlog/` si tu sitio `serbenda.github.io` usa el dominio `bendi.dev`,
   o en `https://serbenda.github.io/snowlog/` si no. Usa esa URL en los pasos siguientes.

El repo de notas `serbenda/snowlog-notes` debe existir, ser **privado** y puede estar vacío.

## A. Entrar con un token personal (rápido)

1. Ve a <https://github.com/settings/personal-access-tokens/new> (*Fine-grained token*).
2. **Expiration:** 90 días (o lo que prefieras; al caducar, creas otro).
3. **Repository access:** *Only select repositories* → `snowlog-notes`.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. Genera el token, abre Snowlog, pulsa *Usar un token personal* y pégalo.
6. La primera vez te pedirá crear la bóveda: elige una frase de paso larga y **guarda el código de recuperación en papel**.

El token se guarda en el navegador cifrado con tu clave; sin la frase de paso no sirve de nada.

## B. Entrar con GitHub (GitHub App + Cloudflare Worker)

### 1. Crear la GitHub App

En <https://github.com/settings/apps/new>:

| Campo | Valor |
| --- | --- |
| GitHub App name | `snowlog-serbenda` (debe ser único en GitHub) |
| Homepage URL | la URL de tu Snowlog |
| Callback URL | la URL de tu Snowlog, con la barra final (`https://bendi.dev/snowlog/`) |
| Expire user authorization tokens | marcado (tokens de 8 h que se renuevan solos) |
| Webhook → Active | desmarcado |
| Repository permissions → Contents | Read and write |
| Where can this GitHub App be installed? | Only on this account |

Después:

1. Copia el **Client ID** (empieza por `Iv`).
2. Pulsa **Generate a new client secret** y cópialo (solo se muestra una vez).
3. **Install App** → tu cuenta → *Only select repositories* → `snowlog-notes`.

### 2. Desplegar el Worker

Necesitas una cuenta gratuita de Cloudflare y Node.js en tu ordenador.

```bash
cd worker
# edita wrangler.toml: GITHUB_CLIENT_ID y, si hace falta, ALLOWED_ORIGIN
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # pega el client secret
npx wrangler deploy                            # te da la URL: https://snowlog-auth.<tu-subdominio>.workers.dev
```

`ALLOWED_ORIGIN` es solo el origen, sin ruta: `https://bendi.dev` o `https://serbenda.github.io`.

### 3. Configurar la web

En `public/js/config.js`, en la rama `development`:

```js
githubClientId: 'Iv23…',
authWorker: 'https://snowlog-auth.<tu-subdominio>.workers.dev',
```

Haz la PR a `main` y, al publicarse, el botón *Entrar con GitHub* quedará activo.

## Si algo va mal

- **Revocar todo el acceso:** <https://github.com/settings/apps/authorizations> (OAuth) o borra el token personal.
- **Olvidé la frase de paso:** en la pantalla de desbloqueo, *He olvidado la frase de paso*, e introduce el código de recuperación.
- **Recuperar una nota borrada:** está en el historial del repo de notas; restaurar desde la app llegará en la fase 4.
- **Cambiar de dispositivo:** entra de nuevo y desbloquea con la misma frase de paso.
