'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('jsdom environment loads a document', () => {
  const dom = new JSDOM('<!doctype html><html><body><p>hello</p></body></html>');
  assert.equal(dom.window.document.querySelector('p').textContent, 'hello');
});
