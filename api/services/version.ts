import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };
const startedAt = new Date().toISOString();

export function getAppVersion(options: {
  packageVersion?: string;
  env?: Record<string, string | undefined>;
} = {}) {
  const env = options.env ?? process.env;
  return {
    version: options.packageVersion ?? packageJson.version ?? '0.0.0',
    commit: env.APP_GIT_COMMIT || 'development',
    buildTime: env.APP_BUILD_TIME || startedAt,
  };
}
