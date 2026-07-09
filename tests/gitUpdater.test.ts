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

const sandboxCalls: Array<{ command: string; args: string[]; cwd: string }> = [];
const sandboxFallback = await pullStrategyRepository({
  runGit: async (command, args, options) => {
    sandboxCalls.push({ command, args, cwd: options.cwd });
    if (args[0] === 'pull') {
      throw new Error("Command failed: git pull --ff-only\nerror: cannot open '.git/FETCH_HEAD': Operation not permitted\n");
    }
    if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') {
      return { stdout: 'main\n', stderr: '' };
    }
    if (args.join(' ') === 'rev-parse HEAD') {
      return { stdout: 'abc123\n', stderr: '' };
    }
    if (args.join(' ') === 'ls-remote --heads origin main') {
      return { stdout: 'abc123\trefs/heads/main\n', stderr: '' };
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  },
});

assert.equal(sandboxFallback.success, true);
assert.match(sandboxFallback.stdout, /Already up to date/);
assert.match(sandboxFallback.stdout, /ls-remote verified/);
assert.equal(sandboxCalls.length, 4);
assert.deepEqual(sandboxCalls.map((call) => call.args), [
  ['pull', '--ff-only'],
  ['rev-parse', '--abbrev-ref', 'HEAD'],
  ['rev-parse', 'HEAD'],
  ['ls-remote', '--heads', 'origin', 'main'],
]);

const remoteAhead = await pullStrategyRepository({
  runGit: async (_command, args) => {
    if (args[0] === 'pull') {
      throw new Error("Command failed: git pull --ff-only\nerror: cannot open '.git/FETCH_HEAD': Operation not permitted\n");
    }
    if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') {
      return { stdout: 'main\n', stderr: '' };
    }
    if (args.join(' ') === 'rev-parse HEAD') {
      return { stdout: 'local123\n', stderr: '' };
    }
    if (args.join(' ') === 'ls-remote --heads origin main') {
      return { stdout: 'remote456\trefs/heads/main\n', stderr: '' };
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  },
});

assert.equal(remoteAhead.success, false);
assert.match(remoteAhead.stderr, /FETCH_HEAD is not writable/);
assert.match(remoteAhead.stderr, /Local main: local123/);
assert.match(remoteAhead.stderr, /Remote origin\/main: remote456/);

console.log('git updater tests passed');
