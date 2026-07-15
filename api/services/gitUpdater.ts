import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getStrategyDir } from '../runtimeConfig.js';

const execFileAsync = promisify(execFile);

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
  const strategyDir = options.strategyDir ?? getStrategyDir();
  const startedAt = new Date().toISOString();
  const runGit = options.runGit ?? defaultGitRunner;

  try {
    const result = await runGit('git', withSafeDirectory(strategyDir, ['pull', '--ff-only']), {
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
    const credentialError = getGitCredentialError(strategyDir, message);
    if (credentialError) {
      return {
        success: false,
        strategyDir,
        stdout: '',
        stderr: credentialError,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

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
    const branch = (await runGit('git', withSafeDirectory(strategyDir, ['rev-parse', '--abbrev-ref', 'HEAD']), {
      cwd: strategyDir,
      timeout: 30_000,
    })).stdout.trim();

    if (!branch || branch === 'HEAD') {
      return {
        success: false,
        stderr: 'git pull failed because FETCH_HEAD is not writable, and the Strategy repository is not on a named branch.',
      };
    }

    const localHead = (await runGit('git', withSafeDirectory(strategyDir, ['rev-parse', 'HEAD']), {
      cwd: strategyDir,
      timeout: 30_000,
    })).stdout.trim();

    const remoteRef = (await runGit('git', withSafeDirectory(strategyDir, ['ls-remote', '--heads', 'origin', branch]), {
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

function getGitCredentialError(strategyDir: string, message: string) {
  if (!isGithubCredentialError(message)) {
    return null;
  }

  return [
    '当前服务器没有可用的 GitHub 拉取凭据，暂时无法自动执行 Strategy 仓库的 git pull。',
    `Strategy 目录：${strategyDir}`,
    '请为服务器配置该私有仓库的只读 deploy key，或改用带凭据的 HTTPS 认证后再重试。',
    '',
    '原始错误：',
    message.trim(),
  ].join('\n');
}

function isGithubCredentialError(message: string): boolean {
  return (
    message.includes("could not read Username for 'https://github.com'") ||
    message.includes('Permission denied (publickey)') ||
    message.includes('Authentication failed')
  );
}

function withSafeDirectory(strategyDir: string, args: string[]) {
  return ['-c', `safe.directory=${strategyDir}`, ...args];
}

const defaultGitRunner: GitRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { stdout, stderr };
};
