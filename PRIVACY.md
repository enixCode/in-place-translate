# Privacy Policy

In-Place Translator, last updated 2026-07-30.

## What is sent, and where

When you ask for a translation, and only then, the text you selected is sent to the
Anthropic Messages API at `https://api.anthropic.com/v1/messages`, along with your own API
key for authentication and the target language you chose.

`api.anthropic.com` is the only remote server this extension ever contacts. There is no
server operated by the developer, no analytics, no telemetry, no error reporting and no
third-party service of any kind.

Anthropic processes that request under its own terms and privacy policy, since the request
is made with your key against your own account.

## What is stored, and where

Four values are stored locally with `chrome.storage.local`, on your device only:

- your Anthropic API key
- the selected model
- the target language
- the enabled or disabled state

`chrome.storage.local` is never synchronised to your Google account nor to any other
browser. Uninstalling the extension removes all four.

## What is never collected

The developer receives nothing: no browsing history, no page content, no personal
information, no usage statistics, no crash reports.

Selected text is never stored, neither locally nor remotely. It stays in memory for the
duration of a translation and is then discarded. Translated text is inserted into the page
in memory only, so reloading the page restores the original.

## Why each permission is needed

- `storage`: keep the four settings above between browser sessions.
- `contextMenus`: add the single "Translate" entry, shown only on a text selection.
- `activeTab`: reach the tab you acted on, and only after you click that entry.
- `scripting`: load the in-page script, on demand or on the sites you allowed.
- host access to `https://api.anthropic.com/*`: send the translation request.

Access to the pages you read is **not** requested at install time. The extension asks for
it only when you want the floating button to appear on its own, from the popup, and you
may refuse: the right-click menu keeps working without it. Revoking it later from Chrome
disables the in-page button and nothing else.

## Contact

enixcode@pm.me

Source code: https://github.com/enixCode/in-place-translate
