'use strict';

(function () {
  var DEFAULT_MODEL = 'claude-haiku-4-5';
  var DEFAULT_TARGET_LANG = 'fr';

  document.getElementById('title').textContent = chrome.i18n.getMessage('optionsTitle');
  document.getElementById('labelApiKey').textContent = chrome.i18n.getMessage('labelApiKey');
  document.getElementById('linkGetKey').textContent = chrome.i18n.getMessage('linkGetKey');
  document.getElementById('labelModel').textContent = chrome.i18n.getMessage('labelModel');
  document.getElementById('labelTargetLang').textContent = chrome.i18n.getMessage('labelTargetLang');
  document.getElementById('save').textContent = chrome.i18n.getMessage('btnSave');
  document.getElementById('test').textContent = chrome.i18n.getMessage('btnTest');

  var apiKeyInput = document.getElementById('apiKey');
  var toggleApiKeyBtn = document.getElementById('toggleApiKey');
  var modelSelect = document.getElementById('model');
  var targetLangSelect = document.getElementById('targetLang');
  var saveBtn = document.getElementById('save');
  var testBtn = document.getElementById('test');
  var statusEl = document.getElementById('status');

  function setToggleLabel() {
    toggleApiKeyBtn.textContent = apiKeyInput.type === 'password'
      ? chrome.i18n.getMessage('btnShow')
      : chrome.i18n.getMessage('btnHide');
  }
  setToggleLabel();

  function load() {
    chrome.storage.local.get(['apiKey', 'model', 'targetLang']).then(function (config) {
      apiKeyInput.value = config.apiKey || '';
      modelSelect.value = config.model || DEFAULT_MODEL;
      targetLangSelect.value = config.targetLang || DEFAULT_TARGET_LANG;
    });
  }

  toggleApiKeyBtn.addEventListener('click', function () {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
    setToggleLabel();
  });

  saveBtn.addEventListener('click', function () {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      targetLang: targetLangSelect.value
    }).then(function () {
      statusEl.textContent = chrome.i18n.getMessage('statusSaved');
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    });
  });

  testBtn.addEventListener('click', function () {
    statusEl.textContent = chrome.i18n.getMessage('statusTesting');
    chrome.runtime.sendMessage({
      type: 'test',
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value
    }).then(function (response) {
      statusEl.textContent = response.ok
        ? chrome.i18n.getMessage('statusOk')
        : chrome.i18n.getMessage('statusError') + ': ' + response.error.message;
    });
  });

  load();
})();
