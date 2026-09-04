import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'report-cache-test-'));
const reports = path.join(root, 'reports');
const cacheDir = path.join(root, 'cache');
await fs.mkdir(reports);
const reportPath = path.join(reports, '2026-09-01.md');
const markdown = '# 高盛\n\n小米集团 (1810.HK)\n维持买入评级，目标价65港元。\n#高盛 #AI\n';
await fs.writeFile(reportPath, markdown);
process.env.REPORT_DIR = reports;
process.env.REPORT_INDEX_CACHE_DIR = cacheDir;
process.env.REPORT_INDEX_CHECK_MS = '0';
process.env.AI_API_KEY = 'not-part-of-the-report-cache';

function coldStart(env: Record<string, string> = {}) {
  return JSON.parse(execFileSync(process.execPath, [
    '--import', 'tsx', fileURLToPath(new URL('./helpers/reportCacheProbe.ts', import.meta.url)),
  ], { env: { ...process.env, ...env }, encoding: 'utf8' }));
}

try {
  const api = await import('../api/services/reportIndex');
  const concurrent = await Promise.all([api.ensureIndex(), api.ensureIndex(), api.ensureIndex()]);
  assert.strictEqual(concurrent[0], concurrent[1], 'concurrent cold requests must share one index build');
  assert.strictEqual(concurrent[1], concurrent[2]);
  assert.equal(concurrent[0].cache?.persisted, true);

  const files = await fs.readdir(cacheDir);
  assert.equal(files.length, 1, 'a complete rebuild writes one snapshot, without leftover temp files');
  const cachePath = path.join(cacheDir, files[0]);
  const snapshot = await fs.readFile(cachePath);
  assert.ok(gunzipSync(snapshot).toString().includes('1810.HK'));
  assert.ok(!gunzipSync(snapshot).toString().includes('not-part-of-the-report-cache'));

  const restored = coldStart();
  assert.equal(restored.version, concurrent[0].version, 'a fresh process must restore the saved generation');
  assert.equal(restored.cache.origin, 'disk');
  assert.equal(restored.entityCount, concurrent[0].entities.size, 'Map entries survive serialization');
  assert.equal(restored.markdown, markdown);
  assert.deepEqual(restored.lines, concurrent[0].reports[0].lines);
  assert.deepEqual(restored.institutionContent, concurrent[0].reports[0].institutions.map((block) => block.content));
  assert.deepEqual(await fs.readFile(cachePath), snapshot, 'restoring does not rewrite the snapshot');

  // A failed rebuild must retain both the working in-memory index and the last disk snapshot.
  await fs.rename(reports, `${reports}-unavailable`);
  await assert.rejects(api.rebuildIndex(), /ENOENT/);
  assert.equal((await api.ensureIndex()).version, concurrent[0].version);
  assert.deepEqual(await fs.readFile(cachePath), snapshot);
  await fs.rename(`${reports}-unavailable`, reports);

  await fs.writeFile(reportPath, `${markdown}\n新增内容。`);
  const updated = await api.ensureIndex();
  assert.notEqual(updated.version, concurrent[0].version, 'changed source files invalidate the warm index');
  assert.match(updated.reports[0].markdown, /新增内容/);
  const restoredUpdated = coldStart();
  assert.equal(restoredUpdated.version, updated.version);

  const lastGoodDisk = await fs.readFile(cachePath);
  const blockedCacheDirectory = path.join(root, 'not-a-directory');
  await fs.writeFile(blockedCacheDirectory, 'blocked');
  process.env.REPORT_INDEX_CACHE_DIR = blockedCacheDirectory;
  const memoryOnly = await api.rebuildIndex();
  assert.equal(memoryOnly.cache?.persisted, false);
  assert.ok(memoryOnly.cache?.warning, 'disk write failure must be visible while the fresh index stays usable');
  assert.equal((await api.getOverview()).reportCount, 1);
  assert.deepEqual(await fs.readFile(cachePath), lastGoodDisk, 'a failed snapshot write preserves the last good cache');
  process.env.REPORT_INDEX_CACHE_DIR = cacheDir;

  const simultaneousRebuilds = await Promise.all([api.rebuildIndex(), api.rebuildIndex()]);
  assert.strictEqual(simultaneousRebuilds[0], simultaneousRebuilds[1]);

  const newParser = coldStart({ APP_GIT_COMMIT: 'new-parser-version' });
  assert.notEqual(newParser.version, updated.version, 'application revision invalidates older parser output');
  assert.equal(newParser.cache.origin, 'rebuilt');

  await fs.writeFile(cachePath, 'broken cache');
  const recovered = coldStart();
  assert.equal(recovered.cache.origin, 'rebuilt');
  assert.equal(recovered.reportCount, 1);
  assert.match(recovered.markdown, /新增内容/);

  await fs.writeFile(path.join(reports, '2026-09-02.md'), '# 花旗\n新增报告');
  assert.equal(coldStart().reportCount, 2, 'added files invalidate disk snapshots');
  await fs.unlink(path.join(reports, '2026-09-02.md'));
  assert.equal(coldStart().reportCount, 1, 'deleted files invalidate disk snapshots');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('report cache tests passed');
