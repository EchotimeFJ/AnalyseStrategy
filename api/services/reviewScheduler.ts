import path from 'node:path';
import { createIdentityStore } from './researchIdentity.js';
import { aiConfigStore, profileId } from './aiConfig.js';
import { buildReviewCandidate, reviewReportCandidate, REVIEW_PROMPT_VERSION, type ReviewCheckpoint } from './researchReview.js';
import { projectReviewedReport, isPublishableReview } from './reviewProjection.js';
import { extractOpinions } from './opinionExtractor.js';
import { createReviewWorker } from './reviewWorker.js';
import { reviewEnabled, reviewStore, setReviewWorkerRunning } from './reviewRuntime.js';
import { registerReviewWake } from '../routes/review.js';
import { contentHash, REVIEW_PIPELINE_VERSION } from './reviewStore.js';
import type { ReviewedReport, MentionRecord } from '../domain/review.js';

// Automated publication is intentionally pinned to DeepSeek. The active
// website profile remains available for chat and manual connection tests.
export const AUTOMATED_REVIEW_PROVIDER = 'deepseek' as const;
const REVIEW_PUBLICATION_DEBOUNCE_MS = 15_000;

export async function startReviewScheduler(publish: () => Promise<void>) {
  if (!reviewEnabled()) return { wake: () => {}, stop: async () => {} };
  const store = reviewStore();
  let publicationPending = false;
  let publicationTimer: NodeJS.Timeout | undefined;
  let publicationRunning: Promise<void> | undefined;
  const flushPublication = async () => {
    if (publicationRunning || !publicationPending) return;
    publicationPending = false;
    publicationRunning = publish().catch(error => {
      console.error('[research-review] publication refresh failed; retaining the last published facts', error);
    });
    await publicationRunning;
    publicationRunning = undefined;
    if (publicationPending) schedulePublication();
  };
  const schedulePublication = () => {
    if (publicationTimer || publicationRunning) return;
    publicationTimer = setTimeout(() => {
      publicationTimer = undefined;
      void flushPublication();
    }, REVIEW_PUBLICATION_DEBOUNCE_MS);
    publicationTimer.unref();
  };
  // A review result changes one report, but rebuilding the complete index for
  // every chunk blocks the API while large reports are being processed. Queue
  // one publication refresh and coalesce the results produced in this window.
  const requestPublication = () => {
    publicationPending = true;
    schedulePublication();
    return Promise.resolve();
  };
  const worker = createReviewWorker<ReviewedReport>({
    store,
    resolve: () => aiConfigStore.resolveProvider(AUTOMATED_REVIEW_PROVIDER),
    resolveProfile: aiConfigStore.resolveProfile,
    missingConfigCode: 'AI_DEEPSEEK_NOT_CONFIGURED',
    publish: requestPublication,
    publishOnError: false,
    ignorePinnedConfig: true,
    process: async (report, config, context) => {
      const candidate = buildReviewCandidate(report, extractOpinions(report));
      const namespace = contentHash(JSON.stringify([REVIEW_PIPELINE_VERSION, REVIEW_PROMPT_VERSION, profileId(config), config.reviewThinking, config.reviewMaxTokens]));
      const result = await reviewReportCandidate(report, candidate, config, {
        signal: context.signal,
        reserve: context.reserve,
        recordActual: async (reservation, actual) => {
          if (actual !== undefined && reservation && typeof reservation === 'object' && 'id' in reservation && 'day' in reservation) {
            await context.recordActual(reservation as {id:string;day:string},actual);
          }
        },
        loadChunk: key => store.loadChunk<ReviewCheckpoint>(`${namespace}:${key}`),
        saveChunk: (key, value) => store.saveChunk(`${namespace}:${key}`, value),
      });
      // Successful chunks have already been checkpointed. Keep a failed result
      // for diagnosis, but let the worker classify retryable provider failures.
      if (!result.complete) {
        await store.saveChunk(`audit:${namespace}:${candidate.candidateHash}:latest`, result);
        const error = result.attempts.find(a => a.status !== 'succeeded')?.error;
        if (error && /^(?:AI_PROVIDER_ERROR|AI_DAILY_BUDGET|AI_INCOMPLETE_COMPLETION|AI_TIMEOUT|AI_NOT_CONFIGURED|REVIEW_SUPERSEDED)/.test(error)) throw new Error(error);
      }
      if (isPublishableReview(result)) {
        try { projectReviewedReport(report,result); } catch(error) { await store.saveChunk(`audit:${namespace}:${candidate.candidateHash}:latest`,result); throw error; }
      }
      if (isPublishableReview(result)) {
        const identities = await createIdentityStore(path.join(store.directory, 'identities')).resolveMentions(result.records.filter((r): r is MentionRecord => r.kind === 'mention' && (!r.status || r.status === 'active')).map(r => ({ ...r, reportId: report.id, date: report.date })));
        for (const identity of identities.mappingByIndex) if (identity.status === 'conflict') {
          result.issues.push({issueId:`identity:${identity.mentionKey}`,recordRef:identity.mentionId??null,fieldPath:'resolution',category:'identity_conflict',severity:'error',status:'open',description:'原文名称与证券身份存在冲突，需要核对',evidenceIDs:[]});
          result.readiness='partial'; result.validationState='needs_review';
        }
      }
      const partial = result.readiness !== 'ready' || result.validationState !== 'valid';
      const reason = result.attempts.find(a=>a.status!=='succeeded')?.error?.split(':')[0];
      return { result, partial, errorCode: partial ? (reason && /^[A-Z_]+$/.test(reason) ? reason : 'REVIEW_NEEDS_CONFIRMATION') : undefined };
    },
  });
  await worker.recover();
  const wake = () => { void worker.wake().catch(() => console.error('[research-review] task failed; preserving published results')); };
  registerReviewWake(wake);
  setReviewWorkerRunning(true);
  // Hourly source discovery is separate from short retry/queue ticks. No source
  // download or whole-corpus model rerun is scheduled by this timer.
  const timer=setInterval(wake,30_000);timer.unref();wake();
  return { wake, stop: async()=>{setReviewWorkerRunning(false);clearInterval(timer);await worker.stop();if(publicationTimer)clearTimeout(publicationTimer);publicationTimer=undefined;await flushPublication();} };
}
