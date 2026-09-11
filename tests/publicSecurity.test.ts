import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'public-security-'));
process.env.REPORT_DIR = root;
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
process.env.REPORT_PUBLICATION_FILE = path.join(root, 'publication.json');
process.env.ADMIN_TOKEN = 'test-admin-only';
await fs.writeFile(path.join(root, '2026-09-07.md'), '# 中金\n\n测试公司 (1234.HK)\n买入，目标价 10 港元。');
const { default: app } = await import('../api/app');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api`;
try {
  assert.equal((await fetch(base + '/ai/config')).status, 403);
  const adminConfig = await fetch(base + '/ai/config', { headers: { 'X-AI-Admin-Token': 'test-admin-only' } });
  assert.equal(adminConfig.status, 200);
  assert.equal(adminConfig.headers.get('cache-control'), 'no-store');
  const adminData = (await adminConfig.json()).data;
  assert.ok(Array.isArray(adminData.providerPresets));
  assert.ok(!('apiKey' in adminData));
  const publicData = (await (await fetch(base + '/ai/status')).json()).data;
  assert.ok(!('baseUrl' in publicData));
  assert.ok(!('providerPresets' in publicData));
  // Removing server authorization must never let an anonymous request mutate shared state.
  for (const [method, route] of [['POST', '/reindex'], ['POST', '/update-strategy'], ['POST', '/watchlist'], ['DELETE', '/watchlist/x'], ['POST', '/aliases'], ['PUT', '/ai/config'], ['POST', '/ai/config/test']]) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403, `${method} ${route} must require an administrator`);
  }
  const authorized = await fetch(base + '/reindex', { method: 'POST', headers: { 'X-Admin-Token': 'test-admin-only' } });
  assert.equal(authorized.status, 200);
  for (const route of ['/overview', '/reports', '/reports/2026-09-07', '/index', '/summary', '/data-quality', '/export']) {
    const response = await fetch(base + route, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const body = await response.text();
    assert.ok(!body.includes(root), `${route} leaks a server path`);
    assert.ok(!body.includes('"sourceDir"'), route);
    assert.ok(!body.includes('"filePath"'), route);
  }
  const malformed = await fetch(base + '/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(base + '/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(70_000) }) });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(base + '/search?q=' + 'x'.repeat(501))).status, 400);
  let limited = false;
  for (let i = 0; i < 30; i++) {
    const response = await fetch(base + '/search?q=测试', { headers: { 'X-Forwarded-For': `203.0.113.${i}` } });
    if (response.status === 429) {
      assert.ok(response.headers.get('retry-after'));
      limited = true;
      break;
    }
  }
  assert.ok(limited, 'forged forwarding headers must not bypass search throttling');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(root, { recursive: true, force: true });
}
console.log('public security tests passed');
