import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-ordering-'));
const reportRoot = path.join(tmpRoot, 'reports');
await fs.mkdir(path.join(reportRoot, '2025'), { recursive: true });

await fs.writeFile(
  path.join(reportRoot, '2025', '2025-09-10.md'),
  `# 高盛

小米集团 (1810.HK)
维持买入评级，目标价 65 港元。
`,
  'utf-8',
);

await fs.writeFile(
  path.join(reportRoot, '2025', '2025-12-04.md'),
  `# 花旗

小米集团 (1810.HK)
维持买入评级，目标价 53.5 港元。
`,
  'utf-8',
);

process.env.REPORTS_DIR = reportRoot;

const { rebuildIndex, searchReports, getTargetProfile } = await import('../api/services/reportIndex');

await rebuildIndex();

const searchHits = await searchReports({ q: '小米集团' });
assert.equal(searchHits[0].date, '2025-12-04');
assert.equal(searchHits.at(-1)?.date, '2025-09-10');

const profile = await getTargetProfile('小米集团');
assert.equal(profile.mentions[0].date, '2025-12-04');
assert.equal(profile.ratingChanges[0].date, '2025-12-04');
assert.equal(profile.summary.targetPrices[0].date, '2025-12-04');

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('ordering tests passed');
