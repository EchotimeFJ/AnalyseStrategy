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
    const message = getErrorMessage(error);
    const fallback = isFetchHeadPermissionError(message)
      ? await verifyRemoteIsCurrent(strategyDir, runGit)
      : null;

    if (fallback?.success) {
      return {
        success: true,
        strategyDir,
        stdout: fallback.stdout,
        stderr: message,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    return {
      success: false,
      strategyDir,
      stdout: '',
      stderr: fallback && 'stderr' in fallback ? fallback.stderr : message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}

async function verifyRemoteIsCurrent(
  strategyDir: string,
  runGit: GitRunner,
): Promise<{ success: true; stdout: string } | { success: false; stderr: string }> {
  try {
    const branch = (await runGit('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: strategyDir,
      timeout: 30_000,
    })).stdout.trim();

    if (!branch || branch === 'HEAD') {
      return {
        success: false,
        stderr: 'git pull failed because FETCH_HEAD is not writable, and the Strategy repository is not on a named branch.',
      };
    }

    const localHead = (await runGit('git', ['rev-parse', 'HEAD'], {
      cwd: strategyDir,
      timeout: 30_000,
    })).stdout.trim();

    const remoteRef = (await runGit('git', ['ls-remote', '--heads', 'origin', branch], {
      cwd: strategyDir,
      timeout: 120_000,
    })).stdout.trim();
    const remoteHead = remoteRef.split(/\s+/)[0] ?? '';

    if (localHead && remoteHead && localHead === remoteHead) {
      return {
        success: true,
        stdout: [
          'Already up to date.',
          'git pull could not write .git/FETCH_HEAD in this sandbox, but git ls-remote verified local HEAD matches origin.',
        ].join('\n'),
      };
    }

    return {
      success: false,
      stderr: [
        'git pull failed because .git/FETCH_HEAD is not writable in the current sandbox.',
        `Local ${branch}: ${localHead || '-'}`,
        `Remote origin/${branch}: ${remoteHead || '-'}`,
        'Please run git pull --ff-only for the Strategy repository from a terminal with permission to write that repository, or add /Users/bytedance/ai-projects/Strategy to the sandbox allowed paths.',
      ].join('\n'),
    };
  } catch (fallbackError) {
    return {
      success: false,
      stderr: [
        'git pull failed because .git/FETCH_HEAD is not writable, and remote verification also failed.',
        getErrorMessage(fallbackError),
      ].join('\n'),
    };
  }
}

function isFetchHeadPermissionError(message: string): boolean {
  return message.includes(".git/FETCH_HEAD") && message.includes('Operation not permitted');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const defaultGitRunner: GitRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { stdout, stderr };
};
