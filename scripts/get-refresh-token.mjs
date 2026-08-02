// Obtient un REFRESH_TOKEN Google pour l'API Chrome Web Store.
// Aucune dépendance : uniquement node:http, node:fs et le fetch global.
//
// Lit CLIENT_ID et CLIENT_SECRET dans le .env du répertoire courant, et y écrit
// REFRESH_TOKEN. Le jeton n'est jamais affiché à l'écran.
//
// Usage, depuis la racine du dépôt :  node scripts/get-refresh-token.mjs
//
// À lancer une seule fois : le jeton obtenu est ce qui rend la publication
// automatisable ensuite, le consentement OAuth ne pouvant pas l'être.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PORT = 8137;
const REDIRECT = `http://127.0.0.1:${PORT}`;

const envPath = resolve(process.cwd(), '.env');
const raw = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

for (const key of ['CLIENT_ID', 'CLIENT_SECRET']) {
  if (!env[key]) {
    console.error(`${key} est absent de ${envPath}`);
    process.exit(1);
  }
}

// access_type=offline demande un refresh token, prompt=consent force Google à
// le renvoyer même si ce client a déjà été autorisé une fois.
const authorize = new URL(AUTH_URL);
authorize.searchParams.set('client_id', env.CLIENT_ID);
authorize.searchParams.set('redirect_uri', REDIRECT);
authorize.searchParams.set('response_type', 'code');
authorize.searchParams.set('scope', SCOPE);
authorize.searchParams.set('access_type', 'offline');
authorize.searchParams.set('prompt', 'consent');

console.log("\nOuvrez cette URL, autorisez l'accès, puis revenez ici :\n");
console.log(authorize.href + '\n');

const code = await new Promise((ok, ko) => {
  const server = createServer((request, response) => {
    const params = new URL(request.url, REDIRECT).searchParams;
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (params.get('error')) {
      response.end('Accès refusé.');
      server.close();
      ko(new Error(params.get('error')));
      return;
    }
    if (params.get('code')) {
      response.end("C'est bon, vous pouvez fermer cet onglet.");
      server.close();
      ok(params.get('code'));
      return;
    }
    response.end('Aucun code dans cette requête.');
  });
  // 127.0.0.1 et pas 0.0.0.0 : le serveur n'est joignable que depuis la machine.
  server.listen(PORT, '127.0.0.1');
  setTimeout(() => {
    server.close();
    ko(new Error('Délai de 5 minutes dépassé'));
  }, 300_000).unref();
});

const response = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT
  })
});

const payload = await response.json();
if (!response.ok || !payload.refresh_token) {
  console.error('Échec :', response.status, payload.error ?? '', payload.error_description ?? '');
  process.exit(1);
}

const next = raw.replace(/^REFRESH_TOKEN=.*$/m, '').trimEnd()
  + `\nREFRESH_TOKEN=${payload.refresh_token}\n`;
writeFileSync(envPath, next);

console.log(`REFRESH_TOKEN écrit dans ${envPath}, sans passer par l'écran.`);
