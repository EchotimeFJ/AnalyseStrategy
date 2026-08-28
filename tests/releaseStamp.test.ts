import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReleaseStamp } from '../src/components/ReleaseStamp';

const fullCommit = '7f5b75e2ba0acead7bc0dd9cb6612e341d3e6118';
const html = renderToStaticMarkup(createElement(ReleaseStamp, {
  version: '0.2.3',
  commit: fullCommit,
}));

assert.match(html, /AnalyseStrategy v0\.2\.3/);
assert.match(html, /title="7f5b75e2ba0acead7bc0dd9cb6612e341d3e6118"/);
assert.match(html, />7f5b75e<\/div>/);
assert.doesNotMatch(html, />7f5b75e2ba0acead7bc0dd9cb6612e341d3e6118<\/div>/);

const developmentHtml = renderToStaticMarkup(createElement(ReleaseStamp, {
  version: '0.2.3',
  commit: 'development',
}));

assert.match(developmentHtml, />development<\/div>/);

console.log('release stamp tests passed');
