import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  classifySearchIntent,
  groupSearchHits,
} from '../api/services/searchService';
import type { SearchHit } from '../api/services/reportParser';

const context = {
  securities: [
    { key: 'code:1768.HK', code: '1768.HK', displayName: '鸣鸣很忙', aliases: ['鸣鸣很忙', '明明很忙'], confidence: 'high' as const },
  ],
  institutions: ['中金', '高盛'],
};

assert.equal(classifySearchIntent('1768.HK', context).type, 'security-code');
assert.equal(classifySearchIntent('明明很忙', context).type, 'security-name');
assert.equal(classifySearchIntent('中金', context).type, 'institution');
assert.equal(classifySearchIntent('消费复苏', context).type, 'text');

const hits: SearchHit[] = [
  { reportId: 'r1', date: '2026-08-26', institution: '中金', lineNumber: 10, snippet: '第一段', matchedText: '忙' },
  { reportId: 'r1', date: '2026-08-26', institution: '中金', lineNumber: 12, snippet: '第二段', matchedText: '忙' },
  { reportId: 'r1', date: '2026-08-26', institution: '中金', lineNumber: 20, snippet: '第三段', matchedText: '忙' },
  { reportId: 'r2', date: '2026-08-25', institution: '高盛', lineNumber: 3, snippet: '另一个报告', matchedText: '忙' },
];
const groups = groupSearchHits(hits);
assert.equal(groups.length, 2);
assert.equal(groups[0].snippets.length, 2);
assert.deepEqual(groups[0].snippets[0].lineNumbers, [10, 12]);
assert.equal(groups[0].snippets[0].text, '第一段\n第二段');

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-grouped-search-'));
await fs.writeFile(
  path.join(tmpRoot, '2026-08-26.md'),
  `# 中金

鸣鸣很忙 (1768.HK)
维持买入评级。鸣鸣很忙的门店继续扩张。
鸣鸣很忙的供应链效率改善。

#高盛 #行业/半导体
\`#高盛\`
\`\`\`text
#高盛
\`\`\`
`,
  'utf-8',
);
process.env.REPORTS_DIR = tmpRoot;
const { rebuildIndex, searchReports } = await import(`../api/services/reportIndex.ts?grouped=${Date.now()}`);
await rebuildIndex();

const grouped = await searchReports({ q: '鸣鸣很忙' });
assert.equal(Array.isArray(grouped), false);
assert.equal(grouped.intent.type, 'security-name');
assert.equal(grouped.groups.length, 1);
assert.equal(grouped.company.security.code, '1768.HK');

const raw = await searchReports({ q: '鸣鸣很忙', raw: true });
assert.equal(Array.isArray(raw), true);
assert.ok(raw.length >= 2);

const tagResults = await searchReports({ q: '#高盛', mode: 'tag' });
assert.equal(Array.isArray(tagResults), false);
assert.equal(tagResults.totalHits, 1);
assert.equal(tagResults.groups[0].snippets[0].startLine, 7);

const nestedTagResults = await searchReports({ q: '#行业', mode: 'tag' });
assert.equal(nestedTagResults.totalHits, 1);

await fs.rm(tmpRoot, { recursive: true, force: true });

console.log('search service tests passed');
