import assert from 'node:assert/strict';
import { getAppVersion } from '../api/services/version';

assert.deepEqual(getAppVersion({
  packageVersion: '0.1.0',
  env: { APP_GIT_COMMIT: 'abc1234', APP_BUILD_TIME: '2026-08-27T10:00:00Z' },
}), {
  version: '0.1.0',
  commit: 'abc1234',
  buildTime: '2026-08-27T10:00:00Z',
});

console.log('version tests passed');
