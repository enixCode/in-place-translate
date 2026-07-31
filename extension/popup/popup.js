'use strict';

(function () {
  var ALL_URLS = '<all_urls>';

  document.getElementById('labelEnabled').textContent = chrome.i18n.getMessage('labelEnabled');
  document.getElementById('openOptions').textContent = chrome.i18n.getMessage('linkOptions');

  var enabledCheckbox = document.getElementById('enabled');
  var targetLangDisplay = document.getElementById('targetLangDisplay');
  var openOptionsLink = document.getElementById('openOptions');
  var accessStatus = document.getElementById('siteAccessStatus');
  var grantBtn = document.getElementById('grantAccess');

  grantBtn.textContent = chrome.i18n.getMessage('btnAllowAllSites');

  function loadAccess() {
    chrome.permissions.contains({ origins: [ALL_URLS] }).then(function (granted) {
      accessStatus.textContent = chrome.i18n.getMessage(
        granted ? 'statusAccessGranted' : 'statusAccessNeeded'
      );
      grantBtn.hidden = granted;
    });
  }

  // La demande doit partir d'un geste utilisateur, sinon Chrome la refuse.
  grantBtn.addEventListener('click', function () {
    chrome.permissions.request({ origins: [ALL_URLS] }).then(loadAccess);
  });

  function load() {
    chrome.storage.local.get(['enabled', 'targetLang']).then(function (config) {
      enabledCheckbox.checked = config.enabled !== false;
      targetLangDisplay.textContent = chrome.i18n.getMessage('labelTargetLang') + ': ' + (config.targetLang || 'fr');
    });
    loadAccess();
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
