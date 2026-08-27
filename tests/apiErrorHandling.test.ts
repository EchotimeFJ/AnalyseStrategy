import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.REPORTS_DIR = path.join(os.tmpdir(), `missing-report-dir-${Date.now()}`);
const { default: app } = await import(`../api/app.ts?error-handling=${Date.now()}`);
const server = app.listen(0);

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/overview`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: 'INDEX_UNAVAILABLE',
      message: '报告目录不可用，请检查数据源配置后重试',
    },
  });
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('api error handling tests passed');
