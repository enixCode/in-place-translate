'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const IptrDom = require('../extension/content/dom.js');

function setup(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return dom.window.document;
}

test('single paragraph selection -> one segment', () => {
  const doc = setup('<p id="p1">Hello world, this is a test.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].toString(), 'Hello world, this is a test.');
});

test('selection spanning two paragraphs -> one segment per paragraph', () => {
  const doc = setup('<p id="p1">First paragraph text.</p><p id="p2">Second paragraph text.</p>');
  const p1 = doc.getElementById('p1');
  const p2 = doc.getElementById('p2');
  const r = doc.createRange();
  r.setStart(p1.firstChild, 6);
  r.setEnd(p2.firstChild, 6);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].toString(), 'paragraph text.');
  assert.equal(segs[1].toString(), 'Second');
});

test('inline formatting stays inside a single segment', () => {
  const doc = setup('<p id="p1">Some <b>bold</b> and <a href="https://x.test">a link</a> here.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].toString(), 'Some bold and a link here.');
});

test('pre/code block is excluded from segmentation', () => {
  const doc = setup('<p id="p1">Before code.</p><pre id="pre1"><code>const x = 1;</code></pre><p id="p2">After code.</p>');
  const p1 = doc.getElementById('p1');
  const p2 = doc.getElementById('p2');
  const r = doc.createRange();
  r.setStart(p1.firstChild, 0);
  r.setEnd(p2.firstChild, p2.firstChild.length);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].toString(), 'Before code.');
  assert.equal(segs[1].toString(), 'After code.');
});

test('inline code stays inside its segment (kept atomic later, not excluded here)', () => {
  const doc = setup('<p id="p1">Run <code>npm install</code> to start.</p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].toString(), 'Run npm install to start.');
});

test('a selection made only of a <pre> block yields no segment', () => {
  const doc = setup('<div id="d"><pre><code>pip install torch</code></pre></div>');
  const d = doc.getElementById('d');
  const r = doc.createRange();
  r.selectNodeContents(d);
  assert.equal(IptrDom.getSegmentRanges(r).length, 0);
});

test('a selection made only of an inline <code> yields no segment', () => {
  const doc = setup('<p id="p1"><code class="language-plaintext highlighter-rouge">The animal didn\'t cross the street</code></p>');
  const p = doc.getElementById('p1');
  const r = doc.createRange();
  r.selectNodeContents(p);
  assert.equal(IptrDom.getSegmentRanges(r).length, 0);
});

test('list items produce one segment each', () => {
  const doc = setup('<ul id="ul1"><li id="l1">Item one</li><li id="l2">Item two</li></ul>');
  const ul = doc.getElementById('ul1');
  const r = doc.createRange();
  r.selectNodeContents(ul);
  const segs = IptrDom.getSegmentRanges(r);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].toString(), 'Item one');
  assert.equal(segs[1].toString(), 'Item two');
});
