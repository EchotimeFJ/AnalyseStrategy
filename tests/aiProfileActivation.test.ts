import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const original = process.cwd();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-activation-'));
process.chdir(root);
process.env.ADMIN_TOKEN = 'activation-test';
process.env.AI_CONFIG_SECRET = 'activation-encryption';
process.env.REPORT_DIR = root;
const { aiConfigStore } = await import('../api/services/aiConfig');
await aiConfigStore.save({ providerId: 'deepseek', providerName: 'DeepSeek', baseUrl: 'https://example.invalid/v1', model: 'deepseek-flash', apiKey: 'deep-test' }, 'activation-test');
await aiConfigStore.save({ providerId: 'mimo', providerName: 'MiMo', baseUrl: 'https://example.invalid/v1', model: 'mimo-v2.5-pro', apiKey: 'mimo-test' }, 'activation-test', false);
const profiles = (await aiConfigStore.getPublic()).profiles;
const keyFile = path.join(root, 'data/runtime/ai-config.json');
const before = JSON.parse(await fs.readFile(keyFile, 'utf8')).profiles;
const { default: app } = await import('../api/app');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/ai/active-profile`;
try {
  for (let i = 0; i < 2; i++) {
    const profile = profiles[i % 2];
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Admin-Token': 'activation-test' }, body: JSON.stringify({ profileId: profile.id }) });
    assert.equal(response.status, 410, 'retired model endpoint cannot invoke or switch models');
    const payload = await response.json();
    assert.equal(payload.error.code, 'AI_RETIRED');
    assert.ok(!JSON.stringify(payload).includes('deep-test'));
    assert.equal((await aiConfigStore.resolve())?.apiKey, 'deep-test');
  }
  assert.deepEqual(JSON.parse(await fs.readFile(keyFile, 'utf8')).profiles.map((p: { apiKeyEncrypted: unknown }) => p.apiKeyEncrypted), before.map((p: { apiKeyEncrypted: unknown }) => p.apiKeyEncrypted));
  const chat = await fetch(url.replace('active-profile', 'chat'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'测试'})});
  assert.equal(chat.status,410,'old clients cannot trigger model calls');
  assert.equal((await fetch(url,{method:'POST'})).status,403);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  process.chdir(original); await fs.rm(root, { recursive: true, force: true });
}
console.log('AI profile activation endpoint tests passed');
