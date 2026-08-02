# Mises à jour automatisées vers le Chrome Web Store

Un tag `v*` poussé sur `main` déclenche `.github/workflows/release.yml`, qui teste, construit le paquet et le soumet au store. Aucune dépendance tierce n'intervient : le workflow appelle l'[API Chrome Web Store v2](https://developer.chrome.com/docs/webstore/api) directement avec `curl` et `jq`.

## Publier une nouvelle version

```sh
npm version patch   # ou minor, ou major
git push --follow-tags
```

`npm version` incrémente `package.json`, déclenche le hook `version` qui recopie le numéro dans `extension/manifest.json` via `scripts/sync-manifest-version.mjs`, commite les deux fichiers et pose le tag. Les trois numéros ne peuvent donc pas diverger. Le workflow revérifie de toute façon que le tag correspond au manifeste avant de construire quoi que ce soit, et échoue avant tout envoi si ce n'est pas le cas.

Le store refuse un paquet dont la version n'est pas strictement supérieure à celle déjà publiée.

## Mise en place initiale

Faite une seule fois, elle est déjà en place. Ce qui suit sert à la refaire si les identifiants sont révoqués.

### 1. Projet Google Cloud

Créer un projet, puis activer l'API sur ce projet : https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com

### 2. Client OAuth

Configurer l'écran de consentement, puis créer un identifiant OAuth de type **Desktop app**, qui autorise la redirection vers `127.0.0.1` utilisée par le script de la section suivante.

**Publier l'application** (statut *In production*, page Audience). Tant qu'elle reste en *Testing*, Google révoque les refresh tokens au bout de 7 jours et le pipeline casse avec `invalid_grant: Token has been expired or revoked`.

### 3. Refresh token

Renseigner `CLIENT_ID` et `CLIENT_SECRET` dans un fichier `.env` à la racine (ignoré par git), puis :

```sh
node scripts/get-refresh-token.mjs
```

Le script ouvre le flux OAuth, récupère le jeton sur un serveur local éphémère et l'écrit dans le `.env` sans jamais l'afficher. Le consentement OAuth exige une action humaine dans un navigateur : c'est la seule étape qui ne peut pas être automatisée, et le jeton obtenu est précisément ce qui rend tout le reste automatique.

### 4. Secrets GitHub

Cinq secrets sous **Settings → Secrets and variables → Actions** :

| Secret | Où le trouver |
|---|---|
| `EXTENSION_ID` | URL de l'élément dans le dashboard développeur |
| `PUBLISHER_ID` | page Settings du dashboard développeur, requis par l'API v2 |
| `CLIENT_ID` | identifiants OAuth |
| `CLIENT_SECRET` | identifiants OAuth |
| `REFRESH_TOKEN` | étape 3 |

## Ce que fait le workflow

1. `npm ci` puis `npm test`.
2. Vérifie que le tag correspond à la version du manifeste.
3. Construit le paquet avec `git archive --format=zip -o dist/… HEAD:extension`, et surtout pas un `zip -r` du dossier : `git archive` n'emballe que les fichiers suivis par git et place `manifest.json` à la racine de l'archive, ce que le store exige.
4. Échange le refresh token contre un jeton d'accès, envoie le paquet sur `:upload`, sonde `:fetchStatus` si le traitement est différé, puis appelle `:publish`.

## Limite importante

Chaque envoi repasse par la revue de Google avant de devenir visible. Le pipeline automatise la soumission, pas l'approbation : l'état attendu en fin de course est `PENDING_REVIEW`.
