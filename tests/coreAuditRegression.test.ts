import assert from 'node:assert/strict';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
const parse=(text:string)=>extractOpinions(buildReportFromMarkdown({id:'audit',filePath:'/2026-10-20.md',markdown:'# 高盛\n\n'+text}));
for(const text of ['建议不要买入','建议暂缓买入','建议避免买入','推荐谨慎买入','不建议买入','此前建议买入','去年建议买入','建议如果回调再买入']) {
 assert.equal(parse('腾讯控股（0700.HK）\n我们'+text+'该股。').some(o=>o.buyRecommendation),false,text);
}
for(const text of ['建议买入','推荐买入','建议逢低买入'])assert.ok(parse('腾讯控股（0700.HK）\n我们'+text+'该股。').some(o=>o.buyRecommendation),text);
const nested=parse('中银香港（控股）（2388.HK）：季度业绩前瞻\n维持买入评级，目标价59.7港元。');
assert.equal(nested.find(o=>o.security.code==='2388.HK')?.rating,'买入');
assert.equal(nested.find(o=>o.security.code==='2388.HK')?.targetPrice,'59.7 港元');
assert.ok(nested[0].evidence.some(e=>e.lineNumber===2||e.lineNumber===4));
console.log('audit parser regressions passed');
const cards=buildReportFromMarkdown({id:'institutions',filePath:'/2026-10-20.md',markdown:'# AH\n\n【入库卡片】\n标题：腾讯控股 (0700.HK，买入)\n机构：瑞银 (UBS)\n\n【入库卡片】\n标题：甘李药业 (603087.SS，买入)\n机构：Goldman Sachs\n'});
assert.deepEqual(cards.institutions.map(b=>b.institution),['瑞银','高盛']);
assert.deepEqual(extractOpinions(cards).map(o=>o.institution),['瑞银','高盛']);
const leading=buildReportFromMarkdown({id:'leading',filePath:'/2026-10-30.md',markdown:'# AH\n\n 花旗\n\n【入库卡片】\n花旗\n腾讯控股 (0700.HK，买入)'});
assert.equal(extractOpinions(leading)[0].institution,'花旗');
assert.equal(parse('华勤技术 (603296.SS)\n目标价118元，较摩根大通和彭博有限合伙企业 (Bloomberg Finance L.P.) 估计的同行均值高10%。').some(o=>o.security.code==='FINANCE.L'),false);
