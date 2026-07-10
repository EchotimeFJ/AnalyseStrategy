import assert from 'node:assert/strict';

import { buildReportLink, searchHitHighlightTerms, targetMentionHighlightTerms } from '../src/lib/reportLinks';

const link = buildReportLink({
  reportId: '2026__2026-06-26',
  lineNumber: 128,
  highlightTerms: ['中国宏桥', '1378.HK', '中国宏桥'],
});

assert.equal(
  link,
  '/reports?id=2026__2026-06-26&line=128&highlight=%E4%B8%AD%E5%9B%BD%E5%AE%8F%E6%A1%A5&highlight=1378.HK',
);

assert.deepEqual(
  targetMentionHighlightTerms({
    targetName: '中国宏桥',
    code: '1378.HK',
    aliases: ['宏桥', '中国宏桥', ''],
  }),
  ['中国宏桥', '1378.HK', '宏桥'],
);

assert.deepEqual(
  searchHitHighlightTerms({
    matchedText: '藏格矿业',
    query: '藏格矿业',
  }),
  ['藏格矿业'],
);

assert.deepEqual(
  searchHitHighlightTerms({
    matchedText: '买入',
    query: '买入评级',
  }),
  ['买入', '买入评级'],
);

console.log('report link tests passed');
