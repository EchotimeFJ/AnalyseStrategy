import assert from 'node:assert/strict';
import { pullStrategyRepository } from '../api/services/gitUpdater';

const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

const result = await pullStrategyRepository({
  runGit: async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    return {
      stdout: 'Already up to date.\n',
      stderr: '',
    };
  },
});

assert.equal(calls.length, 1);
assert.equal(calls[0].command, 'git');
assert.deepEqual(calls[0].args, ['pull', '--ff-only']);
assert.equal(calls[0].cwd, '/Users/bytedance/ai-projects/Strategy');
assert.equal(result.success, true);
assert.equal(result.strategyDir, '/Users/bytedance/ai-projects/Strategy');
assert.equal(result.stdout.trim(), 'Already up to date.');
assert.ok(result.finishedAt);

const failed = await pullStrategyRepository({
  runGit: async () => {
    throw new Error('network unavailable');
  },
});

assert.equal(failed.success, false);
assert.equal(failed.stderr, 'network unavailable');

console.log('git updater tests passed');
