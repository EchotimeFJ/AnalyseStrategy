import assert from 'node:assert/strict';

import {
  buildMarkdownTagSearchPath,
  findMarkdownTags,
  markdownTagMatches,
} from '../src/lib/markdownTags';

assert.deepEqual(
  findMarkdownTags('#高盛 #AH #行业/半导体').map(({ raw, name }) => ({ raw, name })),
  [
    { raw: '#高盛', name: '高盛' },
    { raw: '#AH', name: 'AH' },
    { raw: '#行业/半导体', name: '行业/半导体' },
  ],
);

assert.deepEqual(
  findMarkdownTags('预测#1-3，利好 #120%，C#，网址 https://example.com/#section，保留 #AI。')
    .map(({ raw }) => raw),
  ['#AI'],
);

assert.deepEqual(findMarkdownTags('主题 #🚀 #y1984').map(({ raw }) => raw), ['#🚀', '#y1984']);
assert.equal(markdownTagMatches('行业/半导体', '#行业'), true);
assert.equal(markdownTagMatches('行业化', '#行业'), false);
assert.equal(markdownTagMatches('AI', '#ai'), true);
assert.equal(
  buildMarkdownTagSearchPath('#高盛'),
  '/search?q=%23%E9%AB%98%E7%9B%9B&mode=tag',
);

console.log('markdown tag tests passed');
