import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const originalEnv = {
  REPORT_DIR: process.env.REPORT_DIR,
  REPORTS_DIR: process.env.REPORTS_DIR,
};

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'analyse-strategy-report-config-'));
const preferredRoot = path.join(tmpRoot, 'preferred');
const legacyRoot = path.join(tmpRoot, 'legacy');

try {
  await fs.mkdir(path.join(preferredRoot, '2026'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, '2026'), { recursive: true });

  await fs.writeFile(path.join(preferredRoot, '2026', '2026-07-15.md'), '# 首选目录\n\npreferred\n', 'utf-8');
  await fs.writeFile(path.join(legacyRoot, '2026', '2026-07-15.md'), '# 兼容目录\n\nlegacy\n', 'utf-8');

  process.env.REPORT_DIR = preferredRoot;
  process.env.REPORTS_DIR = legacyRoot;

  const { rebuildIndex } = await import(`../api/services/reportIndex.ts?test=${Date.now()}-${Math.random()}`);
  const index = await rebuildIndex();

  assert.equal(index.sourceDir, preferredRoot);
  assert.equal(index.reports.length, 1);
  assert.equal(index.reports[0].filePath.startsWith(preferredRoot), true);
} finally {
  if (originalEnv.REPORT_DIR === undefined) {
    delete process.env.REPORT_DIR;
  } else {
    process.env.REPORT_DIR = originalEnv.REPORT_DIR;
  }

  if (originalEnv.REPORTS_DIR === undefined) {
    delete process.env.REPORTS_DIR;
  } else {
    process.env.REPORTS_DIR = originalEnv.REPORTS_DIR;
  }

  await fs.rm(tmpRoot, { recursive: true, force: true });
}

console.log('report index config tests passed');
