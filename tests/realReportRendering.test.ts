import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { MarkdownViewer } from '../src/components/MarkdownViewer';
import { realReport } from './realReportFixture';

const report = realReport('2026-09-04');
const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' },
  createElement(MarkdownViewer, { markdown: report.markdown, highlightTerms: ['美图'] })));
assert.ok(!html.includes('<del>'), 'Actual numeric tilde ranges must not delete the intervening report');
assert.ok(html.includes('15~16家'));
assert.ok(html.includes('3万亿~5万亿'));
for (let line = 189; line <= 200; line += 1) {
  assert.ok(html.includes(`data-source-line="${line}"`), `Missing exact source line ${line}`);
}
const sharedLine = html.match(/<span data-source-line="200">([\s\S]*?)<\/span>/)?.[1];
assert.ok(sharedLine?.includes('满帮集团'));
assert.match(sharedLine!, /class="report-target-highlight">美图<\/mark>/);
assert.doesNotMatch(sharedLine!, /class="report-target-highlight">满帮集团<\/mark>/);
// Display marker removal must not move the following line's source anchor.
const followingLine = html.match(/<span data-source-line="197">([\s\S]*?)<\/span>/)?.[1];
assert.ok(followingLine?.includes('阿里巴巴'));
assert.ok(!followingLine?.includes('=='));
assert.ok(html.includes('markdown-highlight'));
assert.ok(html.includes('markdown-tag'));
// This original report contains no GFM table or explicit double-tilde deletion.
// Existing Markdown tests continue to cover general GFM rendering.
console.log('real report rendering tests passed');
