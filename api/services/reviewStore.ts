import { REVIEW_JOB_STATES, type SharedReviewJobState } from '../../src/shared/researchVocabulary.js';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ReportDocument } from './reportParser.js';
import type { ResolvedAiConfig } from './aiConfig.js';
import { writeAtomicJson } from './atomicJson.js';

const rulesDigest = createHash('sha256');
for (const relative of ['./reportRecognition.ts', './opinionExtractor.ts', './reportParser.ts', './entityResolver.ts', './securityDictionary.ts', './securityAliases.ts', '../data/security-aliases.json', '../../src/lib/markdownTags.ts', './researchReview.ts', './reviewGrounding.ts', './reviewWorker.ts', './reviewScheduler.ts', './aiProvider.ts', './aiConfig.ts', '../data/securities.json', '../../src/shared/researchVocabulary.ts']) rulesDigest.update(readFileSync(new URL(relative, import.meta.url)));
export const REVIEW_PIPELINE_VERSION = `hybrid-1:${rulesDigest.digest('hex').slice(0, 20)}`;
export const contentHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type ReviewJobState = SharedReviewJobState;
export type ReviewPin = { profileId: string; model: string; configRef: string; settings: Pick<ResolvedAiConfig, 'reviewTimeoutMs' | 'reviewMaxTokens' | 'reviewThinking'> };
export type ReviewJob = {
  id: string; reportId: string; sourceHash: string; pipelineVersion: string;
  status: ReviewJobState; attempts: number; createdAt: string; updatedAt: string;
  nextAttemptAt?: string; errorCode?: string; pin?: ReviewPin; resultRef?: string;
};
export type ReviewSource = { reportId: string; sourceHash: string; filePath: string; date: string; active: boolean; jobId: string };
export type ReviewState = { version: 1; generation: number; sources: Record<string, ReviewSource>; jobs: Record<string, ReviewJob> };
export type StoredReviewResult<T = unknown> = { reportId: string; sourceHash: string; jobId: string; completedAt: string; model: string; result: T };
const locks = new Map<string, Promise<unknown>>();

