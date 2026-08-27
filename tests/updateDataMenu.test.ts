import assert from 'node:assert/strict';
import { updateDataReducer, type UpdateDataState } from '../src/components/UpdateDataMenu';

const idle: UpdateDataState = { status: 'idle', mode: null, result: null, error: '' };
const confirming = updateDataReducer(idle, { type: 'choose', mode: 'github' });
assert.equal(confirming.status, 'confirming');
assert.equal(confirming.mode, 'github');

const updating = updateDataReducer(confirming, { type: 'start' });
assert.equal(updating.status, 'updating');
assert.deepEqual(updateDataReducer(updating, { type: 'start' }), updating);

const success = updateDataReducer(updating, { type: 'success', result: { added: 2, modified: 1, removed: 0 } });
assert.equal(success.status, 'success');
assert.equal(success.result?.added, 2);

const failed = updateDataReducer(updating, { type: 'error', error: 'GitHub 更新失败' });
assert.equal(failed.status, 'error');
assert.equal(failed.error, 'GitHub 更新失败');

console.log('update data menu tests passed');
