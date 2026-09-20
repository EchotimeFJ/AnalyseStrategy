import assert from 'node:assert/strict';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';

const parse = (text: string) => extractOpinions(buildReportFromMarkdown({id:'list',filePath:'/list.md',markdown:'# 花旗\n\n'+text}));
for (const [text, expected] of [
  ['重申买入评级，首选三一重工/浙江鼎力：全球化持续推进。', ['三一重工', '浙江鼎力']],
  ['我们对深南电路/鹏鼎控股持买入评级：扩产周期较长。', ['深南电路', '鹏鼎控股']],
  ['我们对生益科技（SYT）/建滔积层板（KBL）持买入评级。', ['生益科技', '建滔积层板']],
  ['标题：万辰集团（300972.SZ）：首次覆盖给予“买入”评级', ['万辰集团']],
] as const) {
  assert.deepEqual(parse(text).filter(o=>o.rating==='买入').map(o=>o.sourceName).sort(), [...expected].sort());
}
const dual = parse('标的：潍柴动力（000338.SZ / 2338.HK，买入）、中国重汽（3808.HK，买入）、杰瑞股份（002353.CH，未覆盖）');
assert.deepEqual(dual.filter(o=>o.rating==='买入').map(o=>o.security.code).sort(), ['000338.SZ','2338.HK','3808.HK']);
assert.equal(dual.find(o=>o.security.code==='002353.SZ')?.rating, null);
for (const text of ['我们不再对深南电路/鹏鼎控股持买入评级。', '此前对深南电路/鹏鼎控股持买入评级。', '行业建议买入看涨期权，ESS 储能系统需求增长。']) {
  assert.equal(parse(text).filter(o=>o.rating==='买入'||o.buyRecommendation).length, 0, text);
}
const isolated = parse('深南电路（002916.SZ，买入，目标价180元）、鹏鼎控股（002938.SZ，中性）。');
assert.equal(isolated.find(o=>o.security.code==='002938.SZ')?.rating, '中性');
assert.equal(isolated.find(o=>o.security.code==='002938.SZ')?.targetPrice, null);
const card = parse('【入库卡片】\n标题：万辰集团 (300972.SZ)：首次覆盖给予“买入”评级\n机构：UBS\n标的：万辰集团 (300972.SZ)\n关键数字：目标价250元人民币。');
assert.equal(card.find(o=>o.security.code==='300972.SZ')?.sourceName, '万辰集团');
assert.equal(card.find(o=>o.security.code==='300972.SZ')?.targetPrice, '250 元');
assert.equal(card.some(o=>o.sourceName?.includes('入库卡片')), false);
console.log('program coordinated rating lists passed');
