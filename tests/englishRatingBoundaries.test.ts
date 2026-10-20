import assert from 'node:assert/strict';
import { buildReportFromMarkdown, extractTargetMentions } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';

const parse = (text: string) => buildReportFromMarkdown({
  id: 'english-rating', filePath: '/english-rating.md', markdown: '# 瑞银\n\n' + text,
});

// The translated title describes national-team trading, not Team (TISI.N).
const title = '标题：中国衍生品观察 - 英国市场营销反馈：国家队加速买入 (China Derivs Observations - UK Marketing Feedback | National Team Buying Acceleration)';
const report = parse(`【入库卡片】\n${title}\n机构：瑞银 (UBS)\n标的：中证300 (000300.SH / UBC300PR)`);
assert.equal(extractTargetMentions(report).some(mention => mention.targetName === 'Team' || mention.code === 'TISI.N'), false);
assert.equal(extractOpinions(report).some(opinion => opinion.rating === '买入'), false);

for (const word of ['Buying', 'buying', 'Buyback', 'Buyer', 'Holding', 'Holdings', 'Seller', 'Selling', 'Overweighting', 'Underweighting', 'Neutrality', 'Buy2026', 'Buy_signal']) {
  for (const text of [
    `National Team ${word} Acceleration`,
    `Team (TISI.N)\nRating: ${word}`,
    `Team (TISI.N)\n维持${word}`,
    `Team (TISI.N)\n评级从Hold上调至${word}`,
  ]) {
    assert.equal(extractOpinions(parse(text)).some(opinion => opinion.rating), false, text);
  }
}

// A real company and its complete English rating must still be recognized,
// including mixed Chinese/English text and punctuation.
for (const [rating, expected] of [
  ['Buy', '买入'], ['BUY', '买入'], ['buy', '买入'], ['Hold', '持有'],
  ['Sell', '卖出'], ['Overweight', '增持'], ['Underweight', '减持'],
  ['Neutral', '中性'], ['OW', '增持'], ['UW', '减持'],
]) {
  for (const text of [`Team (TISI.N, ${rating})`, `Team (TISI.N)\n维持“${rating}”评级`]) {
    assert.equal(extractOpinions(parse(text)).find(opinion => opinion.security.code === 'TISI.N')?.rating, expected, text);
  }
}
assert.equal(extractOpinions(parse('Team Buy')).find(opinion => opinion.security.code === 'TISI.N')?.rating, '买入');
console.log('English rating word boundaries passed');