export function createReviewStore(directory: string) {
  directory = path.resolve(directory);
  const stateFile = path.join(directory, 'state.json');
  async function read(): Promise<ReviewState> {
    try {
      const data = JSON.parse(await fs.readFile(stateFile, 'utf8')) as ReviewState;
      if (data.version !== 1 || !Number.isSafeInteger(data.generation) || !data.sources || !data.jobs) throw new Error('REVIEW_STORE_INVALID');
      const validStates = new Set(REVIEW_JOB_STATES);
      for (const [key, job] of Object.entries(data.jobs)) {
        if (typeof job.reportId !== 'string' || !job.reportId || typeof job.pipelineVersion !== 'string' || !job.pipelineVersion || job.resultRef !== undefined && !/^[a-f0-9]{64}$/.test(job.resultRef) || key !== job.id || !/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(job.sourceHash) || !validStates.has(job.status) || !Number.isSafeInteger(job.attempts) || job.attempts < 0 || !Number.isFinite(Date.parse(job.createdAt)) || !Number.isFinite(Date.parse(job.updatedAt)) || job.nextAttemptAt !== undefined && !Number.isFinite(Date.parse(job.nextAttemptAt))) throw new Error('REVIEW_STORE_INVALID');
      }
      for (const [id, source] of Object.entries(data.sources)) {
        if (['__proto__','constructor','prototype'].includes(id) || id !== source.reportId || !/^[a-f0-9]{64}$/.test(source.sourceHash) || typeof source.filePath !== 'string' || !source.filePath || typeof source.active !== 'boolean' || !data.jobs[source.jobId] || data.jobs[source.jobId].reportId !== id || data.jobs[source.jobId].sourceHash !== source.sourceHash) throw new Error('REVIEW_STORE_INVALID');
      }
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, generation: 0, sources: {}, jobs: {} };
      throw error;
    }
  }
  function transaction<T>(work: (state: ReviewState) => Promise<T> | T): Promise<T> {
    const previous = locks.get(directory);
    const job = (async () => {
      await previous?.catch(() => undefined);
      const state = await read();
      const value = await work(state);
      state.generation += 1;
      await writeAtomicJson(stateFile, state);
      return value;
    })();
    locks.set(directory, job);
    void job.finally(() => { if (locks.get(directory) === job) locks.delete(directory); }).catch(() => undefined);
    return job;
  }
  const objectPath = (kind: 'sources' | 'results' | 'chunks', id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('REVIEW_REFERENCE_INVALID');
    return path.join(directory, kind, `${id}.json`);
  };
  async function sync(reports: ReportDocument[]) {
    // Caller supplies a complete, successfully-read source snapshot. Failed pulls
    // or failed file reads must never call sync with a partial/empty list.
    return transaction(async state => {
      const seen = new Set<string>();
      const now = new Date().toISOString();
      const incomingPaths = new Set(reports.map(r => r.filePath));
      const hashCounts = new Map<string, number>();
      for (const r of reports) { const h = contentHash(r.markdown); hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1); }
      const output: Array<{ report: ReportDocument; source: ReviewSource }> = [];
      for (const original of reports) {
        const hash = contentHash(original.markdown);
        let id = original.id;
        const samePath = Object.values(state.sources).find(s => s.filePath === original.filePath);
        if (samePath) id = samePath.reportId;
        else {
          const moved = Object.values(state.sources).filter(s => s.sourceHash === hash && !incomingPaths.has(s.filePath) && !seen.has(s.reportId));
          if (moved.length === 1 && hashCounts.get(hash) === 1) id = moved[0].reportId;
        }
        if (['__proto__','constructor','prototype'].includes(id)) throw new Error('REVIEW_SOURCE_ID_INVALID');
        if (seen.has(id)) throw new Error('REVIEW_SOURCE_ID_CONFLICT');
        seen.add(id);
        const report = { ...original, id };
        const jobId = contentHash(JSON.stringify([id, hash, REVIEW_PIPELINE_VERSION]));
        const old = state.sources[id];
        const oldJob = old && state.jobs[old.jobId];
        if (oldJob && oldJob.id !== jobId && !['succeeded', 'partial', 'failed'].includes(oldJob.status)) oldJob.status = 'superseded';
        const source = { reportId: id, sourceHash: hash, filePath: report.filePath, date: report.date, active: true, jobId };
        // Store by report identity as well as hash: identical text in two reports
        // must not overwrite its report metadata or source references.
        const sourceRef = contentHash(JSON.stringify([id, hash]));
        const file = objectPath('sources', sourceRef);
        try { await fs.access(file); } catch { await writeAtomicJson(file, report); }
        if (!state.jobs[jobId]) state.jobs[jobId] = { id: jobId, reportId: id, sourceHash: hash, pipelineVersion: REVIEW_PIPELINE_VERSION, status: 'queued', attempts: 0, createdAt: now, updatedAt: now };
        if (state.jobs[jobId].status === 'withdrawn' || state.jobs[jobId].status === 'superseded') state.jobs[jobId].status = state.jobs[jobId].resultRef ? 'succeeded' : 'queued';
        state.sources[id] = source;
        output.push({ report, source });
      }
      for (const s of Object.values(state.sources)) if (!seen.has(s.reportId) && s.active) {
        s.active = false;
        const job = state.jobs[s.jobId];
        if (job && !['succeeded', 'partial'].includes(job.status)) job.status = 'withdrawn';
      }
      return output;
    });
  }
  async function loadReport(job: Pick<ReviewJob, 'reportId' | 'sourceHash'>): Promise<ReportDocument> {
    const value = JSON.parse(await fs.readFile(objectPath('sources', contentHash(JSON.stringify([job.reportId, job.sourceHash]))), 'utf8')) as ReportDocument;
    if (value.id !== job.reportId || contentHash(value.markdown) !== job.sourceHash) throw new Error('REVIEW_SOURCE_CORRUPT');
    return value;
  }
  async function writeResult<T>(job: ReviewJob, result: T) {
    const record: StoredReviewResult<T> = { reportId: job.reportId, sourceHash: job.sourceHash, jobId: job.id, completedAt: new Date().toISOString(), model: job.pin?.model ?? '', result };
    const ref = contentHash(JSON.stringify(record));
    await writeAtomicJson(objectPath('results', ref), record);
    return ref;
  }
  async function loadResult<T>(ref: string): Promise<StoredReviewResult<T>> {
    const raw = await fs.readFile(objectPath('results', ref), 'utf8');
    const record = JSON.parse(raw);
    if (contentHash(JSON.stringify(record)) !== ref) throw new Error('REVIEW_RESULT_CORRUPT');
    return record;
  }
  async function retry(reportId?: string) {
    return transaction(state => {
      let count = 0;
      for (const source of Object.values(state.sources)) {
        if (!source.active || reportId && source.reportId !== reportId) continue;
        const job = state.jobs[source.jobId];
        if (!job || !['failed', 'partial', 'budget_paused', 'config_paused'].includes(job.status)) continue;
        job.status = 'queued'; job.attempts = 0; delete job.pin; delete job.nextAttemptAt; delete job.errorCode;
        job.updatedAt = new Date().toISOString(); count++;
      }
      return count;
    });
  }
  async function loadChunk<T>(key: string): Promise<T | undefined> {
    try {
      const record = JSON.parse(await fs.readFile(objectPath('chunks', contentHash(key)), 'utf8'));
      if (record.key !== key || record.hash !== contentHash(JSON.stringify(record.value))) throw new Error('REVIEW_CHECKPOINT_CORRUPT');
      return record.value as T;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async function saveChunk<T>(key: string, value: T) {
    await writeAtomicJson(objectPath('chunks', contentHash(key)), { key, hash: contentHash(JSON.stringify(value)), value });
  }
  return { directory, read, transaction, sync, loadReport, writeResult, loadResult, retry, loadChunk, saveChunk };
}
