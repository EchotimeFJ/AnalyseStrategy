import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mock } from 'node:test';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'report-restore-race-'));
const source = path.join(root, 'reports');
const cache = path.join(root, 'cache');
await fs.mkdir(source);
const file = path.join(source, '2026-09-01.md');
await fs.writeFile(file, '# 高盛\n快照中的旧内容');
process.env.REPORT_DIR = source;
process.env.REPORT_INDEX_CACHE_DIR = cache;
try {
  execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./helpers/reportCacheProbe.ts', import.meta.url))], { env: process.env });
  const snapshotPath = path.join(cache, (await fs.readdir(cache))[0]);
  const originalStat = fs.stat.bind(fs);
  let changed = false;
  // The streaming reader stats the snapshot after collecting the source
  // manifest. Change the source at that same restore boundary.
  mock.method(fs, 'stat', async (...args: Parameters<typeof fs.stat>) => {
    const result = await originalStat(...args);
    if (args[0] === snapshotPath && !changed) {
      changed = true;
      await fs.writeFile(file, '# 高盛\n恢复期间已更新的内容');
    }
    return result;
  });
  const { ensureIndex } = await import('../api/services/reportIndex');
  const restored = await ensureIndex();
  assert.equal(changed, true, 'the source changed during snapshot restoration');
  assert.match(restored.reports[0].markdown, /恢复期间已更新的内容/);
  assert.equal(restored.cache?.origin, 'rebuilt');
} finally {
  mock.restoreAll();
  await fs.rm(root, { recursive: true, force: true });
}
console.log('report cache restore race tests passed');
