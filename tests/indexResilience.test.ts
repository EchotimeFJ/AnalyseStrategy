import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-index-resilience-'));
const reportRoot = path.join(tmpRoot, 'reports');
await fs.mkdir(reportRoot, { recursive: true });
await fs.writeFile(
  path.join(reportRoot, '2026-08-26.md'),
  `# 中金

鸣鸣很忙 (1768.HK)
维持买入评级，目标价 8.20 港元。

# AI

行业观察 (未覆盖)
AI 需求正在增长。
`,
  'utf-8',
);

process.env.REPORTS_DIR = reportRoot;
const { ensureIndex, rebuildIndex } = await import(`../api/services/reportIndex.ts?resilience=${Date.now()}`);

const before = await rebuildIndex();
assert.equal(before.reports.length, 1);
assert.equal(before.opinions.length, 1);
assert.equal(before.entities.get('code:1768.HK')?.displayName, '鸣鸣很忙');
assert.equal(before.opinions[0].institutionVerified, true);

process.env.REPORTS_DIR = path.join(tmpRoot, 'missing');
await assert.rejects(rebuildIndex(), /ENOENT/);

const after = await ensureIndex();
assert.equal(after.indexedAt, before.indexedAt);
assert.equal(after.reports.length, 1);
assert.equal(after.entities.get('code:1768.HK')?.displayName, '鸣鸣很忙');

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('index resilience tests passed');
