import assert from 'node:assert/strict';

import { scrollPageToTop } from '../src/lib/pageScroll';

const smoothCalls: ScrollToOptions[] = [];
scrollPageToTop({
  scrollTo(options) {
    smoothCalls.push(options);
  },
}, false);

assert.deepEqual(smoothCalls, [{ top: 0, behavior: 'smooth' }]);

const reducedMotionCalls: ScrollToOptions[] = [];
scrollPageToTop({
  scrollTo(options) {
    reducedMotionCalls.push(options);
  },
}, true);

assert.deepEqual(reducedMotionCalls, [{ top: 0, behavior: 'auto' }]);

console.log('page scroll tests passed');
