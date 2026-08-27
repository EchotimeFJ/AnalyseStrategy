import assert from 'node:assert/strict';
import { getApiErrorMessage } from '../src/lib/api';

assert.equal(getApiErrorMessage({ error: '更新失败' }, 500), '更新失败');
assert.equal(
  getApiErrorMessage({ error: { code: 'INDEX_UNAVAILABLE', message: '报告目录不可用' } }, 500),
  '报告目录不可用',
);
assert.equal(getApiErrorMessage(null, 502), '服务返回异常（502）');

console.log('api client tests passed');
