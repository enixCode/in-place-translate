# Mises à jour automatisées vers le Chrome Web Store

## Prérequis

- La première soumission de l'extension a été faite manuellement sur le [Developer Dashboard](https://chromewebstore.google.com/devconsole) et approuvée (impossible à automatiser).
- L'**ID de l'extension** est connu (visible dans l'URL du dashboard une fois l'item créé, ~32 caractères).

## 1. Activer l'API Chrome Web Store

Sur [console.cloud.google.com](https://console.cloud.google.com), créer un projet (ou réutiliser un projet existant), puis activer l'API **"Chrome Web Store API"** pour ce projet.

## 2. Créer les identifiants OAuth 2.0

Dans ce même projet Google Cloud : créer des identifiants OAuth 2.0 de type **"Desktop app"**. Récupérer le **Client ID** et le **Client Secret** générés.

## 3. Générer le refresh token

Utiliser l'outil compagnon [`chrome-webstore-upload-keys`](https://github.com/fregante/chrome-webstore-upload-keys) (même auteur que l'outil de publication) : il fait l'autorisation OAuth en une commande et retourne directement le **Refresh Token**. Cette étape ne se fait qu'une seule fois.

## 4. Ajouter les secrets sur GitHub

Dans le repository : **Settings → Secrets and variables → Actions**, ajouter 4 secrets chiffrés :

- `CLIENT_ID`
- `CLIENT_SECRET`
- `REFRESH_TOKEN`
- `EXTENSION_ID`

## 5. Workflow GitHub Actions

Un workflow déclenché sur un tag ou une release :

- installe les dépendances (`npm ci`) et lance les tests (`npm test`)
- construit le paquet avec `git archive --format=zip -o dist/in-place-translate-<version>.zip HEAD:extension`, et surtout pas un `zip -r` du dossier : `git archive` n'emballe que les fichiers suivis par git, et place `manifest.json` à la racine de l'archive, ce que le store exige (sortie dans `dist/`, exclu du dépôt via `.gitignore`)
- lance `npx chrome-webstore-upload-cli upload` puis `publish`, avec les 4 secrets ci-dessus en variables d'environnement

Le store refuse un paquet dont la version n'est pas strictement supérieure à celle déjà publiée. Le tag qui déclenche le workflow doit donc correspondre à la version du manifeste, incrémentée avant de taguer.

## Limite importante

Même automatisé, chaque envoi repasse par la revue de Google avant de devenir visible publiquement. Le CI/CD automatise uniquement l'étape « soumettre », pas l'approbation.
