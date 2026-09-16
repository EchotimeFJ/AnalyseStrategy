import assert from 'node:assert/strict';
import { buildReportFromMarkdown, extractTargetMentions } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import { resolveOpinions } from '../api/services/opinionResolution';
import { normalizeSecurityCode, resolveInstitution } from '../api/services/entityResolver';
import { realReport } from './realReportFixture';

const september8 = extractTargetMentions(realReport('2026-09-08'));
const shared = september8.filter((mention) => mention.lineNumber === 223);
assert.deepEqual(shared.map((mention) => [mention.targetName, mention.code, mention.rating, mention.targetPrice, mention.buyRecommendation]), [
  ['中际旭创', '300308.SZ', '买入', '1375 港元', true],
  ['光迅科技', '002281.SZ', '买入', '217.5 元', true],
  ['天孚通信', '300394.SZ', '买入', '282 元', true],
  ['太辰光', '300570.SZ', '买入', '231.5 元', true],
]);
assert.equal(shared.some((mention) => /核心推荐股票/.test(mention.targetName)), false);
assert.ok(shared.every((mention) => mention.fieldEvidence?.some((field) => field.field === 'rating' && field.excerpt.includes('评级均为'))));

const opinionsWithPriorPrice = extractOpinions(realReport('2026-08-25'));
const hengruiH = opinionsWithPriorPrice.find((opinion) => opinion.security.code === '1276.HK');
const hengruiA = opinionsWithPriorPrice.find((opinion) => opinion.security.code === '600276.SS');
assert.equal(hengruiH?.targetPrice, '119 港元');
assert.equal(hengruiH?.previousTargetPrice, '134 港元');
assert.equal(hengruiA?.targetPrice, '109 元');
assert.equal(hengruiA?.previousTargetPrice, '123 元');

const lithium = september8.filter((mention) => mention.lineNumber === 197);
assert.deepEqual(lithium.map((mention) => [mention.targetName, mention.rating]), [
  ['赣锋锂业', '增持'],
  ['天齐锂业', '中性'],
]);
assert.equal(lithium.some((mention) => mention.targetName === '中国锂业仪表盘'), false);

const optical = september8.filter((mention) => mention.lineNumber >= 630 && mention.lineNumber <= 635);
const chinaMobile = optical.find((mention) => mention.targetName === '中国移动');
const yangtze = optical.find((mention) => mention.targetName === '长飞光纤');
assert.equal(chinaMobile?.code, '0941.HK');
assert.deepEqual(chinaMobile?.aliases, ['中国移动', 'CM', '0941.HK']);
assert.equal(yangtze?.code, undefined, 'YOFC alone cannot select the A-share listing');
assert.equal(yangtze?.rating, '买入');
for (const code of ['600487.SS', '600522.SS', '600498.SS']) {
  const peer = optical.find((mention) => mention.code === code);
  assert.ok(peer);
  assert.equal(peer?.rating, undefined);
  assert.equal(peer?.targetPrice, undefined);
  assert.equal(peer?.aliases.includes('未评级'), false);
}

assert.equal(normalizeSecurityCode('CM'), null);
assert.equal(normalizeSecurityCode('ESS'), null);
assert.equal(normalizeSecurityCode('YOFC'), null);
assert.equal(resolveInstitution('野村').canonicalName, '野村');
assert.equal(resolveInstitution('野村').verified, true);

const sameReport = buildReportFromMarkdown({
  id: 'scope-test',
  filePath: '/tmp/scope-test.md',
  markdown: `# 高盛\n\n谨慎科技 (9999.HK)\n维持买入评级，目标价 10 港元。\n\n# 高盛\n\n谨慎科技 (9999.HK)\n下调至持有评级，目标价 8 港元。\n`,
});
const scoped = resolveOpinions(extractOpinions(sameReport));
assert.equal(scoped.length, 2, 'separate article blocks must not be merged');
assert.deepEqual(scoped.map((opinion) => [opinion.rating, opinion.targetPrice]), [
  ['买入', '10 港元'],
  ['持有', '8 港元'],
]);

console.log('deterministic rule regression tests passed');

const bareBoss = extractOpinions(buildReportFromMarkdown({ id: 'bare-boss', filePath: '2026-09-16.md', markdown: '# 花旗\n\nBOSS直聘（BZ，买入，目标价25美元）。' }));
assert.equal(bareBoss[0]?.security.code, 'BZ.O', 'verified issuer alias permits a bare US code without incorrectly forcing the HK listing');
