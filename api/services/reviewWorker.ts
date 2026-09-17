import { createHash } from 'node:crypto';
import type { ReportDocument } from './reportParser.js';
import { profileId, type ResolvedAiConfig } from './aiConfig.js';
import { aiResourceGroup } from './aiResources.js';
import { createAiUsage } from './aiUsage.js';
import { type ReviewJob, type ReviewPin, type createReviewStore } from './reviewStore.js';

export type ReviewProcessContext = {
  signal: AbortSignal;
  reserve: (tokens: number) => Promise<{ id: string; day: string }>;
  recordActual: (reservation: { id: string; day: string }, actual: number) => Promise<void>;
};
export function createReviewWorker<T>(options: {
  store: ReturnType<typeof createReviewStore>;
  resolve: () => Promise<ResolvedAiConfig | null>;
  resolveProfile: (id: string) => Promise<ResolvedAiConfig | null>;
  process: (report: ReportDocument, config: ResolvedAiConfig, context: ReviewProcessContext) => Promise<{ result: T; partial: boolean; errorCode?: string }>;
  publish: () => Promise<void>;
  /** Error/status transitions are exposed by the status endpoint directly. A
   * scheduler may defer full-index publication for these transitions. */
  publishOnError?: boolean;
  missingConfigCode?: string;
  /** Ignore legacy pins when a scheduler has a provider policy (for example,
   * automated review must always use DeepSeek). A new pin is written when the
   * job is claimed, so the request remains fixed after it starts. */
  ignorePinnedConfig?: boolean;
  usageFile?: string;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const usage = createAiUsage(options.usageFile, now);
  const resources = aiResourceGroup(options.usageFile);
  let active: Promise<void> | undefined;
  let stopped = false;
  let controller: AbortController | undefined;
  const safeCode = (error: unknown) => {
    const raw = error instanceof Error ? error.message : '';
    const status = raw.match(/^AI_PROVIDER_ERROR:(\d{3})/);
    if (status) return `AI_PROVIDER_${status[1]}`;
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'AI_TIMEOUT';
    const code = raw.split(':')[0];
    return /^(?:AI|REVIEW)_[A-Z_]+$/.test(code) ? code : 'REVIEW_FAILED';
  };
  async function recover() {
    await options.store.transaction(state => {
      let changed = false;
      for (const job of Object.values(state.jobs)) {
        if (job.status === 'running') {
          changed = true;
          // Interrupted requests may already have been billed. Reservation remains.
          job.status = 'retry_wait'; job.nextAttemptAt = now().toISOString(); job.errorCode = 'REVIEW_INTERRUPTED';
        } else if (job.status === 'budget_paused') {
          // Daily application-side budgeting is disabled. Requeue historical
          // pauses immediately; provider keys remain the spending boundary.
          changed = true;
          job.status = 'queued'; delete job.nextAttemptAt; delete job.errorCode;
        }
      }
      return changed;
    }).then(async changed => { if(changed && options.publishOnError !== false) await options.publish().catch(() => undefined); });
  }
  async function drain() {
    while (!stopped) {
      const state = await options.store.read();
      const candidates = Object.values(state.sources).filter(s => s.active).map(s => state.jobs[s.jobId])
        .filter(j => j && ['queued', 'retry_wait', 'budget_paused', 'config_paused'].includes(j.status) && (!j.nextAttemptAt || Date.parse(j.nextAttemptAt) <= now().getTime()))
        .sort((a, b) => (state.sources[b.reportId]?.date ?? '').localeCompare(state.sources[a.reportId]?.date ?? '') || a.createdAt.localeCompare(b.createdAt));
      const job = candidates[0];
      if (!job) return;
      let config: ResolvedAiConfig | null;
      try { config = options.ignorePinnedConfig ? await options.resolve() : job.pin ? await options.resolveProfile(job.pin.profileId) : await options.resolve(); }
      catch { config = null; }
      if (!config) {
        await update(job, j => { j.status = 'config_paused'; j.errorCode = options.missingConfigCode ?? 'AI_NOT_CONFIGURED'; j.nextAttemptAt = new Date(now().getTime() + 60_000).toISOString(); });
        if (options.publishOnError !== false) await options.publish().catch(() => undefined);
        return;
      }
      if (!options.ignorePinnedConfig && job.pin && profileId(config) !== job.pin.profileId) {
        await update(job, j => { j.status = 'config_paused'; j.errorCode = 'REVIEW_PROFILE_CHANGED'; j.nextAttemptAt = new Date(now().getTime() + 86_400_000).toISOString(); });
        if (options.publishOnError !== false) await options.publish().catch(() => undefined);
        return;
      }
      if (job.pin && !options.ignorePinnedConfig) config = { ...config, ...job.pin.settings };
      let release: () => void;
      try { release = resources.acquire('review', config.maxConcurrency); }
      catch { return; }
      controller = new AbortController();
      const pinnedConfig = config;
      try {
        const pin: ReviewPin = !options.ignorePinnedConfig && job.pin ? job.pin : {
          profileId: profileId(config), model: config.model,
          configRef: createHash('sha256').update(JSON.stringify([profileId(config), config.reviewTimeoutMs, config.reviewMaxTokens, config.reviewThinking])).digest('hex'),
          settings: { reviewTimeoutMs: config.reviewTimeoutMs, reviewMaxTokens: config.reviewMaxTokens, reviewThinking: config.reviewThinking },
        };
        const claimed = await update(job, j => {
          if (j.attempts >= 3) { j.status = 'failed'; j.errorCode = 'REVIEW_RETRY_EXHAUSTED'; return false; }
          j.attempts += 1; j.status = 'running'; j.pin = pin; delete j.errorCode; delete j.nextAttemptAt; return true;
        });
        if (!claimed) { if (options.publishOnError !== false) await options.publish().catch(() => undefined); continue; }
        job.pin = pin;
        const report = await options.store.loadReport(job);
        const context: ReviewProcessContext = {
          signal: controller.signal,
          reserve: async tokens => {
            controller!.signal.throwIfAborted();
            const live = await options.store.read();
            if (!live.sources[job.reportId]?.active || live.sources[job.reportId].jobId !== job.id) throw new Error('REVIEW_SUPERSEDED');
            const currentLimits = await options.resolve();
            if (!currentLimits) throw new Error('AI_NOT_CONFIGURED');
            const reservation = await usage.reserve(tokens, currentLimits.dailyTokenBudget, 'review');
            return reservation;
          },
          recordActual: usage.recordActual,
        };
        const reviewed = await options.process(report, pinnedConfig, context);
        const ref = await options.store.writeResult(job, reviewed.result);
        await update(job, j => { j.resultRef = ref; j.status = reviewed.partial ? 'partial' : 'succeeded'; if(reviewed.errorCode&&/^[A-Z_]+$/.test(reviewed.errorCode))j.errorCode=reviewed.errorCode; });
        // Publication failure never discards successful (paid) review data.
        // The next scheduler tick can republish it without another provider call.
        await options.publish();
      } catch (error) {
        const code = safeCode(error);
        await update(job, j => {
          if (j.status === 'succeeded' || j.status === 'partial') { j.errorCode = 'REVIEW_PUBLICATION_FAILED'; return; }
          j.errorCode = code;
          if (code === 'REVIEW_SUPERSEDED') { j.status = 'superseded'; }
          else if (code === 'AI_DAILY_BUDGET') {
            j.attempts = Math.max(0, j.attempts - 1);
            j.status = 'retry_wait';
            j.nextAttemptAt = new Date(now().getTime() + 60_000).toISOString();
          } else if (['AI_PROVIDER_401', 'AI_PROVIDER_403', 'AI_PROVIDER_400', 'AI_PROVIDER_404', 'AI_PROVIDER_422', 'AI_NOT_CONFIGURED'].includes(code)) {
            j.status = 'config_paused'; j.nextAttemptAt = new Date(now().getTime() + 86_400_000).toISOString();
          } else if (/^REVIEW_(?:PATCH|EVIDENCE|VALIDATION|INVALID|COVERAGE|REFERENCE)/.test(code)) {
            j.status = 'failed';
          } else if (j.attempts < 3 && !stopped) {
            j.status = 'retry_wait'; j.nextAttemptAt = new Date(now().getTime() + 60_000 * Math.max(1, j.attempts)).toISOString();
          } else j.status = stopped ? 'retry_wait' : 'failed';
        });
        if (options.publishOnError !== false) await options.publish().catch(() => undefined);
        if (code === 'AI_DAILY_BUDGET') return;
      } finally { release(); controller = undefined; }
    }
  }
  async function update(job: ReviewJob, action: (job: ReviewJob) => unknown) {
    return options.store.transaction(state => {
      const current = state.jobs[job.id];
      const source = state.sources[job.reportId];
      if (!current || !source?.active || source.jobId !== job.id || source.sourceHash !== job.sourceHash) {
        if (current && !['succeeded', 'partial'].includes(current.status)) current.status = source?.active ? 'superseded' : 'withdrawn';
        return false;
      }
      const result = action(current); current.updatedAt = now().toISOString(); return result === false ? false : true;
    });
  }
  function wake() {
    if (stopped || active) return active ?? Promise.resolve();
    active = drain().finally(() => { active = undefined; });
    return active;
  }
  async function stop() { stopped = true; controller?.abort(); await active?.catch(() => undefined); }
  return { recover, wake, stop };
}
