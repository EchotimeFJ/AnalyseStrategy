import assert from 'node:assert/strict';

import { APP_BASE_PATH, appRoute } from '../src/lib/appPaths';

assert.equal(APP_BASE_PATH, '/analyse-strategy/');
assert.equal(appRoute('/'), '/');
assert.equal(appRoute('/manage'), '/manage');
assert.equal(appRoute('/index'), '/manage');

console.log('app paths tests passed');
