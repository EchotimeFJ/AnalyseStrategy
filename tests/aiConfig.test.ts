import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decryptSecret, encryptSecret, maskApiKey } from '../api/services/secretStore';
import { createAiConfigStore } from '../api/services/aiConfig';

const encrypted = encryptSecret('sk-secret-value', 'test-encryption-key');
assert.equal(decryptSecret(encrypted, 'test-encryption-key'), 'sk-secret-value');
assert.notEqual(encrypted.ciphertext, 'sk-secret-value');
assert.equal(maskApiKey('sk-1234567890'), '••••7890');

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-ai-config-'));
const filePath = path.join(tmpRoot, 'ai-config.json');
const withoutSecret = createAiConfigStore({ filePath, secret: '', adminToken: 'admin', env: {} });
await assert.rejects(
  withoutSecret.save({ providerName: 'OpenAI compatible', baseUrl: 'https://example.com/v1', model: 'model', apiKey: 'sk-test' }, 'admin'),
  /AI_CONFIG_SECRET/,
);

const store = createAiConfigStore({ filePath, secret: 'encryption-key', adminToken: 'admin', env: {} });
const preview = await store.preview({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'model', apiKey: 'sk-preview' }, 'admin');
assert.equal(preview.apiKey, 'sk-preview');
await assert.rejects(store.preview({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'model', apiKey: 'sk-preview' }, 'wrong'), /管理员密码/);
await assert.rejects(
  store.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'model', apiKey: 'sk-test' }, 'wrong'),
  /管理员密码/,
);
await store.save({
  providerName: 'Provider',
  baseUrl: 'https://example.com/v1',
  model: 'model',
  apiKey: 'sk-test-1234',
  timeoutMs: 15_000,
  dailyTokenBudget: 100_000,
  maxConcurrency: 2,
}, 'admin');

const raw = await fs.readFile(filePath, 'utf-8');
assert.equal(raw.includes('sk-test-1234'), false);
const publicConfig = await store.getPublic();
assert.equal(publicConfig.configured, true);
assert.equal(publicConfig.apiKeyMask, '••••1234');
assert.equal(JSON.stringify(publicConfig).includes('sk-test-1234'), false);
assert.equal((await store.resolve()).apiKey, 'sk-test-1234');
await assert.rejects(store.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'replacement-model', apiKey: '' }, 'admin'), /API Key/);
await store.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'replacement-model', apiKey: 'second-key' }, 'admin');
const updated = await store.resolve();
assert.equal(updated.model, 'replacement-model');
assert.equal(updated.apiKey, 'second-key');
assert.equal(updated.timeoutMs, 15_000);
assert.equal(updated.dailyTokenBudget, 100_000);
await assert.rejects(store.preview({ providerName: 'Provider', baseUrl: 'https://different.example/v1', model: 'model', apiKey: '' }, 'admin'), /API Key/);
await store.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'model', apiKey: '' }, 'admin');
assert.equal((await store.resolve()).apiKey, 'sk-test-1234');
assert.equal((await store.getPublic()).profiles.length, 2);
const reopened = createAiConfigStore({ filePath, secret: 'encryption-key', adminToken: 'admin', env: {} });
assert.equal((await reopened.preview({ providerName: 'Provider', baseUrl: 'https://example.com/v1/', model: 'replacement-model', apiKey: '' }, 'admin')).apiKey, 'second-key');
assert.ok(!(await fs.readFile(filePath, 'utf8')).includes('second-key'));
await Promise.all(['third', 'fourth'].map(model => store.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model, apiKey: `${model}-key` }, 'admin')));
assert.equal((await store.getPublic()).profiles.length, 4, 'concurrent saves preserve both profiles');
const legacyPath = path.join(tmpRoot, 'legacy.json');
const legacy = JSON.parse(raw).profiles[0];
await fs.writeFile(legacyPath, JSON.stringify(legacy));
const migrated = createAiConfigStore({ filePath: legacyPath, secret: 'encryption-key', adminToken: 'admin', env: {} });
assert.equal((await migrated.resolve()).apiKey, 'sk-test-1234');
await migrated.save({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'new-model', apiKey: 'new-key' }, 'admin');
assert.equal((await migrated.getPublic()).profiles.length, 2);
assert.deepEqual(JSON.parse(await fs.readFile(legacyPath + '.v1.bak', 'utf8')), legacy);
assert.equal((await migrated.preview({ providerName: 'Provider', baseUrl: 'https://example.com/v1', model: 'model', apiKey: '' }, 'admin')).apiKey, 'sk-test-1234');

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('ai config tests passed');
