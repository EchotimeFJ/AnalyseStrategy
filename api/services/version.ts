import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version?: string };

export function getAppVersion(options: {
  packageVersion?: string;
  env?: Record<string, string | undefined>;
} = {}) {
  const env = options.env ?? process.env;
  return {
    version: options.packageVersion ?? packageJson.version ?? '0.0.0',
    commit: env.APP_GIT_COMMIT || 'development',
    buildTime: env.APP_BUILD_TIME || '',
  };
}
