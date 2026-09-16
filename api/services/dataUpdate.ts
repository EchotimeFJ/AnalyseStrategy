import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getReportDir, getStrategyDir } from '../runtimeConfig.js';
import { activatePublishedIndex, diffReportChanges, ensureIndex, prepareIndexForPublication, withIndexSourceUpdate, type IndexState, type ReportChangeSet } from './reportIndex.js';
import { readSourceManifest } from './reportCache.js';
import { pullStrategyRepository } from './gitUpdater.js';
import { commitPublication, publicationFile, readPublication } from './publicationStore.js';
import { getAppVersion } from './version.js';

const exec = promisify(execFile);
const HOUR = 60 * 60 * 1000;
export type PublicationStatus = { publishedAt: string | null; checkedAt: string | null; state: 'ready' | 'pending' | 'delayed'; intervalSeconds: number; reportChanges?: ReportChangeSet; indexVersion?: string };

// One updater per long-lived server process. PM2 must run one fork instance;
// this is intentionally not started from the serverless request handler.
export function createDataUpdater(options: { statusFile?: string; now?: () => Date; intervalMs?: number } = {}) {
  const file = options.statusFile ?? publicationFile();
  const now = options.now ?? (() => new Date());
  const interval = options.intervalMs ?? HOUR;
  let running: Promise<PublicationStatus> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let delayed = false;
  let afterUpdate: (() => void) | undefined;

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
      reportChanges: previous?.reportChanges,
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
      // An hourly poll with an unchanged source must not rebuild the entire
      // review graph.  Code-version changes are handled by an explicit forced
      // reindex during deployment; the source/review fingerprint remains the
      // freshness gate for routine polling.
      let reuseSnapshot = Boolean(!force && baseline && previous && manifest.fingerprint === baseline.sourceFingerprint);
      let index = reuseSnapshot ? baseline! : await prepareIndexForPublication();
      const hash = createHash('sha256');
      for (const report of index.reports) hash.update(JSON.stringify([report.id, report.markdown]));
      if (index.reviewFingerprint) hash.update(index.reviewFingerprint);
      const fingerprint = hash.digest('hex');
      if (baseline && previous?.fingerprint === fingerprint && baseline.sourceFingerprint === manifest.fingerprint) {
        index = baseline; reuseSnapshot = true;
      }
      const reportChanges = diffReportChanges(baseline ?? emptyIndex(getReportDir()), index);
      const details = {
        publishedAt: previous?.fingerprint === fingerprint ? previous.publishedAt : now().toISOString(),
        checkedAt: now().toISOString(), revision, fingerprint, appRevision,
        reportChanges,
        reviewRevisions: [...new Map([...(previous?.reviewRevisions ?? []), ...index.reports.filter(r => index.reviewStates?.[r.id]).map(r => ({ reportId: r.id, sourceHash: createHash('sha256').update(r.markdown).digest('hex') }))].map(r => [`${r.reportId}:${r.sourceHash}`, r])).values()],
      };
      await commitPublication(file, index, details, previous, reuseSnapshot);
      activatePublishedIndex(index);
      delayed = false;
      // No fallible I/O after the commit point: a subsequent status read must
      // never roll back memory after the durable pointer has already advanced.
      return { publishedAt: details.publishedAt, checkedAt: details.checkedAt, state: 'ready' as const, reportChanges, indexVersion: index.version, intervalSeconds: HOUR / 1000 };
    }).catch((error) => {
      delayed = true;
      throw error;
    });
  }

  function update(): Promise<PublicationStatus> {
    if (running) return running;
    running = run(true, false).then(result => { notifyUpdate(); return result; }).finally(() => { running = undefined; });
    return running;
  }

  function notifyUpdate() { if (afterUpdate) setImmediate(() => { try { afterUpdate?.(); } catch { /* Worker reports its own failure. */ } }); }

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

  return { update, reindex: () => run(false, true).then(result => { notifyUpdate(); return result; }), status, start, stop, setAfterUpdate: (callback: () => void) => { afterUpdate = callback; } };
}

function emptyIndex(sourceDir: string): IndexState {
  return { sourceDir: path.resolve(sourceDir), reports: [], mentions: [], opinions: [], entities: new Map(), qualityIssues: [], errors: [] };
}

export const dataUpdater = createDataUpdater();
