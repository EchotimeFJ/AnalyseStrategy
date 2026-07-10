import assert from 'node:assert/strict';
import {
  buildReportFromMarkdown,
  createExactSearch,
  extractTargetMentions,
  normalizeText,
} from '../api/services/reportParser';

const sampleMarkdown = `# 瑞银

==发布日期：2026年7月7日==
==覆盖个股：太空探索技术公司（Space Exploration Technologies Corp / SpaceX）==
==投资评级：买入（首次覆盖）==
==12个月目标价：210.00美元==
==当前股价（2026年7月6日）：160.91美元==

SpaceX 拥有星舰、星链和 AI 算力三条增长曲线。

#瑞银 #航天航空 #海外

# 高盛

英诺赛科 (2577.HK)
800 VDC 驱动 AI 数据中心氮化镓应用；首予“买入”评级，目标价 114 港元。
催化剂：(1) 800 VDC 产品开始放量；(2) 苏州工厂新产能爬坡。
主要风险：(1) GaN 普及速度慢于预期；(2) 产品价格竞争更激烈。

#高盛 #半导体 #AH
`;

const report = buildReportFromMarkdown({
  id: '2026-07-08',
  filePath: '/tmp/2026-07-08.md',
  markdown: sampleMarkdown,
});

assert.equal(normalizeText('  ２５７７．ＨＫ '), '2577.hk');

assert.deepEqual(
  report.institutions.map((item) => item.institution),
  ['瑞银', '高盛'],
);

const search = createExactSearch([report]);
assert.equal(search('SpaceX').length >= 1, true);
assert.equal(search('spacex').length, search('SpaceX').length);
assert.equal(search('英诺赛科').length >= 1, true);
assert.equal(search('英诺').length >= 1, true);
assert.equal(search('不存在的标的').length, 0);

const mentions = extractTargetMentions(report);
const spacex = mentions.find((item) => item.aliases.includes('SpaceX'));
assert.ok(spacex);
assert.equal(spacex?.institution, '瑞银');
assert.equal(spacex?.rating, '买入');
assert.equal(spacex?.targetPrice, '210.00美元');
assert.equal(spacex?.currentPrice, '160.91美元');

const innoscience = mentions.find((item) => item.code === '2577.HK');
assert.ok(innoscience);
assert.equal(innoscience?.institution, '高盛');
assert.equal(innoscience?.rating, '买入');
assert.equal(innoscience?.targetPrice, '114 港元');
assert.equal(innoscience?.signals.some((item) => item.type === 'catalyst'), true);
assert.equal(innoscience?.signals.some((item) => item.type === 'risk'), true);

const shipbuildingMarkdown = `# 高盛

恒力重工 (603268.SS)
恒力持有闲置产能来获取更多新船订单，且产品组合正在改善。

扬子江船业 (YAZG.SI)
扬子江船业有3个主要船厂——新扬子、扬子鑫福和扬子三井（YAMIC）。

中国船舶工业集团公司 (CSSC, 600150.SS)
来自中国船舶工业集团公司（CSSC）的证券事务代表出席了会议。
■ CSSC合并更新：中国船舶工业股份有限公司（600150.SS）和中国船舶重工股份有限公司（前601989.SS）于2025年8月完成了合并。

中远海控 (601919.SS/1919.HK)
我们对==中远海控H/A股的12个月目标价分别为11.5港元/14.7人民币==，维持买入评级。

价格目标风险与方法论 - 扬子江船业
我们对扬子江船业评级为买入，我们的12个月目标价4.00新元是基于P/B估值。
`;

const shipbuildingReport = buildReportFromMarkdown({
  id: '2025-10-26',
  filePath: '/tmp/2025-10-26.md',
  markdown: shipbuildingMarkdown,
});

const shipMentions = extractTargetMentions(shipbuildingReport);
const hengli = shipMentions.find((item) => item.code === '603268.SS');
assert.ok(hengli);
assert.equal(hengli?.rating, undefined);
assert.equal(hengli?.action, undefined);

const cssc = shipMentions.find((item) => item.code === '600150.SS');
assert.ok(cssc);
assert.equal(cssc?.targetName, '中国船舶工业集团公司');
assert.equal(cssc?.rating, undefined);
assert.equal(cssc?.targetPrice, undefined);
assert.equal(cssc?.action, undefined);
assert.equal(shipMentions.some((item) => item.targetName === '中国船舶工业'), false);

const yangzijiang = shipMentions.find((item) => item.code === 'YAZG.SI');
assert.ok(yangzijiang);
assert.equal(yangzijiang?.rating, '买入');
assert.equal(yangzijiang?.targetPrice, '4.00新元');

const coscoShipping = shipMentions.find((item) => item.code === '601919.SS');
assert.ok(coscoShipping);
assert.equal(coscoShipping?.rating, '买入');
assert.equal(coscoShipping?.targetPrice, '11.5港元');
assert.equal(coscoShipping?.action, '维持');

console.log('parser tests passed');
