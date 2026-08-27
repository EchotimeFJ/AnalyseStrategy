import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { MarkdownContent } from '../src/components/MarkdownContent';
import { createRemarkChatCitations } from '../src/lib/chatCitations';
import type { AiSource } from '../src/types';

const sources: AiSource[] = [{
  id: 'source-1',
  reportId: '2026__2026-08-26',
  date: '2026-08-26',
  institution: '高盛',
  securityName: '鸣鸣很忙',
  lineNumber: 3,
  excerpt: '维持买入评级。',
}];

const html = renderToStaticMarkup(createElement(
  StaticRouter,
  { location: '/' },
  createElement(MarkdownContent, {
    markdown: '正文引用 [1]，无效引用保留 [2]。\n\n`数组[1]`\n\n[已有链接 [1]](https://example.com)',
    variant: 'assistant',
    internalLinkClassName: 'assistant-citation',
    remarkPlugins: [createRemarkChatCitations(sources)],
  }),
));

assert.equal((html.match(/class="assistant-citation"/g) ?? []).length, 1);
assert.match(html, /href="\/reports\?id=2026__2026-08-26&amp;line=3&amp;highlight=/);
assert.match(html, /无效引用保留 \[2\]/);
assert.match(html, /<code>数组\[1\]<\/code>/);
assert.match(html, /href="https:\/\/example\.com"[^>]*>已有链接 \[1\]<\/a>/);

console.log('chat citation tests passed');
