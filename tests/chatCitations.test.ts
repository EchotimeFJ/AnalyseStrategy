import assert from 'node:assert/strict';
import { linkifyChatCitations } from '../src/lib/chatCitations';
import type { AiSource } from '../src/types';

const sources: AiSource[] = [
  {
    id: 'source-1',
    reportId: '2026__2026-08-26',
    date: '2026-08-26',
    institution: '高盛',
    securityName: '鸣鸣很忙',
    lineNumber: 3,
    excerpt: '维持买入评级。',
  },
];

assert.equal(
  linkifyChatCitations('目标价上调 [1]，无效来源保留 [2]。', sources),
  '目标价上调 [来源 1](/reports?id=2026__2026-08-26&line=3&highlight=%E9%B8%A3%E9%B8%A3%E5%BE%88%E5%BF%99)，无效来源保留 [2]。',
);
assert.equal(
  linkifyChatCitations('已有链接 [1](https://example.com) 不应嵌套。', sources),
  '已有链接 [1](https://example.com) 不应嵌套。',
);

console.log('chat citation tests passed');
