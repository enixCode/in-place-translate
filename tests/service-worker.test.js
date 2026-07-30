'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ServiceWorkerApi = require('../extension/service-worker.js');

function fakeResponse(status, jsonBody, headers) {
  return {
    status: status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (headers && headers[name]) || null },
    json: () => Promise.resolve(jsonBody)
  };
}

test('computeMaxTokens caps at 131072 and scales with payload length', () => {
  assert.equal(ServiceWorkerApi.computeMaxTokens(100), 550);
  assert.equal(ServiceWorkerApi.computeMaxTokens(300000), 131072);
});

test('buildRequestBody includes the target language and markers rule', () => {
  const body = ServiceWorkerApi.buildRequestBody('<s0>hi</s0>', 'fr', 'claude-haiku-4-5', false);
  assert.equal(body.model, 'claude-haiku-4-5');
  assert.ok(body.system[0].text.includes('French'));
  assert.ok(body.system[0].text.includes('<sN>'));
  assert.equal(body.messages[0].content, '<s0>hi</s0>');
});

test('buildRequestBody appends the correction note on retry', () => {
  const body = ServiceWorkerApi.buildRequestBody('<s0>hi</s0>', 'fr', 'claude-haiku-4-5', true);
  assert.ok(body.system[0].text.includes('mismatched markers'));
});

test('callAnthropicApi returns the translated text on success', async () => {
  const fetchImpl = async () => fakeResponse(200, { content: [{ text: '<s0>Bonjour</s0>' }] });
  const result = await ServiceWorkerApi.callAnthropicApi('sk-test', '<s0>Hello</s0>', 'fr', 'claude-haiku-4-5', { fetchImpl });
  assert.equal(result, '<s0>Bonjour</s0>');
});

test('callAnthropicApi retries once on 429 then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(429, {}, { 'retry-after': '0' });
    return fakeResponse(200, { content: [{ text: 'ok' }] });
  };
  const result = await ServiceWorkerApi.callAnthropicApi('sk-test', 'payload', 'fr', 'claude-haiku-4-5', { fetchImpl });
  assert.equal(calls, 2);
  assert.equal(result, 'ok');
});

test('callAnthropicApi throws an AUTH ApiError on 401', async () => {
  const fetchImpl = async () => fakeResponse(401, {});
  await assert.rejects(
    ServiceWorkerApi.callAnthropicApi('sk-bad', 'payload', 'fr', 'claude-haiku-4-5', { fetchImpl }),
    (err) => err.code === 'AUTH'
  );
});

test('callAnthropicApi throws TRUNCATED when stop_reason is max_tokens', async () => {
  const fetchImpl = async () => fakeResponse(200, { stop_reason: 'max_tokens', content: [{ text: 'partial' }] });
  await assert.rejects(
    ServiceWorkerApi.callAnthropicApi('sk-test', 'payload', 'fr', 'claude-haiku-4-5', { fetchImpl }),
    (err) => err.code === 'TRUNCATED'
  );
});

test('pingApi resolves true on a 200 response', async () => {
  const fetchImpl = async () => fakeResponse(200, { content: [] });
  const result = await ServiceWorkerApi.pingApi('sk-test', 'claude-haiku-4-5', { fetchImpl });
  assert.equal(result, true);
});

test('pingApi resolves true even when stop_reason is max_tokens', async () => {
  const fetchImpl = async () => fakeResponse(200, { stop_reason: 'max_tokens', content: [{ text: 'H' }] });
  const result = await ServiceWorkerApi.pingApi('sk-test', 'claude-haiku-4-5', { fetchImpl });
  assert.equal(result, true);
});
