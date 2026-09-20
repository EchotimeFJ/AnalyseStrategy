import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { AssistantMessage } from '../src/components/assistant/AssistantMessage';
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
  createElement(AssistantMessage, {
    message: {
      id: 'assistant-1',
      role: 'assistant',
      content: '# 核心结论\n\n**维持买入** [1]\n\n| 公司 | 评级 |\n| --- | --- |\n| 鸣鸣很忙 | 买入 |',
      sources,
    },
    phase: 'idle',
    onRetry: () => undefined,
    onStop: () => undefined,
  }),
));

assert.match(html, /class="markdown-content markdown-content--assistant assistant-markdown/);
assert.match(html, /<h1>核心结论<\/h1>/);
assert.match(html, /<strong>维持买入<\/strong>/);
assert.match(html, /class="assistant-citation"/);
assert.match(html, /class="markdown-table-scroll"/);

console.log('assistant markdown tests passed');
