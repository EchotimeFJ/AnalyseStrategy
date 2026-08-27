import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-research-api-'));
await fs.writeFile(
  path.join(tmpRoot, '2026-08-26.md'),
  `# 中金

鸣鸣很忙 (1768.HK)
维持买入评级，目标价 8.20 港元。

明明很忙 (1768.HK)
重申买入评级，目标价 8.20 港元。

# 高盛

谨慎科技 (9999.HK)
维持卖出评级，目标价 5 港元。
主要风险：价格竞争加剧。
`,
  'utf-8',
);

process.env.REPORTS_DIR = tmpRoot;
const {
  rebuildIndex,
  getOverview,
  getReportOverview,
  getCompanyProfiles,
  getDataQuality,
} = await import(`../api/services/reportIndex.ts?research-api=${Date.now()}`);

await rebuildIndex();
const overview = await getOverview();
assert.equal(overview.reportCount, 1);
assert.equal(overview.positiveOpinions.length, 1);
assert.equal(overview.positiveOpinions[0].security.key, 'code:1768.HK');
assert.equal(overview.reportOverviews[0].positiveCount, 1);
assert.deepEqual(overview.reportOverviews[0].securities.map((item) => item.code).sort(), ['1768.HK', '9999.HK']);

const reportOverview = await getReportOverview('2026-08-26');
assert.ok(reportOverview);
assert.equal(reportOverview.opinions.length, 2);
assert.ok(reportOverview.opinions[0].evidence.length >= 1);
assert.equal(await getReportOverview('missing'), null);

const companies = await getCompanyProfiles('1768.HK');
assert.equal(companies.length, 1);
assert.equal(companies[0].security.displayName, '鸣鸣很忙');
assert.deepEqual(companies[0].security.aliases.sort(), ['明明很忙', '鸣鸣很忙']);
assert.equal(companies[0].opinions.length, 1);
assert.equal(companies[0].latestRating, '买入');

const quality = await getDataQuality();
assert.equal(quality.issueCount, 0);

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('research api tests passed');
