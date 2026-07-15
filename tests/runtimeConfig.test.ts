import assert from 'node:assert/strict';

const ENV_KEYS = ['REPORT_DIR', 'REPORTS_DIR', 'STRATEGY_DIR', 'PORT'] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>;

function resetEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadRuntimeConfig() {
  return import(`../api/runtimeConfig.ts?test=${Date.now()}-${Math.random()}`);
}

try {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  let runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getReportDir(), '/opt/Strategy/港A美/机构日报');
  assert.equal(runtimeConfig.getStrategyDir(), '/opt/Strategy');
  assert.equal(runtimeConfig.getServerPort(), 3003);

  process.env.REPORTS_DIR = '/tmp/legacy-reports';
  runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getReportDir(), '/tmp/legacy-reports');

  process.env.REPORT_DIR = '/tmp/reports';
  runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getReportDir(), '/tmp/reports');

  process.env.STRATEGY_DIR = '/tmp/strategy';
  runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getStrategyDir(), '/tmp/strategy');

  process.env.PORT = '4123';
  runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getServerPort(), 4123);

  process.env.PORT = 'not-a-number';
  runtimeConfig = await loadRuntimeConfig();
  assert.equal(runtimeConfig.getServerPort(), 3003);
} finally {
  resetEnv();
}

console.log('runtime config tests passed');
