import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import { MarkdownViewer } from '../src/components/MarkdownViewer';

const html = renderToStaticMarkup(createElement(
  StaticRouter,
  { location: '/' },
  createElement(MarkdownViewer, {
    markdown: '#高盛\n\n高盛观点保持不变。',
    highlightTerms: ['高盛'],
  }),
));

assert.match(html, /class="markdown-tag"[^>]*>#高盛<\/a>/);
assert.equal((html.match(/class="report-target-highlight"/g) ?? []).length, 1);
assert.match(html, /class="report-target-highlight">高盛<\/mark>观点/);

console.log('markdown tag highlight tests passed');
