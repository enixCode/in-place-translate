<p align="center"><a href="README.fr.md">Français</a></p>

<p align="center">
  <img src="docs/assets/icon-512.png" width="96" alt="In-Place Translator">
</p>

<h1 align="center">In-Place Translator</h1>

<p align="center">Translate selected text in place on any page, with your own Anthropic API key.</p>

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension/` folder.

No build step, the folder ships as is.

## Setup

1. Open the extension options (popup, then **Options**).
2. Paste your API key from [console.anthropic.com](https://console.anthropic.com), pick a model and a target language, then **Save**.
3. Click **Test** to check the key against the API.

The key lives in `chrome.storage.local` on this machine only. It is never synced across browsers and never sent anywhere other than `api.anthropic.com`.

## Use

Select text on any page, then click the floating button or use **Translate** in the right-click menu. The selection is replaced by its translation, and a mini-bar lets you show the original, restore it, or translate again. The popup toggles the extension off without uninstalling it.

## Develop

```sh
npm install
npm test
```

`package.json` exists only for the test suite, it is not part of the shipped extension.

## License

MIT, see [LICENSE](LICENSE).
