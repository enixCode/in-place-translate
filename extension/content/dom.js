'use strict';

(function (root) {
  var BLOCK_DISPLAY_VALUES = new Set([
    'block', 'list-item', 'table', 'table-row', 'table-cell',
    'table-row-group', 'table-header-group', 'table-footer-group',
    'flex', 'grid', 'flow-root'
  ]);

  var EXCLUDED_BLOCK_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'PRE']);
  var ATOMIC_INLINE_TAGS = new Set(['IMG', 'BR']);

  function isExcludedElement(el) {
    if (el.nodeType !== 1) return false;
    if (EXCLUDED_BLOCK_TAGS.has(el.tagName)) return true;
    if (el.tagName === 'CODE') {
      if (el.parentElement && el.parentElement.tagName === 'PRE') return true;
      if (isBlockElement(el)) return true;
    }
    return false;
  }

  function isBlockElement(el) {
    if (el.nodeType !== 1) return false;
    if (el.tagName === 'BR') return false;
    var view = el.ownerDocument.defaultView;
    if (!view) return false;
    var display = view.getComputedStyle(el).display;
    return BLOCK_DISPLAY_VALUES.has(display);
  }

  function isAtomicInline(el) {
    if (el.nodeType !== 1) return false;
    if (ATOMIC_INLINE_TAGS.has(el.tagName)) return true;
    if (el.tagName === 'CODE') return true;
    return false;
  }

  function hasTranslatableContent(range) {
    var frag = range.cloneContents();
    return nodeHasTranslatableContent(frag);
  }

  function nodeHasTranslatableContent(node) {
    if (node.nodeType === 3) return node.textContent.trim().length > 0;
    if (node.nodeType === 1 && isExcludedElement(node)) return false;
    // Le contenu d'un atomique (<code>, <img>, <br>) n'est jamais envoyé au
    // modèle : il ne compte donc pas comme traduisible, sinon on wrappe une
    // zone et on paie un appel API pour un payload sans un mot à traduire.
    if (node.nodeType === 1 && isAtomicInline(node)) return false;
    if (node.nodeType === 1 || node.nodeType === 11) {
      return Array.prototype.slice.call(node.childNodes).some(nodeHasTranslatableContent);
    }
    return false;
  }

  function collectCutPoints(range) {
    var cuts = [];

    function addCutBefore(node) {
      var parent = node.parentNode;
      var idx = Array.prototype.indexOf.call(parent.childNodes, node);
      cuts.push([parent, idx]);
    }
    function addCutAfter(node) {
      var parent = node.parentNode;
      var idx = Array.prototype.indexOf.call(parent.childNodes, node) + 1;
      cuts.push([parent, idx]);
    }
    function addCutInsideStart(node) {
      cuts.push([node, 0]);
    }
    function addCutInsideEnd(node) {
      cuts.push([node, node.childNodes.length]);
    }

    function walk(node) {
      if (!range.intersectsNode(node)) return;
      if (node.nodeType !== 1) return;

      if (isExcludedElement(node)) {
        addCutBefore(node);
        addCutAfter(node);
        return;
      }
      if (isBlockElement(node) || node.tagName === 'BR') {
        // Les coupures se placent À L'INTÉRIEUR de la frontière du bloc
        // (pas au niveau du parent) : sinon un segment dont l'autre borne
        // est profondément à l'intérieur de ce bloc le contiendrait
        // partiellement, et Range.extractContents/surroundContents
        // lancerait InvalidStateError.
        addCutInsideStart(node);
        if (node.tagName !== 'BR') {
          Array.prototype.slice.call(node.childNodes).forEach(walk);
        }
        addCutInsideEnd(node);
        return;
      }
      Array.prototype.slice.call(node.childNodes).forEach(walk);
    }

    var root = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode;

    Array.prototype.slice.call(root.childNodes).forEach(walk);
    return cuts;
  }

  function comparePoints(doc, a, b) {
    var r1 = doc.createRange();
    r1.setStart(a[0], a[1]);
    r1.collapse(true);
    var r2 = doc.createRange();
    r2.setStart(b[0], b[1]);
    r2.collapse(true);
    return r1.compareBoundaryPoints(r1.START_TO_START, r2);
  }

  function getSegmentRanges(range) {
    var doc = range.startContainer.ownerDocument;
    var rawCuts = collectCutPoints(range);
    var insideCuts = rawCuts.filter(function (point) {
      return range.comparePoint(point[0], point[1]) === 0;
    });

    var points = [[range.startContainer, range.startOffset]]
      .concat(insideCuts)
      .concat([[range.endContainer, range.endOffset]]);

    points.sort(function (a, b) { return comparePoints(doc, a, b); });

    var segments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var start = points[i];
      var end = points[i + 1];
      var segRange = doc.createRange();
      segRange.setStart(start[0], start[1]);
      segRange.setEnd(end[0], end[1]);
      if (segRange.collapsed) continue;
      if (!hasTranslatableContent(segRange)) continue;
      segments.push(segRange);
    }
    return segments;
  }

  function generateZoneId() {
    return 'iptr-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  var INLINE_WRAP_TAGS = new Set([
    'A', 'B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'SUB', 'SUP', 'SPAN', 'SMALL', 'ABBR', 'CITE', 'Q'
  ]);

  // « & » est échappé en premier et déséchappé en dernier : sinon un texte
  // contenant littéralement « &lt; » (une page qui parle de HTML) reviendrait
  // de l'aller-retour transformé en « < ».
  function escapeMarkerText(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function unescapeMarkerText(str) {
    return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  function wrapRangeIntoZone(range, zoneId, doc) {
    var segmentRanges = getSegmentRanges(range);
    var segments = segmentRanges.map(function (segRange, i) {
      // extractContents (pas surroundContents) car un segment peut
      // commencer ou finir au milieu d'une balise inline (ex: sélection
      // qui démarre à l'intérieur d'un <b>) : extractContents découpe
      // alors l'élément en deux automatiquement, comme le ferait un
      // navigateur natif. surroundContents lèverait InvalidStateError.
      var liveFragment = segRange.extractContents();
      var originalFragment = liveFragment.cloneNode(true);
      var span = doc.createElement('span');
      span.setAttribute('data-iptr-id', zoneId);
      span.setAttribute('data-iptr-seg', String(i));
      span.appendChild(liveFragment);
      segRange.insertNode(span);
      return { el: span, originalFragment: originalFragment };
    });
    return { id: zoneId, segments: segments, status: 'loading' };
  }

  function serializeNode(node, tokenMap, nextId) {
    if (node.nodeType === 3) {
      return escapeMarkerText(node.textContent);
    }
    if (node.nodeType === 1) {
      if (isAtomicInline(node)) {
        var atomicId = nextId();
        // On conserve le nœud ENTIER, pas seulement son tag et ses attributs :
        // un atomique non void comme <code> a des enfants qui ne sont jamais
        // envoyés au modèle, et qui seraient perdus si on le reconstruisait
        // depuis une coquille vide (SPEC §7.5 : « <tN/> → l'élément original
        // N tel quel »).
        tokenMap.set(atomicId, { atomic: true, node: node.cloneNode(true) });
        return '<t' + atomicId + '/>';
      }
      if (INLINE_WRAP_TAGS.has(node.tagName)) {
        var wrapId = nextId();
        tokenMap.set(wrapId, {
          tag: node.tagName,
          attrs: Array.prototype.slice.call(node.attributes || []).map(function (a) { return [a.name, a.value]; }),
          atomic: false
        });
        var inner = Array.prototype.slice.call(node.childNodes)
          .map(function (child) { return serializeNode(child, tokenMap, nextId); }).join('');
        return '<t' + wrapId + '>' + inner + '</t' + wrapId + '>';
      }
      // Élément inline inconnu (ex: <font>, custom element) : transparent,
      // on ne sérialise que ses enfants.
      return Array.prototype.slice.call(node.childNodes)
        .map(function (child) { return serializeNode(child, tokenMap, nextId); }).join('');
    }
    return '';
  }

  function serializeSegments(segments) {
    var tokenCounter = 0;
    var tokenMap = new Map();
    var nextId = function () { return tokenCounter++; };
    var segmentMarkup = segments.map(function (seg, i) {
      var inner = Array.prototype.slice.call(seg.el.childNodes)
        .map(function (child) { return serializeNode(child, tokenMap, nextId); }).join('');
      return '<s' + i + '>' + inner + '</s' + i + '>';
    });
    return { payload: segmentMarkup.join(''), tokenMap: tokenMap };
  }

  function plainSerializeSegments(segments) {
    var segmentMarkup = segments.map(function (seg, i) {
      return '<s' + i + '>' + escapeMarkerText(seg.el.textContent) + '</s' + i + '>';
    });
    return segmentMarkup.join('');
  }

  function rebuildElementShell(info, doc) {
    var el = doc.createElement(info.tag);
    info.attrs.forEach(function (pair) { el.setAttribute(pair[0], pair[1]); });
    return el;
  }

  function parseInline(markup, tokenMap, doc) {
    var frag = doc.createDocumentFragment();
    var tokenRegex = /<t(\d+)\/>|<t(\d+)>([\s\S]*?)<\/t\2>/g;
    var lastIndex = 0;
    var match;
    while ((match = tokenRegex.exec(markup)) !== null) {
      if (match.index > lastIndex) {
        var text = unescapeMarkerText(markup.slice(lastIndex, match.index));
        if (text) frag.appendChild(doc.createTextNode(text));
      }
      if (match[1] !== undefined) {
        var atomicInfo = tokenMap.get(Number(match[1]));
        frag.appendChild(doc.importNode(atomicInfo.node, true));
      } else {
        var wrapInfo = tokenMap.get(Number(match[2]));
        var el = rebuildElementShell(wrapInfo, doc);
        el.appendChild(parseInline(match[3], tokenMap, doc));
        frag.appendChild(el);
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < markup.length) {
      var tail = unescapeMarkerText(markup.slice(lastIndex));
      if (tail) frag.appendChild(doc.createTextNode(tail));
    }
    return frag;
  }

  function parseTranslatedPayload(payload, tokenMap, doc) {
    var segmentRegex = /<s(\d+)>([\s\S]*?)<\/s\1>/g;
    var results = new Map();
    var match;
    while ((match = segmentRegex.exec(payload)) !== null) {
      results.set(Number(match[1]), parseInline(match[2], tokenMap, doc));
    }
    return results;
  }

  function applyParsedSegments(segments, parsedMap, indexOffset) {
    parsedMap.forEach(function (frag, localIdx) {
      var seg = segments[indexOffset + localIdx];
      seg.el.innerHTML = '';
      seg.el.appendChild(frag);
    });
  }

  function validateMarkers(sentPayload, receivedPayload) {
    function extractIds(str) {
      var ids = [];
      var re = /<(s|t)(\d+)(?:\/)?>/g;
      var m;
      while ((m = re.exec(str)) !== null) ids.push(m[1] + m[2]);
      return ids.sort().join(',');
    }
    return extractIds(sentPayload) === extractIds(receivedPayload);
  }

  function restoreZone(zone) {
    var restoredNodesBySegment = zone.segments.map(function (seg) {
      var nodes = Array.prototype.slice.call(seg.originalFragment.childNodes);
      seg.el.replaceWith(seg.originalFragment);
      return nodes;
    });
    zone.status = 'restored';
    return restoredNodesBySegment;
  }

  function resolveFusionAndReconstructRange(range, doc, zonesRegistry) {
    var endRange = range.cloneRange();
    endRange.collapse(false);
    var endMarker = doc.createElement('span');
    endMarker.setAttribute('data-iptr-boundary', 'end');
    endRange.insertNode(endMarker);

    var startRange = range.cloneRange();
    startRange.collapse(true);
    var startMarker = doc.createElement('span');
    startMarker.setAttribute('data-iptr-boundary', 'start');
    startRange.insertNode(startMarker);

    var absorbedIds = [];
    zonesRegistry.forEach(function (zone, zoneId) {
      var intersects = zone.segments.some(function (seg) { return range.intersectsNode(seg.el); });
      if (intersects) absorbedIds.push(zoneId);
    });
    absorbedIds.forEach(function (zoneId) {
      restoreZone(zonesRegistry.get(zoneId));
      zonesRegistry.delete(zoneId);
    });

    var newRange = doc.createRange();
    newRange.setStartAfter(startMarker);
    newRange.setEndBefore(endMarker);

    startMarker.remove();
    endMarker.remove();

    return { range: newRange, absorbedIds: absorbedIds };
  }

  var api = {
    generateZoneId: generateZoneId,
    getSegmentRanges: getSegmentRanges,
    isExcludedElement: isExcludedElement,
    isBlockElement: isBlockElement,
    isAtomicInline: isAtomicInline,
    hasTranslatableContent: hasTranslatableContent,
    wrapRangeIntoZone: wrapRangeIntoZone,
    serializeSegments: serializeSegments,
    plainSerializeSegments: plainSerializeSegments,
    parseTranslatedPayload: parseTranslatedPayload,
    applyParsedSegments: applyParsedSegments,
    validateMarkers: validateMarkers,
    restoreZone: restoreZone,
    resolveFusionAndReconstructRange: resolveFusionAndReconstructRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.IptrDom = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
