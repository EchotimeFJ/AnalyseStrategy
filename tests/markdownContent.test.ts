import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { MarkdownContent } from '../src/components/MarkdownContent';

const sample = `# 核心结论

这是 **买入观点**。

- 催化剂一
- 催化剂二

| 公司 | 评级 |
| --- | --- |
| 示例公司 | 买入 |

> 结论需要回到来源核对。

\`1768.HK\``;

for (const variant of ['report', 'assistant'] as const) {
  const html = renderToStaticMarkup(createElement(
    StaticRouter,
    { location: '/' },
    createElement(MarkdownContent, { markdown: sample, variant }),
  ));

  assert.match(html, new RegExp(`markdown-content markdown-content--${variant}`));
  assert.match(html, /<h1>核心结论<\/h1>/);
  assert.match(html, /<strong>买入观点<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<div class="markdown-table-scroll" role="region" aria-label="Markdown 表格，可横向滚动" tabindex="0"><table>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<code>1768\.HK<\/code>/);
}

const safeLinksHtml = renderToStaticMarkup(createElement(
  StaticRouter,
  { location: '/' },
  createElement(MarkdownContent, {
    markdown: '[报告来源](/reports?id=1) [外部来源](https://example.com) [危险链接](javascript:alert(1))\n\n<script>alert(1)</script>',
    variant: 'assistant',
  }),
));
assert.match(safeLinksHtml, /href="\/reports\?id=1"/);
assert.match(safeLinksHtml, /href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer"/);
assert.doesNotMatch(safeLinksHtml, /href="javascript:/);
assert.doesNotMatch(safeLinksHtml, /<script>/);

console.log('markdown content tests passed');
