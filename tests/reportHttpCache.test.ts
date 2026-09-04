import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'report-http-cache-'));
const source = path.join(root, 'reports');
await fs.mkdir(source);
const file = path.join(source, '2026-09-01.md');
await fs.writeFile(file, '# 高盛\n\n小米集团 (1810.HK)\n维持买入评级，目标价65港元。\n#高盛 #AI\n');
process.env.REPORT_DIR = source;
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
process.env.REPORT_INDEX_CHECK_MS = '0';
const { default: app } = await import('../api/app');
const server = app.listen(0);
const address = server.address();
assert.ok(address && typeof address === 'object');
const port = address.port;

function request(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

try {
  const first = await request('/api/overview', { 'Accept-Encoding': 'gzip' });
  assert.equal(first.status, 200);
  assert.equal(first.headers['content-encoding'], 'gzip', 'report data must be compressed on the wire');
  assert.equal(first.headers['cache-control'], 'private, no-cache');
  assert.match(String(first.headers.vary), /Accept-Encoding/);
  const data = JSON.parse(gunzipSync(first.body).toString());
  assert.equal(data.data.reportCount, 1);
  const etag = String(first.headers.etag);
  assert.ok(etag.startsWith('W/'));

  const unchanged = await request('/api/overview', { 'If-None-Match': etag, 'Accept-Encoding': 'gzip' });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.body.length, 0);
  const identity = await request('/api/overview', { 'Accept-Encoding': 'gzip;q=0, identity' });
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(identity.body.toString()), data);
  assert.equal(identity.headers.etag, etag);
  assert.ok(first.body.length < identity.body.length);

  const head = await request('/api/overview', { 'Accept-Encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), first.body.length);

  for (const endpoint of ['/api/reports', '/api/reports/2026-09-01', '/api/reports/2026-09-01/overview']) {
    const result = await request(endpoint, { 'Accept-Encoding': 'gzip' });
    assert.equal(result.headers['content-encoding'], 'gzip');
    assert.equal((await request(endpoint, { 'If-None-Match': String(result.headers.etag) })).status, 304);
  }
  const missing = await request('/api/reports/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['cache-control'], 'no-store');
  const ai = await request('/api/ai/status', { 'Accept-Encoding': 'gzip' });
  assert.equal(ai.headers['x-report-cache'], undefined, 'AI responses must not enter the report cache');

  await fs.writeFile(file, '# 高盛\n\n小米集团 (1810.HK)\n上调买入评级，目标价80港元。\n#高盛 #AI\n');
  const rebuilt = await request('/api/reindex', {}, 'POST');
  assert.equal(rebuilt.status, 200);
  assert.equal(JSON.parse(rebuilt.body.toString()).data.reportChanges.modified.length, 1,
    'manual reindex compares against the previous generation before any automatic refresh');
  const changed = await request('/api/overview', { 'If-None-Match': etag, 'Accept-Encoding': 'gzip' });
  assert.equal(changed.status, 200, 'a rebuilt generation cannot return a stale 304');
  assert.notEqual(changed.headers.etag, etag);
  assert.match(gunzipSync(changed.body).toString(), /80港元/);
  const newDetail = await request('/api/reports/2026-09-01');
  assert.match(newDetail.body.toString(), /80港元/);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(root, { recursive: true, force: true });
}
console.log('report HTTP cache tests passed');
