import assert from 'node:assert/strict';

import { resolveApiPath } from '../src/lib/api';

assert.equal(resolveApiPath('/api/summary', '/'), '/api/summary');
assert.equal(resolveApiPath('/api/summary', '/as/'), '/as/api/summary');
assert.equal(resolveApiPath('api/summary', '/as/'), '/as/api/summary');
assert.equal(resolveApiPath('/as/api/summary', '/as/'), '/as/api/summary');
assert.equal(resolveApiPath('https://example.com/api/summary', '/as/'), 'https://example.com/api/summary');

console.log('api path tests passed');
