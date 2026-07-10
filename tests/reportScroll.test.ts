import assert from 'node:assert/strict';

import { getCenteredScrollTop, getSourceLineScrollTop } from '../src/lib/reportScroll';

assert.equal(
  getCenteredScrollTop({
    containerHeight: 500,
    itemOffsetTop: 900,
    itemHeight: 120,
  }),
  710,
);

assert.equal(
  getCenteredScrollTop({
    containerHeight: 500,
    itemOffsetTop: 80,
    itemHeight: 120,
  }),
  0,
);

assert.equal(
  getSourceLineScrollTop({
    windowScrollY: 1000,
    viewportHeight: 600,
    elementTop: 200,
    elementHeight: 1200,
    startLine: 100,
    endLine: 160,
    targetLine: 130,
  }),
  1622,
);

console.log('report scroll tests passed');
