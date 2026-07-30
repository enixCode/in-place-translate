'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const IptrDom = require('../extension/content/dom.js');

function setup(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return dom.window.document;
}

test('wrap + serialize + translate roundtrip preserves tags and attributes', () => {
  const doc = setup('<p id="p1">Some <b>bold</b> and <a href="https://x.test">a link</a>, plus <img src="pic.png" alt="pic"> here.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const zone = IptrDom.wrapRangeIntoZone(r, 'z1', doc);
  const { payload, tokenMap } = IptrDom.serializeSegments(zone.segments);

  assert.equal(payload, '<s0>Some <t0>bold</t0> and <t1>a link</t1>, plus <t2/> here.</s0>');

  // Simulate a translation: uppercase the free text, keep every marker.
  const translated = payload.replace(/(<s\d+>|<\/s\d+>|<t\d+\/>|<t\d+>|<\/t\d+>)|([^<]+)/g, (m, marker, text) => (
    marker || text.toUpperCase()
  ));
  assert.ok(IptrDom.validateMarkers(payload, translated));

  const parsed = IptrDom.parseTranslatedPayload(translated, tokenMap, doc);
  IptrDom.applyParsedSegments(zone.segments, parsed, 0);

  assert.equal(
    p.innerHTML,
    '<span data-iptr-id="z1" data-iptr-seg="0">SOME <b>BOLD</b> AND <a href="https://x.test">A LINK</a>, PLUS <img src="pic.png" alt="pic"> HERE.</span>'
  );
});

test('an atomic inline <code> keeps its content through a translation roundtrip', () => {
  // Cas reel : https://jalammar.github.io/illustrated-transformer/
  const doc = setup('<p id="p1">Say: <code class="language-plaintext highlighter-rouge">The animal didn\'t cross the street</code> here.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const zone = IptrDom.wrapRangeIntoZone(r, 'zCode', doc);
  const { payload, tokenMap } = IptrDom.serializeSegments(zone.segments);

  assert.equal(payload, '<s0>Say: <t0/> here.</s0>');

  const translated = '<s0>Voici : <t0/> ici.</s0>';
  assert.ok(IptrDom.validateMarkers(payload, translated));
  const parsed = IptrDom.parseTranslatedPayload(translated, tokenMap, doc);
  IptrDom.applyParsedSegments(zone.segments, parsed, 0);

  assert.equal(
    p.innerHTML,
    '<span data-iptr-id="zCode" data-iptr-seg="0">Voici : <code class="language-plaintext highlighter-rouge">The animal didn\'t cross the street</code> ici.</span>'
  );
});

test('escaping round-trips text that literally contains &lt;', () => {
  const doc = setup('<p id="p1">Write &amp;lt;div&amp;gt; to show a tag.</p>');
  const p = doc.getElementById('p1');
  const original = p.textContent;
  const r = doc.createRange();
  r.selectNodeContents(p);
  const zone = IptrDom.wrapRangeIntoZone(r, 'zAmp', doc);
  const { payload, tokenMap } = IptrDom.serializeSegments(zone.segments);

  assert.equal(payload, '<s0>Write &amp;lt;div&amp;gt; to show a tag.</s0>');

  const parsed = IptrDom.parseTranslatedPayload(payload, tokenMap, doc);
  IptrDom.applyParsedSegments(zone.segments, parsed, 0);
  assert.equal(p.textContent, original);
});

test('validateMarkers detects a mismatch', () => {
  const sent = '<s0>Hello <t0>world</t0></s0>';
  const brokenMissingT0 = '<s0>Bonjour monde</s0>';
  assert.equal(IptrDom.validateMarkers(sent, brokenMissingT0), false);
});

test('restoring a zone yields the exact original DOM', () => {
  const doc = setup('<p id="p1">First paragraph text.</p><p id="p2">Second paragraph text.</p>');
  const p1 = doc.getElementById('p1');
  const p2 = doc.getElementById('p2');
  const original = doc.body.innerHTML;
  const r = doc.createRange();
  r.setStart(p1.firstChild, 6);
  r.setEnd(p2.firstChild, 6);
  const zone = IptrDom.wrapRangeIntoZone(r, 'z2', doc);

  zone.segments.forEach((seg) => { seg.el.replaceWith(seg.originalFragment); });

  assert.equal(doc.body.innerHTML, original);
});

test('a selection starting mid-inline-tag wraps and restores to an equivalent DOM', () => {
  const doc = setup('<p id="p1">Some <b>bold text</b> and more stuff.</p>');
  const p1 = doc.getElementById('p1');
  const bEl = p1.querySelector('b');
  const boldText = bEl.firstChild;

  const r = doc.createRange();
  r.setStart(boldText, 2); // "ld text"
  r.setEnd(p1.lastChild, 5); // " and "

  const zone = IptrDom.wrapRangeIntoZone(r, 'zMid', doc);
  zone.segments.forEach((seg) => { seg.el.textContent = 'TRANSLATED'; });
  assert.equal(p1.textContent, 'Some boTRANSLATEDmore stuff.');

  zone.segments.forEach((seg) => { seg.el.replaceWith(seg.originalFragment); });
  // La balise <b> a été scindée en deux (comportement standard du
  // découpage de sélection partielle), mais le texte final est identique.
  assert.equal(p1.textContent, 'Some bold text and more stuff.');
});

test('plainSerializeSegments produces marker-only text usable by parseTranslatedPayload', () => {
  const doc = setup('<p id="p1">Run <code>npm install</code> now.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const zone = IptrDom.wrapRangeIntoZone(r, 'z3', doc);

  const plainPayload = IptrDom.plainSerializeSegments(zone.segments);
  assert.equal(plainPayload, '<s0>Run npm install now.</s0>');

  const translated = '<s0>Exécutez npm install maintenant.</s0>';
  const parsed = IptrDom.parseTranslatedPayload(translated, new Map(), doc);
  IptrDom.applyParsedSegments(zone.segments, parsed, 0);
  assert.equal(p.textContent, 'Exécutez npm install maintenant.');
});
