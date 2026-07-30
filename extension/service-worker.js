'use strict';

(function (root) {
  var API_URL = 'https://api.anthropic.com/v1/messages';
  var ANTHROPIC_VERSION = '2023-06-01';
  var REQUEST_TIMEOUT_MS = 60000;
  var MAX_TOKENS_CAP = 131072;
  var DEFAULT_MODEL = 'claude-haiku-4-5';

  var SYSTEM_PROMPT_TEMPLATE = [
    "You are a professional translator. Translate the user's text into {TARGET_LANGUAGE}.",
    '',
    'Rules:',
    '- Preserve ALL markers exactly as they appear: <sN>...</sN> delimit segments, <tN>...</tN> wrap inline elements, <tN/> are atomic placeholders. Never add, remove, reorder or renumber markers. Translate the text around and inside them.',
    '- Keep in the original language: established technical terms, programming keywords, code, commands, file paths, product names, proper nouns, acronyms, and loanwords commonly used untranslated by native {TARGET_LANGUAGE} speakers in the field. When in doubt for a domain-specific term, keep the original term.',
    '- Preserve the register, tone and approximate length of the original.',
    '- Output ONLY the translated text with its markers. No preamble, no notes, no quotes around the output.'
  ].join('\n');

  var RETRY_CORRECTION_NOTE = '\n\nYour previous output had mismatched markers. Return the translation again with EXACTLY the same markers as the input.';

  var LANGUAGE_NAMES = {
    fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian',
    pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', ar: 'Arabic', ru: 'Russian'
  };

  function ApiError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function computeMaxTokens(payloadLength) {
    return Math.min(MAX_TOKENS_CAP, Math.ceil(payloadLength / 2) + 500);
  }

  function buildSystemPrompt(targetLangCode, correctionNote) {
    var langName = LANGUAGE_NAMES[targetLangCode] || targetLangCode;
    var base = SYSTEM_PROMPT_TEMPLATE.split('{TARGET_LANGUAGE}').join(langName);
    return correctionNote ? base + RETRY_CORRECTION_NOTE : base;
  }

  function buildRequestBody(payload, targetLangCode, model, correctionNote) {
    return {
      model: model,
      max_tokens: computeMaxTokens(payload.length),
      system: [{ type: 'text', text: buildSystemPrompt(targetLangCode, correctionNote) }],
      messages: [{ role: 'user', content: payload }]
    };
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function performRequest(apiKey, body, fetchImpl, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    return fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    }).catch(function (err) {
      if (err.name === 'AbortError') throw ApiError('NETWORK', 'Request timed out');
      throw ApiError('NETWORK', 'Could not reach the API');
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function requestWithRetry(apiKey, body, fetchImpl, timeoutMs, skipTruncationCheck) {
    return performRequest(apiKey, body, fetchImpl, timeoutMs).then(function (response) {
      if (response.status === 429) {
        var retryAfterHeader = response.headers.get('retry-after');
        var retryAfterSeconds = retryAfterHeader === null || Number.isNaN(Number(retryAfterHeader)) ? 5 : Number(retryAfterHeader);
        var waitMs = Math.min(30000, retryAfterSeconds * 1000);
        return sleep(waitMs).then(function () {
          return performRequest(apiKey, body, fetchImpl, timeoutMs);
        });
      }
      if (response.status === 529 || response.status === 500) {
        return sleep(2000).then(function () {
          return performRequest(apiKey, body, fetchImpl, timeoutMs);
        });
      }
      return response;
    }).then(function (response) {
      if (response.status === 401) throw ApiError('AUTH', 'Invalid API key');
      if (!response.ok) throw ApiError('HTTP', 'API error (' + response.status + ')');
      return response.json();
    }).then(function (json) {
      if (!skipTruncationCheck && json.stop_reason === 'max_tokens') throw ApiError('TRUNCATED', 'Response was truncated');
      return json;
    });
  }

  function extractText(json) {
    return (json.content || []).map(function (block) { return block.text || ''; }).join('');
  }

  function callAnthropicApi(apiKey, payload, targetLangCode, model, options) {
    var opts = options || {};
    var body = buildRequestBody(payload, targetLangCode, model, !!opts.correctionNote);
    return requestWithRetry(apiKey, body, opts.fetchImpl || fetch, opts.timeoutMs || REQUEST_TIMEOUT_MS)
      .then(extractText);
  }

  function pingApi(apiKey, model, options) {
    var opts = options || {};
    // max_tokens: 1 keeps the check cheap; that alone guarantees stop_reason
    // "max_tokens" on any real reply, so the truncation check must be skipped here.
    var body = { model: model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
    return requestWithRetry(apiKey, body, opts.fetchImpl || fetch, opts.timeoutMs || REQUEST_TIMEOUT_MS, true)
      .then(function () { return true; });
  }

  var api = {
    computeMaxTokens: computeMaxTokens,
    buildRequestBody: buildRequestBody,
    callAnthropicApi: callAnthropicApi,
    pingApi: pingApi,
    DEFAULT_MODEL: DEFAULT_MODEL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.IptrServiceWorkerApi = api;

  var CONTEXT_MENU_ID = 'iptr-translate-selection';

  chrome.runtime.onInstalled.addListener(function () {
    // removeAll d'abord : onInstalled se déclenche aussi sur mise à jour, et
    // create sur un id déjà pris lèverait une erreur.
    chrome.contextMenus.removeAll(function () {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: chrome.i18n.getMessage('btnTranslate'),
        contexts: ['selection']
      });
    });

    chrome.storage.local.get(['apiKey', 'model', 'targetLang', 'enabled']).then(function (existing) {
      var defaults = { apiKey: '', model: DEFAULT_MODEL, targetLang: 'fr', enabled: true };
      var toSet = {};
      Object.keys(defaults).forEach(function (key) {
        if (existing[key] === undefined) toSet[key] = defaults[key];
      });
      if (Object.keys(toSet).length > 0) chrome.storage.local.set(toSet);
    });
  });

  function handleTranslate(message) {
    return chrome.storage.local.get(['apiKey', 'model']).then(function (config) {
      if (!config.apiKey) {
        return { ok: false, error: { code: 'NO_KEY', message: 'No API key configured' } };
      }
      var model = config.model || DEFAULT_MODEL;
      return callAnthropicApi(config.apiKey, message.payload, message.targetLang, model, {
        correctionNote: !!message.correctionNote
      }).then(function (result) {
        return { ok: true, result: result };
      }).catch(function (err) {
        return { ok: false, error: { code: err.code || 'UNKNOWN', message: err.message } };
      });
    });
  }

  function handleTest(message) {
    if (!message.apiKey) {
      return Promise.resolve({ ok: false, error: { code: 'NO_KEY', message: 'No API key provided' } });
    }
    return pingApi(message.apiKey, message.model || DEFAULT_MODEL, {})
      .then(function () { return { ok: true }; })
      .catch(function (err) {
        return { ok: false, error: { code: err.code || 'UNKNOWN', message: err.message } };
      });
  }

  // Ciblage par frameId : le content script tourne en all_frames, sans lui le
  // message part au frame principal et rate une sélection faite dans une iframe.
  chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'translateSelection' }, { frameId: info.frameId });
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === 'translate') {
      handleTranslate(message).then(sendResponse);
      return true;
    }
    if (message.type === 'test') {
      handleTest(message).then(sendResponse);
      return true;
    }
    if (message.type === 'openOptions') {
      chrome.runtime.openOptionsPage();
      return false;
    }
    return false;
  });
})(typeof self !== 'undefined' ? self : globalThis);
