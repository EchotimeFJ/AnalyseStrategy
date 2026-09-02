import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { MarkdownContent } from '../src/components/MarkdownContent';

const markdown = `# 报告标题

看好 #高盛 #AH #行业/半导体。

\`#代码\`

[已有 #链接](https://example.com/#section)

纯数字 #1984，预测#1-3。`;

for (const variant of ['report', 'assistant'] as const) {
  const html = renderToStaticMarkup(createElement(
    StaticRouter,
    { location: '/' },
    createElement(MarkdownContent, {
      markdown,
      variant,
      internalLinkClassName: variant === 'assistant' ? 'assistant-citation' : undefined,
    }),
  ));

  assert.equal((html.match(/class="markdown-tag"/g) ?? []).length, 3);
  assert.match(html, /href="\/search\?q=%23%E9%AB%98%E7%9B%9B&amp;mode=tag"/);
  assert.match(html, /<code>#代码<\/code>/);
  assert.match(html, /href="https:\/\/example\.com\/#section"[^>]*>已有 #链接<\/a>/);
  assert.match(html, /纯数字 #1984，预测#1-3。/);
  assert.doesNotMatch(html, /markdown-tag assistant-citation|assistant-citation markdown-tag/);
}

console.log('markdown tag rendering tests passed');
