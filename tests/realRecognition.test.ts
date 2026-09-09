import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { extractOpinions } from '../api/services/opinionExtractor';

const cache = new Map<string, ReturnType<typeof extractOpinions>>();
function opinions(date: string) {
  if (!cache.has(date)) cache.set(date, extractOpinions(realReport(date)));
  return cache.get(date)!;
}
function security(date: string, code: string) {
  const found = opinions(date).filter((item) => item.security.code === code);
  assert.ok(found.length, `Missing original report security ${date} ${code}`);
  return found;
}
function amount(value: string | null) { return Number(value?.replace(/[^\d.]/g, '')); }

// All inputs are full, hash-verified original reports. Expectations below are
// transcribed from the stated source lines, never generated from parser output.
for (const a of security('2026-02-10', '603345.SS')) assert.equal(a.rating, '中性', 'A-share rating at lines101/106/114');
for (const h of security('2026-02-10', '2648.HK')) assert.equal(h.rating, '买入', 'H-share rating at lines101/106/114');
assert.equal(amount(security('2026-02-10', '603345.SS')[0].targetPrice), 98);
assert.equal(amount(security('2026-02-10', '2648.HK')[0].targetPrice), 91);

// Dictionary linking also finds other institutions' name-only mentions. The
// 58.5 target belongs specifically to this Citi article, not every mention.
const nongfuCiti = security('2026-01-14', '9633.HK').filter(item => item.institution === '花旗' && item.evidence.some(e => e.lineNumber >= 178 && e.lineNumber <= 199));
assert.ok(nongfuCiti.length);
for (const item of nongfuCiti) {
  assert.equal(item.rating, '买入', 'Nongfu line182 must not inherit Master Kong sell rating from line184');
  assert.equal(amount(item.targetPrice), 58.5);
}
assert.equal(amount(security('2026-09-03', 'AVGO.O')[0].targetPrice), 515, 'new target at line582');
assert.equal(amount(security('2026-08-26', '6821.HK')[0].targetPrice), 134, 'HK$ prefix at line453');
assert.equal(amount(security('2026-08-06', 'SNDK.O')[0].targetPrice), 2100, 'thousands separator at line613');
assert.equal(security('2026-08-26', '6821.HK')[0].types.includes('rating-change'), false, 'price change is not rating change');

for (const [code, line, price] of [
  ['0700.HK', 196, 765], ['BABA.N', 197, 190], ['9988.HK', 197, 189],
  ['3690.HK', 198, 120], ['PDD.O', 199, 136], ['YMM.N', 200, 14], ['1357.HK', 200, 7],
] as const) {
  const item = security('2026-09-04', code)[0];
  assert.equal(item.rating, '买入', code);
  assert.equal(amount(item.targetPrice), price, code);
  assert.equal(item.evidence[0].lineNumber, line, `link must point to actual buy sentence: ${code}`);
}
assert.equal(security('2026-09-04', '600176.SS')[0].evidence[0].lineNumber, 115);
assert.ok(opinions('2026-09-03').some((item) => item.security.displayName.includes('和黄医药') && item.rating === '买入'), 'detached company/rating fields at lines535-549');

for (const code of ['0992.HK', '002475.SZ', '2475.HK', '6613.HK', '002463.SZ', '0522.HK', '688008.SS', '6809.HK', '603501.SS']) {
  assert.equal(security('2026-09-07', code)[0].rating, '买入', `Citi list lines131-137: ${code}`);
}
for (const [name, price] of [['洛克希德·马丁', 641], ['诺斯罗普·格鲁曼', 617], ['RTX', 240], ['泰雷达科技', 685]] as const) {
  const row = opinions('2026-07-26').find((o) => o.security.displayName === name);
  assert.ok(row, `company in actual sentence at line311: ${name}`);
  assert.equal(amount(row.targetPrice), price);
}
assert.ok(!opinions('2026-07-26').some((o) => o.security.displayName.includes('按市值计价')));
const runze = security('2026-09-03', '300442.SZ')[0];
assert.equal(runze.rating, '买入');
assert.ok(runze.evidence[0].excerpt.includes('买入'));
assert.equal(runze.evidence[0].lineNumber, 228);

console.log('real report recognition tests passed');
