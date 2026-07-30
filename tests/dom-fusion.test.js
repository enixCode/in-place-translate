'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const IptrDom = require('../extension/content/dom.js');

test('a wider selection absorbs and restores smaller translated zones, single reverse restores everything', () => {
  const dom = new JSDOM('<!doctype html><html><body><p id="p1">Alpha bravo charlie delta echo foxtrot golf.</p></body></html>');
  const doc = dom.window.document;
  const p1 = doc.getElementById('p1');
  const original = p1.outerHTML;
  const zones = new Map();

  // Translate "bravo" in isolation.
  {
    const r = doc.createRange();
    r.setStart(p1.firstChild, 6);
    r.setEnd(p1.firstChild, 11);
    const zone = IptrDom.wrapRangeIntoZone(r, 'zA', doc);
    zone.segments.forEach((s) => { s.el.textContent = 'BRAVO_FR'; });
    zone.status = 'done';
    zones.set('zA', zone);
  }

  // Translate "delta" in isolation (re-locate the text node after the first mutation).
  {
    const textNode = Array.from(p1.childNodes).find((n) => n.nodeType === 3 && n.textContent.includes('delta'));
    const idx = textNode.textContent.indexOf('delta');
    const r = doc.createRange();
    r.setStart(textNode, idx);
    r.setEnd(textNode, idx + 5);
    const zone = IptrDom.wrapRangeIntoZone(r, 'zB', doc);
    zone.segments.forEach((s) => { s.el.textContent = 'DELTA_FR'; });
    zone.status = 'done';
    zones.set('zB', zone);
  }

  // Select the whole paragraph: must absorb zA and zB.
  const fullRange = doc.createRange();
  fullRange.selectNodeContents(p1);
  const { range: fusedRange, absorbedIds } = IptrDom.resolveFusionAndReconstructRange(fullRange, doc, zones);

  assert.deepEqual(absorbedIds.sort(), ['zA', 'zB']);
  assert.equal(zones.size, 0);
  assert.equal(fusedRange.toString(), 'Alpha bravo charlie delta echo foxtrot golf.');

  const bigZone = IptrDom.wrapRangeIntoZone(fusedRange, 'zBig', doc);
  bigZone.segments.forEach((s) => { s.el.textContent = 'WHOLE_PARAGRAPH_FR'; });
  bigZone.status = 'done';
  zones.set('zBig', bigZone);

  // A single reverse must restore the pristine original.
  IptrDom.restoreZone(zones.get('zBig'));
  zones.delete('zBig');

  assert.equal(p1.outerHTML, original);
});

test('restoreZone returns the live restored nodes for retranslate', () => {
  const dom = new JSDOM('<!doctype html><html><body><p id="p1">Hello world.</p></body></html>');
  const doc = dom.window.document;
  const p1 = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p1);
  const zone = IptrDom.wrapRangeIntoZone(r, 'z1', doc);
  zone.segments.forEach((s) => { s.el.textContent = 'TRADUIT'; });

  const restoredBySegment = IptrDom.restoreZone(zone);
  const allNodes = restoredBySegment.flat();
  assert.ok(allNodes.length > 0);

  const newRange = doc.createRange();
  newRange.setStartBefore(allNodes[0]);
  newRange.setEndAfter(allNodes[allNodes.length - 1]);
  assert.equal(newRange.toString(), 'Hello world.');
});
