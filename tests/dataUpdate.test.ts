import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'data-update-'));
const origin = path.join(root, 'origin.git');
const seed = path.join(root, 'seed');
const checkout = path.join(root, 'checkout');
const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd });
await git(root, 'init', '--bare', origin);
await git(root, 'clone', origin, seed);
await git(seed, 'config', 'user.email', 'test@example.invalid');
await git(seed, 'config', 'user.name', 'Test');
await fs.mkdir(path.join(seed, 'reports'));
await fs.writeFile(path.join(seed, 'reports/2026-09-07.md'), '# 中金\n\n测试公司 (1234.HK)\n买入，目标价 10 港元。');
await git(seed, 'add', '.');
await git(seed, 'commit', '-m', 'initial report');
await git(seed, 'push', 'origin', 'HEAD');
await git(root, 'clone', origin, checkout);
process.env.STRATEGY_DIR = checkout;
process.env.REPORT_DIR = path.join(checkout, 'reports');
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
const statusFile = path.join(root, 'publication', 'record.json');
process.env.REPORT_PUBLICATION_FILE = statusFile;
let now = new Date('2026-09-07T01:00:00Z');
const { createDataUpdater } = await import('../api/services/dataUpdate');
const { ensureIndex } = await import('../api/services/reportIndex');
const updater = createDataUpdater({ statusFile, now: () => now });
try {
  const [first, overlapping] = await Promise.all([updater.update(), updater.update()]);
  assert.equal(first.publishedAt, '2026-09-07T01:00:00.000Z');
  assert.deepEqual(first, overlapping, 'overlapping jobs share a single result');
  const version = (await ensureIndex({ checkSource: false })).version;
  now = new Date('2026-09-07T02:00:00Z');
  const unchanged = await updater.update();
  assert.equal(unchanged.publishedAt, first.publishedAt);
  assert.equal((await ensureIndex({ checkSource: false })).version, version, 'no change must not rebuild');
  const restarted = createDataUpdater({ statusFile, now: () => now });
  assert.equal((await restarted.status()).publishedAt, first.publishedAt, 'restart retains the publication time');

  await fs.writeFile(path.join(seed, 'reports/2026-09-08.md'), '# 中金\n\n新公司 (5678.HK)\n买入。');
  await git(seed, 'add', '.');
  await git(seed, 'commit', '-m', 'new report');
  await git(seed, 'push', 'origin', 'HEAD');
  const published = await updater.update();
  assert.equal(published.publishedAt, '2026-09-07T02:00:00.000Z');
  const good = await ensureIndex({ checkSource: false });
  assert.equal(good.reports.length, 2);

  await git(checkout, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  await assert.rejects(updater.update(), /更新失败/);
  assert.equal((await updater.status()).publishedAt, published.publishedAt);
  assert.equal((await ensureIndex({ checkSource: false })).version, good.version);
  assert.equal((await updater.status()).state, 'delayed');
  await git(checkout, 'remote', 'set-url', 'origin', origin);

  // The pointer cannot advance when its write fails. A fresh process must still
  // restore the last published data even though git already pulled newer files.
  await fs.writeFile(path.join(seed, 'reports/2026-09-09.md'), '# 中金\n\n未发布公司 (9999.HK)\n买入。');
  await git(seed, 'add', '.');
  await git(seed, 'commit', '-m', 'candidate report');
  await git(seed, 'push', 'origin', 'HEAD');
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === statusFile) throw Object.assign(new Error('simulated publication rename failure'), { code: 'EACCES' });
    return rename(from, to);
  };
  try {
    await assert.rejects(updater.update());
    assert.equal((await ensureIndex({ checkSource: false })).reports.length, 2);
    const fresh = await exec(process.execPath, ['--import', 'tsx', '-e', "import('./api/services/reportIndex.ts').then(async m => console.log((await m.ensureIndex({checkSource:false})).reports.length))"], { env: process.env });
    assert.equal(fresh.stdout.trim(), '2', 'restart must not load an uncommitted snapshot or the advanced checkout');
    assert.equal((await updater.status()).publishedAt, published.publishedAt);
  } finally {
    fs.rename = rename;
  }

  // The timer runs without any visitor request and can be stopped on shutdown.
  const scheduled = createDataUpdater({ statusFile, intervalMs: 30, now: () => new Date('2026-09-07T03:00:00Z') });
  scheduled.start();
  const deadline = Date.now() + 3000;
  while ((await scheduled.status()).checkedAt !== '2026-09-07T03:00:00.000Z' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await scheduled.stop();
  assert.equal((await scheduled.status()).checkedAt, '2026-09-07T03:00:00.000Z');
} finally {
  await updater.stop();
  await fs.rm(root, { recursive: true, force: true });
}
console.log('data update tests passed');
