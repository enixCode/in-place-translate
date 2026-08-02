<p align="center"><a href="README.md">English</a></p>

<p align="center">
  <img src="docs/assets/icon-512.png" width="96" alt="In-Place Translator">
</p>

<h1 align="center">In-Place Translator</h1>

<p align="center">Traduisez le texte sélectionné directement sur la page, avec votre propre clé API Anthropic.</p>

<p align="center"><a href="https://chromewebstore.google.com/detail/kekghjcpdoelkaojmajjbhckegaeoapc"><b>Installer depuis le Chrome Web Store</b></a></p>

## Installation depuis les sources

1. Clonez ou téléchargez ce dépôt.
2. Ouvrez `chrome://extensions` et activez le **mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier `extension/`.

Aucune étape de build, le dossier se charge tel quel.

## Configuration

1. Ouvrez les options de l'extension (le popup, puis **Options**).
2. Collez votre clé API depuis [console.anthropic.com](https://console.anthropic.com), choisissez un modèle et une langue cible, puis **Enregistrer**.
3. Cliquez sur **Tester** pour valider la clé auprès de l'API.

La clé reste dans `chrome.storage.local`, sur cette machine uniquement. Elle n'est jamais synchronisée entre navigateurs et n'est envoyée nulle part ailleurs que vers `api.anthropic.com`.

## Accès aux pages

L'extension ne demande aucun accès aux sites que vous visitez lors de l'installation. Ouvrez
le popup et cliquez sur **Autoriser sur tous les sites** pour que le bouton flottant
apparaisse de lui-même pendant votre lecture. Si vous préférez vous en passer, ignorez cette
étape : **Traduire** dans le menu contextuel fonctionne sans aucun accès aux sites. La
permission est révocable à tout moment depuis Chrome.

## Utilisation

Sélectionnez du texte sur n'importe quelle page, puis cliquez sur le bouton flottant ou utilisez **Traduire** dans le menu contextuel. La sélection est remplacée par sa traduction, et une mini-barre permet d'afficher l'original, de le restaurer ou de retraduire. Le popup désactive l'extension sans la désinstaller.

## Développement

```sh
npm install
npm test
```

`package.json` n'existe que pour la suite de tests, il ne fait pas partie de l'extension livrée.

## Licence

MIT, voir [LICENSE](LICENSE).
