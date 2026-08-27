import assert from 'node:assert/strict';
import { parseSseFrames } from '../src/lib/sse';

const first = parseSseFrames('event: sources\ndata: {"sources":[]');
assert.equal(first.events.length, 0);
assert.match(first.rest, /sources/);

const second = parseSseFrames(`${first.rest}}\n\nevent: delta\ndata: {"text":"你好"}\n\n`);
assert.deepEqual(second.events, [
  { event: 'sources', data: '{"sources":[]}' },
  { event: 'delta', data: '{"text":"你好"}' },
]);
assert.equal(second.rest, '');

console.log('ai stream parser tests passed');
