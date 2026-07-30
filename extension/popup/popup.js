'use strict';

(function () {
  document.getElementById('labelEnabled').textContent = chrome.i18n.getMessage('labelEnabled');
  document.getElementById('openOptions').textContent = chrome.i18n.getMessage('linkOptions');

  var enabledCheckbox = document.getElementById('enabled');
  var targetLangDisplay = document.getElementById('targetLangDisplay');
  var openOptionsLink = document.getElementById('openOptions');

  function load() {
    chrome.storage.local.get(['enabled', 'targetLang']).then(function (config) {
      enabledCheckbox.checked = config.enabled !== false;
      targetLangDisplay.textContent = chrome.i18n.getMessage('labelTargetLang') + ': ' + (config.targetLang || 'fr');
    });
  }

  enabledCheckbox.addEventListener('change', function () {
    chrome.storage.local.set({ enabled: enabledCheckbox.checked });
  });

  openOptionsLink.addEventListener('click', function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  load();
})();
