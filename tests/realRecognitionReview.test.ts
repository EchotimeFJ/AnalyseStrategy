import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { extractTargetMentions } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';

const august25 = extractTargetMentions(realReport('2026-08-25'));
const hengruiH = august25.find((item) => item.code === '1276.HK');
const hengruiA = august25.find((item) => item.code === '600276.SS');
assert.equal(hengruiH?.targetPrice, '119 港元', 'real line259 gives both old and new A/H prices');
assert.equal(hengruiA?.targetPrice, '109 元');
assert.ok(!august25.some((item) => item.targetName === '归母净利润'));
const august26 = extractTargetMentions(realReport('2026-08-26'));
assert.ok(!august26.some((item) => ['风力发电机组', '其风机', '风机', '鉴于金风科技风机'].includes(item.targetName)), 'WTG is a turbine abbreviation in the original report, not a stock');
const september6 = extractTargetMentions(realReport('2026-09-06'));
assert.ok(!september6.some((item) => item.targetName === '摩根士丹利' && item.headingLineNumber === 153), 'strategy author is not an issuer');
const ship = extractTargetMentions(realReport('2026-09-01')).find((item) => item.headingLineNumber === 938);
assert.ok(ship);
assert.equal(ship.currentPrice, undefined, 'line958 gives forecast years, no current stock price');
const yinlun = extractTargetMentions(realReport('2026-09-07')).find((item) => item.targetName.includes('银轮'));
assert.equal(yinlun?.targetPrice, '66 元', 'real line49 puts price before 目标价');
const september2 = extractOpinions(realReport('2026-09-02'));
for (const [name, rating] of [['Lumentum', '买入'], ['Coherent Corp', '买入'], ['Arista Networks', '买入'], ['Cisco Systems', '买入'], ['HPE', '买入'], ['Dell Technologies', '持有'], ['A10 Networks', '持有'], ['Ingram Micro', '持有']]) {
  assert.ok(september2.some((opinion) => opinion.security.displayName === name && opinion.rating === rating), `actual prefixed rating list lines476–497: ${name}`);
}
const amat = extractOpinions(realReport('2026-08-24')).find((item) => item.security.code === 'AMAT.US');
assert.ok(amat?.types.includes('positive'), 'real 跑赢大盘 rating remains positive');
const avgo = extractOpinions(realReport('2026-08-24')).find((item) => item.security.code === 'AVGO.US');
assert.equal(avgo?.rating, '增持', 'line884 recommends buying while the official rating is overweight');
assert.equal(avgo.buyRecommendation, true);
assert.equal(avgo.ratingAlternatives, undefined);
const zte = extractOpinions(realReport('2026-01-14')).find((item) => item.security.code === '0763.HK');
assert.equal(zte?.rating, '中性', 'company profile headings must stop other issuers inheriting fields');
console.log('additional real report recognition tests passed');
