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

// Rating expansion belongs to structured search; raw mode searches the original wording.
const buyResult = await searchReports({ q: '买入评级', mode: 'rating' });
assert.ok(!Array.isArray(buyResult) && 'groups' in buyResult);
assert.equal(buyResult.totalHits, 2);
assert.equal(buyResult.groups[0].date, '2026-07-08');
assert.deepEqual(buyResult.groups[0].institutions, ['花旗']);
assert.match(buyResult.groups[0].snippets[0].text, /新标的/);
assert.equal(buyResult.groups[1].date, '2026-01-01');

const sellResult = await searchReports({ q: '卖出评级', mode: 'rating' });
assert.ok(!Array.isArray(sellResult) && 'groups' in sellResult);
assert.equal(sellResult.totalHits, 1);
assert.equal(sellResult.groups[0].date, '2026-07-09');
assert.match(sellResult.groups[0].snippets[0].text, /谨慎标的/);

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('rating search tests passed');
