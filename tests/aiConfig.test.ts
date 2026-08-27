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

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('ai config tests passed');
