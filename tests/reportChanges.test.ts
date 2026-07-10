import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-report-changes-'));
const reportRoot = path.join(tmpRoot, 'reports');
const yearDir = path.join(reportRoot, '2026');
await fs.mkdir(yearDir, { recursive: true });

const firstReportPath = path.join(yearDir, '2026-07-08.md');
const secondReportPath = path.join(yearDir, '2026-07-09.md');
const thirdReportPath = path.join(yearDir, '2026-07-10.md');

await fs.writeFile(firstReportPath, '# 高盛\n\n旧日报内容。\n', 'utf-8');
await fs.writeFile(secondReportPath, '# 花旗\n\n原始日报内容。\n', 'utf-8');

process.env.REPORTS_DIR = reportRoot;

const { diffReportChanges, rebuildIndex } = await import('../api/services/reportIndex');

const before = await rebuildIndex();

await fs.rm(firstReportPath);
await fs.writeFile(secondReportPath, '# 花旗\n\n修改后的日报内容。\n', 'utf-8');
await fs.writeFile(thirdReportPath, '# 摩根士丹利\n\n新增日报内容。\n', 'utf-8');

const after = await rebuildIndex();
const changes = diffReportChanges(before, after);

assert.deepEqual(changes.added.map((item) => item.date), ['2026-07-10']);
assert.deepEqual(changes.modified.map((item) => item.date), ['2026-07-09']);
assert.deepEqual(changes.removed.map((item) => item.date), ['2026-07-08']);
assert.equal(changes.added[0].id.endsWith('2026__2026-07-10'), true);
assert.equal(changes.modified[0].id.endsWith('2026__2026-07-09'), true);
assert.equal(changes.removed[0].id.endsWith('2026__2026-07-08'), true);

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('report changes tests passed');
