const DEFAULT_REPORT_DIR = '/opt/Strategy/港A美/机构日报';
const DEFAULT_STRATEGY_DIR = '/opt/Strategy';
const DEFAULT_SERVER_PORT = 3003;

type RuntimeEnv = NodeJS.ProcessEnv;

export function getReportDir(env: RuntimeEnv = process.env) {
  return firstNonEmpty(env.REPORT_DIR, env.REPORTS_DIR) ?? DEFAULT_REPORT_DIR;
}

export function getStrategyDir(env: RuntimeEnv = process.env) {
  return firstNonEmpty(env.STRATEGY_DIR) ?? DEFAULT_STRATEGY_DIR;
}

export function getServerPort(env: RuntimeEnv = process.env) {
  const value = firstNonEmpty(env.PORT);
  if (!value) {
    return DEFAULT_SERVER_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SERVER_PORT;
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
