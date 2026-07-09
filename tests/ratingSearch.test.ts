import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-rating-search-'));
const reportRoot = path.join(tmpRoot, 'reports');
await fs.mkdir(path.join(reportRoot, '2026'), { recursive: true });

await fs.writeFile(
  path.join(reportRoot, '2026', '2026-01-01.md'),
  `# 高盛

旧标的 (1111.HK)
投资评级：买入
目标价 10 港元。
`,
  'utf-8',
);

await fs.writeFile(
  path.join(reportRoot, '2026', '2026-07-08.md'),
  `# 花旗

新标的 (2222.HK)
投资评级：买入
目标价 20 港元。
`,
  'utf-8',
);

await fs.writeFile(
  path.join(reportRoot, '2026', '2026-07-09.md'),
  `# 摩根士丹利

谨慎标的 (3333.HK)
评级：卖出
目标价 5 港元。
`,
  'utf-8',
);

process.env.REPORTS_DIR = reportRoot;

const { rebuildIndex, searchReports } = await import('../api/services/reportIndex');

await rebuildIndex();

const buyHits = await searchReports({ q: '买入评级' });
assert.equal(buyHits.length, 2);
assert.equal(buyHits[0].date, '2026-07-08');
assert.equal(buyHits[0].institution, '花旗');
assert.match(buyHits[0].snippet, /新标的/);
assert.equal(buyHits[1].date, '2026-01-01');

const sellHits = await searchReports({ q: '卖出评级' });
assert.equal(sellHits.length, 1);
assert.equal(sellHits[0].date, '2026-07-09');
assert.match(sellHits[0].snippet, /谨慎标的/);

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('rating search tests passed');
