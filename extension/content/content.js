'use strict';

(function () {
  var zones = new Map();
  var btnEl = null;
  var miniBarEl = null;
  var MIN_SELECTION_CHARS = 3;
  var MAX_BATCH_CHARS = 12000;

  function isOwnUiElement(el) {
    return !!(el && el.closest && (
      el.closest('.iptr-btn') ||
      el.closest('.iptr-minibar') ||
      el.closest('.iptr-overlay') ||
      el.closest('.iptr-toast')
    ));
  }

  function removeButton() {
    if (btnEl) { btnEl.remove(); btnEl = null; }
  }
  function removeMiniBar() {
    if (miniBarEl) { miniBarEl.remove(); miniBarEl = null; }
  }

  function clampToViewport(left, top, width, height) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (left + width > vw - 8) left = vw - width - 8;
    if (left < 8) left = 8;
    if (top + height > vh - 8) top = top - height - 8;
    if (top < 8) top = 8;
    return { left: left, top: top };
  }

  function positionAt(el, left, top) {
    var pos = clampToViewport(left, top, el.offsetWidth, el.offsetHeight);
    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
  }

  function onMouseUp(e) {
    if (isOwnUiElement(e.target)) return;
    // Clic droit : le menu natif s'ouvre au curseur, vers le bas. On retire la
    // bulle au lieu de la réafficher, sinon les deux se superposent.
    if (e.button !== 0) { removeButton(); return; }

    chrome.storage.local.get(['enabled']).then(function (config) {
      if (config.enabled === false) return;

      var selection = window.getSelection();
      var text = selection ? selection.toString().trim() : '';
      removeButton();
      if (text.length < MIN_SELECTION_CHARS || !selection || selection.rangeCount === 0) return;

      var range = selection.getRangeAt(0).cloneRange();
      var rect = range.getBoundingClientRect();

      btnEl = document.createElement('button');
      btnEl.className = 'iptr-btn';
      btnEl.textContent = chrome.i18n.getMessage('btnTranslate') || 'Translate';
      document.body.appendChild(btnEl);
      // Au-dessus de la sélection, centrée : le menu contextuel natif descend
      // toujours depuis le curseur, donc les deux ne peuvent plus se croiser.
      // Repli en dessous quand la sélection touche le haut du viewport.
      var above = rect.top - btnEl.offsetHeight - 8;
      positionAt(
        btnEl,
        rect.left + rect.width / 2 - btnEl.offsetWidth / 2,
        above >= 8 ? above : rect.bottom + 8
      );

      btnEl.addEventListener('click', function () {
        removeButton();
        triggerTranslate(range);
      });
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeButton();
      removeMiniBar();
    }
  }

  function onDocumentMouseDown(e) {
    if (miniBarEl && !miniBarEl.contains(e.target) && !(e.target.closest && e.target.closest('[data-iptr-id]'))) {
      removeMiniBar();
    }
  }

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('contextmenu', removeButton);

  function planBatches(segments, maxChars) {
    // Chaque candidat est sérialisé JOINTEMENT (pas segment par segment
    // isolément) : les index de marqueurs sN/tN sont globaux au lot, donc
    // leur largeur en chiffres change avec la taille du lot. Une estimation
    // par somme de longueurs individuelles sous-évalue la longueur réelle
    // envoyée par translateBatch. Le cout O(n^2) est negligeable ici (au
    // plus quelques dizaines de segments par selection).
    var batches = [];
    var current = [];
    segments.forEach(function (seg, idx) {
      var candidate = current.concat([idx]);
      var candidateLen = IptrDom.serializeSegments(candidate.map(function (i) { return segments[i]; })).payload.length;
      if (current.length > 0 && candidateLen > maxChars) {
        batches.push(current);
        current = [idx];
      } else {
        current = candidate;
      }
    });
    if (current.length > 0) batches.push(current);
    return batches;
  }

  function sendTranslateMessage(payload, targetLang, correctionNote) {
    // Normalise tout rejet (canal de message rompu, contexte d'extension
    // invalide) en une reponse { ok:false } : sans ce catch, une rejection
    // remonterait sans etre interceptee par translateBatch/runNextBatch et
    // laisserait la zone bloquee en etat "loading" indefiniment, ce qui
    // viole l'invariant d'erreur (aucun etat "moitie traduit" visible).
    return chrome.runtime.sendMessage({ type: 'translate', payload: payload, targetLang: targetLang, correctionNote: !!correctionNote })
      .catch(function (err) {
        return { ok: false, error: { code: 'NETWORK', message: (err && err.message) || 'Extension message failed' } };
      });
  }

  function showLoadingIndicator(zone) {
    // Le spinner est insere comme FRERE du dernier span de segment, jamais
    // comme enfant : s'il etait un enfant, IptrDom.serializeSegments (qui
    // parcourt seg.el.childNodes) l'inclurait dans le payload envoye a
    // l'API comme un token <tN></tN> parasite.
    zone.segments.forEach(function (seg) { seg.el.classList.add('iptr-loading'); });
    var lastSeg = zone.segments[zone.segments.length - 1];
    var spinner = document.createElement('span');
    spinner.className = 'iptr-spinner';
    lastSeg.el.parentNode.insertBefore(spinner, lastSeg.el.nextSibling);
    zone.spinnerEl = spinner;
  }

  function hideLoadingIndicator(zone) {
    zone.segments.forEach(function (seg) { seg.el.classList.remove('iptr-loading'); });
    if (zone.spinnerEl && zone.spinnerEl.parentNode) zone.spinnerEl.remove();
  }

  function translateBatch(zone, segmentIndices, targetLang) {
    var batchSegments = segmentIndices.map(function (i) { return zone.segments[i]; });
    var serialized = IptrDom.serializeSegments(batchSegments);
    var payload = serialized.payload;
    var tokenMap = serialized.tokenMap;

    return sendTranslateMessage(payload, targetLang, false).then(function (result) {
      if (!result.ok) return result;

      if (IptrDom.validateMarkers(payload, result.result)) {
        var parsed = IptrDom.parseTranslatedPayload(result.result, tokenMap, document);
        IptrDom.applyParsedSegments(zone.segments, parsed, segmentIndices[0]);
        return { ok: true };
      }

      return sendTranslateMessage(payload, targetLang, true).then(function (retryResult) {
        if (retryResult.ok && IptrDom.validateMarkers(payload, retryResult.result)) {
          var retryParsed = IptrDom.parseTranslatedPayload(retryResult.result, tokenMap, document);
          IptrDom.applyParsedSegments(zone.segments, retryParsed, segmentIndices[0]);
          return { ok: true };
        }

        var plainPayload = IptrDom.plainSerializeSegments(batchSegments);
        return sendTranslateMessage(plainPayload, targetLang, false).then(function (plainResult) {
          if (!plainResult.ok) return plainResult;
          var plainParsed = IptrDom.parseTranslatedPayload(plainResult.result, new Map(), document);
          IptrDom.applyParsedSegments(zone.segments, plainParsed, segmentIndices[0]);
          return { ok: true, degraded: true };
        });
      });
    });
  }

  function triggerTranslate(range) {
    chrome.storage.local.get(['targetLang']).then(function (config) {
      var targetLang = config.targetLang || 'fr';
      var doc = document;

      var fusion = IptrDom.resolveFusionAndReconstructRange(range, doc, zones);
      var zoneId = IptrDom.generateZoneId();
      var zone = IptrDom.wrapRangeIntoZone(fusion.range, zoneId, doc);
      // Sélection entièrement non traduisible (bloc <pre>, code inline seul) :
      // aucun span n'a été posé, le DOM est intact. Sans cette garde,
      // showLoadingIndicator lirait zone.segments[-1].el et jetterait.
      if (zone.segments.length === 0) {
        showToast(chrome.i18n.getMessage('errNothingToTranslate') || 'Nothing to translate in the selection');
        return;
      }
      zone.targetLang = targetLang;
      zones.set(zoneId, zone);
      showLoadingIndicator(zone);

      var batches = planBatches(zone.segments, MAX_BATCH_CHARS);

      function runNextBatch(batchIndex) {
        if (zone.cancelled) return;
        if (batchIndex >= batches.length) {
          zone.status = 'done';
          hideLoadingIndicator(zone);
          return;
        }
        translateBatch(zone, batches[batchIndex], targetLang).then(function (result) {
          if (zone.cancelled) return;
          if (!result.ok) {
            IptrDom.restoreZone(zone);
            zones.delete(zoneId);
            hideLoadingIndicator(zone);
            showTranslateError(result.error);
            return;
          }
          runNextBatch(batchIndex + 1);
        });
      }

      runNextBatch(0);
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message.type !== 'translateSelection') return;
    removeButton();
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    if (selection.toString().trim().length < MIN_SELECTION_CHARS) return;
    // Le Range est cloné avant l'attente du storage : la sélection peut
    // disparaître pendant que la promesse se résout.
    var range = selection.getRangeAt(0).cloneRange();
    chrome.storage.local.get(['enabled']).then(function (config) {
      if (config.enabled === false) return;
      triggerTranslate(range);
    });
  });

  function makeMiniBarButton(label) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    return btn;
  }

  function showOriginalOverlay(zone, anchorEl) {
    var originalText = zone.segments.map(function (seg) { return seg.originalFragment.textContent; }).join(' ');
    var bubble = document.createElement('div');
    bubble.className = 'iptr-overlay';
    bubble.textContent = originalText;
    document.body.appendChild(bubble);
    var rect = anchorEl.getBoundingClientRect();
    positionAt(bubble, rect.left, rect.bottom + 6);
    return bubble;
  }

  function retranslateZone(zone) {
    var restoredBySegment = IptrDom.restoreZone(zone);
    zones.delete(zone.id);
    var allNodes = restoredBySegment.reduce(function (acc, nodes) { return acc.concat(nodes); }, []);
    if (allNodes.length === 0) return;
    var range = document.createRange();
    range.setStartBefore(allNodes[0]);
    range.setEndAfter(allNodes[allNodes.length - 1]);
    triggerTranslate(range);
  }

  function showMiniBar(zone, anchorEl) {
    removeMiniBar();
    var bar = document.createElement('div');
    bar.className = 'iptr-minibar';

    var originalBtn = makeMiniBarButton(chrome.i18n.getMessage('btnOriginal') || 'Original');
    var restoreBtn = makeMiniBarButton(chrome.i18n.getMessage('btnRestore') || 'Restore');
    var retranslateBtn = makeMiniBarButton(chrome.i18n.getMessage('btnRetranslate') || 'Retranslate');

    var overlay = null;
    originalBtn.addEventListener('mouseenter', function () { overlay = showOriginalOverlay(zone, anchorEl); });
    originalBtn.addEventListener('mouseleave', function () { if (overlay) { overlay.remove(); overlay = null; } });

    restoreBtn.addEventListener('click', function () {
      IptrDom.restoreZone(zone);
      zones.delete(zone.id);
      removeMiniBar();
    });

    retranslateBtn.addEventListener('click', function () {
      removeMiniBar();
      retranslateZone(zone);
    });

    bar.appendChild(originalBtn);
    bar.appendChild(restoreBtn);
    bar.appendChild(retranslateBtn);
    document.body.appendChild(bar);
    var rect = anchorEl.getBoundingClientRect();
    positionAt(bar, rect.left, rect.bottom + 6);
    miniBarEl = bar;
  }

  function showCancelBar(zone, anchorEl) {
    removeMiniBar();
    var bar = document.createElement('div');
    bar.className = 'iptr-minibar';
    var cancelBtn = makeMiniBarButton(chrome.i18n.getMessage('btnCancel') || 'Cancel');
    cancelBtn.addEventListener('click', function () {
      zone.cancelled = true;
      IptrDom.restoreZone(zone);
      zones.delete(zone.id);
      hideLoadingIndicator(zone);
      removeMiniBar();
    });
    bar.appendChild(cancelBtn);
    document.body.appendChild(bar);
    var rect = anchorEl.getBoundingClientRect();
    positionAt(bar, rect.left, rect.bottom + 6);
    miniBarEl = bar;
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest && e.target.closest('[data-iptr-id]');
    if (!target) return;
    var zoneId = target.getAttribute('data-iptr-id');
    var zone = zones.get(zoneId);
    if (!zone) return;
    if (zone.status === 'loading') {
      showCancelBar(zone, target);
    } else if (zone.status === 'done') {
      showMiniBar(zone, target);
    }
  });

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'iptr-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 5000);
    return toast;
  }

  function errorMessageFor(error) {
    var map = {
      NO_KEY: chrome.i18n.getMessage('errNoKey') || 'Add your API key in the options',
      AUTH: chrome.i18n.getMessage('errAuth') || 'Invalid API key',
      HTTP: chrome.i18n.getMessage('errHttp') || 'Too many requests, try again',
      NETWORK: chrome.i18n.getMessage('errNetwork') || 'Could not reach the API',
      TRUNCATED: chrome.i18n.getMessage('errGeneric') || 'Translation failed'
    };
    return map[error.code] || map.HTTP;
  }

  function showTranslateError(error) {
    if (error.code === 'NO_KEY' || error.code === 'AUTH') {
      var toast = showToast(errorMessageFor(error) + ' ');
      var link = document.createElement('a');
      link.href = '#';
      link.textContent = chrome.i18n.getMessage('btnOpenOptions') || 'Open options';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: 'openOptions' });
      });
      toast.appendChild(link);
    } else {
      showToast(errorMessageFor(error));
    }
  }

  // Exposées pour les Tasks 7 et 8 (même IIFE, même scope de fonction).
  window.__iptrInternal = { zones: zones, MAX_BATCH_CHARS: MAX_BATCH_CHARS, positionAt: positionAt, removeMiniBar: removeMiniBar };
})();
