import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_STRATEGY_DIR = '/Users/bytedance/ai-projects/Strategy';

export type GitRunResult = {
  stdout: string;
  stderr: string;
};

export type GitRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number },
) => Promise<GitRunResult>;

export type PullResult = {
  success: boolean;
  strategyDir: string;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

export async function pullStrategyRepository(options: {
  strategyDir?: string;
  runGit?: GitRunner;
} = {}): Promise<PullResult> {
  const strategyDir = options.strategyDir ?? DEFAULT_STRATEGY_DIR;
  const startedAt = new Date().toISOString();
  const runGit = options.runGit ?? defaultGitRunner;

  try {
    const result = await runGit('git', ['pull', '--ff-only'], {
      cwd: strategyDir,
      timeout: 120_000,
    });
    return {
      success: true,
      strategyDir,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      strategyDir,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}

const defaultGitRunner: GitRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { stdout, stderr };
};
