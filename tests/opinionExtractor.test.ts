import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const aliasMarkdown = await fs.readFile(path.join(fixtureDir, 'report-1768-aliases.md'), 'utf-8');
const aliasReport = buildReportFromMarkdown({
  id: '2026-08-26',
  filePath: '/tmp/2026-08-26.md',
  markdown: aliasMarkdown,
});
const aliasOpinions = extractOpinions(aliasReport);
const sameSecurity = aliasOpinions.filter((item) => item.security.code === '1768.HK');

assert.equal(sameSecurity.length, 3);
assert.equal(new Set(sameSecurity.map((item) => item.security.key)).size, 1);
assert.equal(aliasOpinions.some((item) => item.institution === 'AI' && item.institutionVerified), false);
assert.equal(aliasOpinions.some((item) => item.security.aliases.includes('AH')), false);
assert.ok(sameSecurity.every((item) => item.evidence.every((source) => source.lineNumber > 0)));

const multipleMarkdown = await fs.readFile(path.join(fixtureDir, 'report-multiple-securities.md'), 'utf-8');
const multipleReport = buildReportFromMarkdown({
  id: '2026-08-27',
  filePath: '/tmp/2026-08-27.md',
  markdown: multipleMarkdown,
});
const opinions = extractOpinions(multipleReport);
const innoscience = opinions.find((item) => item.security.code === '2577.HK');
const cautious = opinions.find((item) => item.security.code === '9999.HK');

assert.ok(innoscience);
assert.ok(cautious);
assert.equal(innoscience.rating, '买入');
assert.equal(innoscience.targetPrice, '114 港元');
assert.equal(innoscience.types.includes('positive'), true);
assert.equal(innoscience.types.includes('catalyst'), true);
assert.equal(innoscience.types.includes('risk'), false);
assert.equal(cautious.rating, '卖出');
assert.equal(cautious.targetPrice, '5 港元');
assert.equal(cautious.types.includes('risk'), true);
assert.equal(cautious.types.includes('catalyst'), false);

const themedReport = buildReportFromMarkdown({
  id: '2026-08-28',
  filePath: '/tmp/2026-08-28.md',
  markdown: `# AI

腾讯控股 (0700.HK)
花旗观点：维持买入评级，目标价 763 港元。
`,
});
const themedOpinion = extractOpinions(themedReport)[0];
assert.equal(themedOpinion.institution, '花旗');
assert.equal(themedOpinion.institutionVerified, true);

console.log('opinion extractor tests passed');
