import assert from 'node:assert/strict';
import { compactSearchParams } from '../src/lib/searchParams';

assert.equal(compactSearchParams({ q: '英诺赛科', mode: 'all', from: '', raw: undefined }).toString(), 'q=%E8%8B%B1%E8%AF%BA%E8%B5%9B%E7%A7%91&mode=all');

console.log('search params tests passed');
