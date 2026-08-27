import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { MarkdownViewer } from '../src/components/MarkdownViewer';

const html = renderToStaticMarkup(createElement(
  StaticRouter,
  { location: '/' },
  createElement(MarkdownViewer, {
    markdown: '# 报告标题\n\n鸣鸣很忙维持==买入==。\n\n| 公司 | 评级 |\n| --- | --- |\n| 鸣鸣很忙 | 买入 |',
    highlightTerms: ['鸣鸣很忙'],
  }),
));

assert.match(html, /class="markdown-content markdown-content--report markdown-body"/);
assert.match(html, /data-line-start="1"/);
assert.match(html, /class="markdown-highlight">买入<\/mark>/);
assert.match(html, /class="report-target-highlight">鸣鸣很忙<\/mark>/);
assert.match(html, /class="markdown-table-scroll"/);
assert.doesNotMatch(html, /id="report-line-/);

console.log('markdown viewer tests passed');
