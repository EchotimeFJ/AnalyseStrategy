import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getReportDir, getStrategyDir } from '../runtimeConfig.js';
import { activatePublishedIndex, ensureIndex, prepareIndexForPublication, withIndexSourceUpdate } from './reportIndex.js';
import { readSourceManifest } from './reportCache.js';
import { pullStrategyRepository } from './gitUpdater.js';
import { commitPublication, publicationFile, readPublication } from './publicationStore.js';
import { getAppVersion } from './version.js';

const exec = promisify(execFile);
const HOUR = 60 * 60 * 1000;
export type PublicationStatus = { publishedAt: string | null; checkedAt: string | null; state: 'ready' | 'pending' | 'delayed'; intervalSeconds: number };

// One updater per long-lived server process. PM2 must run one fork instance;
// this is intentionally not started from the serverless request handler.
export function createDataUpdater(options: { statusFile?: string; now?: () => Date; intervalMs?: number } = {}) {
  const file = options.statusFile ?? publicationFile();
  const now = options.now ?? (() => new Date());
  const interval = options.intervalMs ?? HOUR;
  let running: Promise<PublicationStatus> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let delayed = false;

  async function currentPublication() {
    const record = await readPublication(file);
    return record?.sourceDir === path.resolve(getReportDir()) ? record : null;
  }

  async function status(): Promise<PublicationStatus> {
    const previous = await currentPublication();
    const overdue = previous && now().getTime() - Date.parse(previous.checkedAt) > 2 * HOUR;
    return {
      publishedAt: previous?.publishedAt ?? null,
      checkedAt: previous?.checkedAt ?? null,
      state: delayed || overdue ? 'delayed' : previous ? 'ready' : 'pending',
      intervalSeconds: HOUR / 1000,
    };
  }

  function run(pullSource: boolean, force: boolean): Promise<PublicationStatus> {
    return withIndexSourceUpdate(async () => {
      const previous = await currentPublication();
      const baseline = await ensureIndex({ checkSource: false }).catch(() => null);
      if (pullSource) {
        const pull = await pullStrategyRepository();
        if (!pull.success) throw new Error('报告自动更新失败，请检查服务器 Git 拉取权限');
      }
      let revision: string | null = null;
      try {
        const { stdout } = await exec('git', ['-c', `safe.directory=${getStrategyDir()}`, 'rev-parse', 'HEAD'], { cwd: getStrategyDir(), timeout: 10_000 });
        revision = stdout.trim();
      } catch (error) { if (pullSource) throw error; }
      const manifest = await readSourceManifest(getReportDir());
      const app = getAppVersion();
      const appRevision = `${app.version}:${app.commit}`;
      const reuseSnapshot = Boolean(!force && baseline && previous && manifest.fingerprint === baseline.sourceFingerprint && previous.appRevision === appRevision);
      const index = reuseSnapshot ? baseline! : await prepareIndexForPublication();
      const hash = createHash('sha256');
      for (const report of index.reports) hash.update(JSON.stringify([report.id, report.markdown]));
      const fingerprint = hash.digest('hex');
      const details = {
        publishedAt: previous?.fingerprint === fingerprint ? previous.publishedAt : now().toISOString(),
        checkedAt: now().toISOString(), revision, fingerprint, appRevision,
      };
      await commitPublication(file, index, details, previous, reuseSnapshot);
      activatePublishedIndex(index);
      delayed = false;
      // No fallible I/O after the commit point: a subsequent status read must
      // never roll back memory after the durable pointer has already advanced.
      return { publishedAt: details.publishedAt, checkedAt: details.checkedAt, state: 'ready' as const, intervalSeconds: HOUR / 1000 };
    }).catch((error) => {
      delayed = true;
      throw error;
    });
  }

  function update(): Promise<PublicationStatus> {
    if (running) return running;
    running = run(true, false).finally(() => { running = undefined; });
    return running;
  }

  function start() {
    if (timer) return;
    const tick = () => { void update().catch(() => console.error('[report-update] failed; retaining the last publication')); };
    timer = setInterval(tick, interval);
    timer.unref();
    tick();
  }

  async function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    await running?.catch(() => undefined);
  }

  return { update, reindex: () => run(false, true), status, start, stop };
}

export const dataUpdater = createDataUpdater();
