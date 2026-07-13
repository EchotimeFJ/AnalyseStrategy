import assert from 'node:assert/strict';

import { resolveApiPath } from '../src/lib/api';

assert.equal(resolveApiPath('/api/summary', '/'), '/api/summary');
assert.equal(resolveApiPath('/api/summary', '/analyse-strategy/'), '/analyse-strategy/api/summary');
assert.equal(resolveApiPath('api/summary', '/analyse-strategy/'), '/analyse-strategy/api/summary');
assert.equal(resolveApiPath('/analyse-strategy/api/summary', '/analyse-strategy/'), '/analyse-strategy/api/summary');
assert.equal(resolveApiPath('https://example.com/api/summary', '/analyse-strategy/'), 'https://example.com/api/summary');

console.log('api path tests passed');
