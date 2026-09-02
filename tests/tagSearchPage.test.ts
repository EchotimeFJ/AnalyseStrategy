import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import SearchPage from '../src/pages/SearchPage';

Object.assign(globalThis, {
  window: {
    localStorage: { getItem: () => 'light', setItem: () => undefined },
    matchMedia: () => ({ matches: false }),
  },
  __APP_VERSION__: '0.2.6',
  __GIT_COMMIT__: 'test-commit',
});

const html = renderToStaticMarkup(createElement(
  StaticRouter,
  { location: '/search?q=%23高盛&mode=tag' },
  createElement(SearchPage),
));

assert.match(html, /<input[^>]*value="#高盛"/);
assert.match(html, /<option value="tag" selected="">标签<\/option>/);

console.log('tag search page tests passed');
