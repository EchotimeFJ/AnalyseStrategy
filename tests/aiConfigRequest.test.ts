import assert from 'node:assert/strict';
import { aiConfigRequest } from '../src/lib/aiConfigRequest';

const hanging = (signal: AbortSignal) => new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))));
await assert.rejects(aiConfigRequest(hanging, 'verify', 5), /请求超时/);
await assert.rejects(aiConfigRequest(hanging, 'save', 5), /可能已经保存/);
await assert.rejects(aiConfigRequest(async () => { throw new Error('此操作仅限管理员'); }, 'verify'), /管理员密码/);
assert.equal(await aiConfigRequest(async () => 'ok', 'test'), 'ok');
console.log('AI config request timeout tests passed');
