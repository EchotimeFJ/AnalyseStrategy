import assert from 'node:assert/strict';
import { configError } from '../api/services/aiConfigErrors';
import { createOpenAiCompatibleProvider } from '../api/services/aiProvider';

assert.equal(configError(new TypeError('fetch failed', { cause: Object.assign(new Error('secret must not leak'), { code: 'ENOTFOUND' }) })).code, 'AI_DNS_FAILED');
assert.equal(configError(new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code: 'ECONNREFUSED' }) })).code, 'AI_CONNECTION_FAILED');
assert.equal(configError(new DOMException('aborted', 'AbortError')).code, 'AI_CONNECTION_TIMEOUT');
assert.equal(configError(new Error('AI_PROVIDER_ERROR:401:token=private')).code, 'AI_KEY_REJECTED');
assert.equal(configError(new Error('AI_PROVIDER_ERROR:403:private details')).code, 'AI_PROVIDER_FORBIDDEN');
assert.equal(configError(new Error('AI_PROVIDER_ERROR:404:no model')).code, 'AI_MODEL_OR_ENDPOINT_NOT_FOUND');
assert.equal(configError(new Error('AI_PROVIDER_ERROR:429:private')).code, 'AI_PROVIDER_LIMIT');
assert.equal(configError(new Error('AI_PROVIDER_ERROR:503:private')).code, 'AI_PROVIDER_UNAVAILABLE');
assert.equal(configError(Object.assign(new Error('certificate'), { code: 'CERT_HAS_EXPIRED' })).code, 'AI_TLS_FAILED');
assert.equal(configError(new Error('请填写 API Key')).status, 400);
for (const error of [new Error('AI_PROVIDER_ERROR:401:token=private'), new Error('private'), new TypeError('private', { cause: new Error('private') })]) {
  assert.ok(!JSON.stringify(configError(error)).includes('private'));
}
const config = { providerId: 'custom' as const, providerName: 'Test', baseUrl: 'https://example.invalid/v1', model: 'test', apiKey: 'test', timeoutMs: 1000, dailyTokenBudget: 1000, maxConcurrency: 1 };
const bodyTimeout = createOpenAiCompatibleProvider(async () => new Response(new ReadableStream({ start(controller) { controller.error(new DOMException('aborted', 'AbortError')); } })));
await assert.rejects(bodyTimeout.test(config), error => configError(error).code === 'AI_CONNECTION_TIMEOUT');
const htmlResponse = createOpenAiCompatibleProvider(async () => new Response('<html>login</html>'));
await assert.rejects(htmlResponse.test(config), error => configError(error).code === 'AI_PROTOCOL_ERROR');
console.log('AI configuration diagnostics tests passed');
