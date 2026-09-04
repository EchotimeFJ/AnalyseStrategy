import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mock } from 'node:test';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'report-cache-race-'));
const source = path.join(root, 'reports');
await fs.mkdir(source);
const file = path.join(source, '2026-09-01.md');
await fs.writeFile(file, '# 高盛\n旧内容');
process.env.REPORT_DIR = source;
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
process.env.REPORT_INDEX_CHECK_MS = '0';
const api = await import('../api/services/reportIndex');

let release: () => void = () => undefined;
try {
  const initial = await api.ensureIndex();
  let captured: () => void = () => undefined;
  const didCapture = new Promise<void>((resolve) => { captured = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  const originalStat = fs.stat.bind(fs);
  // Preserve real filesystem metadata; hold one async stat after it observes the old file.
  const statMock = mock.method(fs, 'stat', async (...args: Parameters<typeof fs.stat>) => {
    const result = await originalStat(...args);
    if (args[0] === file && !held) {
      held = true;
      captured();
      await gate;
    }
    return result;
  });
  const checking = api.ensureIndex();
  await didCapture;
  await fs.writeFile(file, '# 高盛\n手动更新的新内容');
  const forced = api.rebuildIndex();
  release();
  const [, rebuilt] = await Promise.all([checking, forced]);
  statMock.mock.restore();
  assert.notEqual(rebuilt.version, initial.version, 'a manual rebuild must not join a no-op metadata check');
  assert.match(rebuilt.reports[0].markdown, /手动更新的新内容/);

  await fs.writeFile(file, '# 高盛\n自动更新遇到读取失败');
  let readCaptured: () => void = () => undefined;
  const didRead = new Promise<void>((resolve) => { readCaptured = resolve; });
  const readGate = new Promise<void>((resolve) => { release = resolve; });
  const originalRead = fs.readFile.bind(fs);
  const readMock = mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (args[0] === file) {
      readCaptured();
      await readGate;
      throw new Error('simulated report read failure');
    }
    return originalRead(...args);
  });
  const autoRefresh = api.ensureIndex();
  await didRead;
  const forcedFailure = api.rebuildIndex();
  release();
  const [autoResult, forcedResult] = await Promise.allSettled([autoRefresh, forcedFailure]);
  readMock.mock.restore();
  assert.equal(autoResult.status, 'fulfilled', 'readers retain the old complete index');
  assert.equal(forcedResult.status, 'rejected', 'manual rebuild must not suppress a shared build failure');
  await api.rebuildIndex();

  await fs.writeFile(file, '# 高盛\n正在保存的版本');
  let saveCaptured: () => void = () => undefined;
  const didSave = new Promise<void>((resolve) => { saveCaptured = resolve; });
  const saveGate = new Promise<void>((resolve) => { release = resolve; });
  const originalMkdir = fs.mkdir.bind(fs);
  let heldSave = false;
  const mkdirMock = mock.method(fs, 'mkdir', async (...args: Parameters<typeof fs.mkdir>) => {
    const result = await originalMkdir(...args);
    if (args[0] === path.join(root, 'cache') && !heldSave) {
      heldSave = true;
      saveCaptured();
      await saveGate;
    }
    return result;
  });
  const saving = api.rebuildIndex();
  await didSave;
  await fs.writeFile(file, '# 高盛\n保存期间刚刚更新的最新版本');
  const latestRequest = api.rebuildIndex();
  release();
  const [, latest] = await Promise.all([saving, latestRequest]);
  mkdirMock.mock.restore();
  assert.match(latest.reports[0].markdown, /刚刚更新的最新版本/,
    'joining a build must still cover the source revision requested after that build started');
} finally {
  release();
  mock.restoreAll();
  await fs.rm(root, { recursive: true, force: true });
}
console.log('report cache race tests passed');
