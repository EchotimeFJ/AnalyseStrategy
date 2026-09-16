import assert from 'node:assert/strict';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import {
  applyReviewPatch,
  buildReviewCandidate,
  buildReviewChunks,
  buildReviewFieldGuards,
  hashReviewValue,
  reviewReportCandidate,
  validateReviewCandidate,
  validateReviewPatch,
  type ReviewChunkResult,
} from '../api/services/researchReview';
import type { AiProvider, ProviderCompletion } from '../api/services/aiProvider';
import type { ResolvedAiConfig } from '../api/services/aiConfig';
import type { ReviewPatch, ReviewRecord } from '../api/domain/review';

const markdown = `# 花旗

#储能 #A股

甲公司（600098，买入，目标价 8 元）
主要催化剂：订单增长。
主要风险：价格竞争加剧。

# 高盛

乙公司（222222 CH，维持中性评级，目标价 20 元）
`;
const report = buildReportFromMarkdown({ id: '2026-09-16', filePath: '/reports/2026-09-16.md', markdown });
const candidate = buildReviewCandidate(report, extractOpinions(report));

assert.equal(validateReviewCandidate(candidate).valid, true);
assert.equal(candidate.sourceHash.length, 64);
assert.equal(candidate.candidateHash.length, 64);
assert.deepEqual(new Set(candidate.records.map((record) => record.kind)), new Set(['article', 'mention', 'statement', 'signal', 'topic', 'evidence']));
assert.ok(candidate.evidence.every((item) => markdown.slice(item.startOffset, item.endOffset) === item.quote));
assert.ok(candidate.records.filter((record) => record.kind === 'statement').every((record) => record.payload.rating.evidenceIDs.length === 0 || record.payload.rating.evidenceIDs.every((id) => candidate.evidence.some((item) => item.evidenceId === id))));

const chunks = buildReviewChunks(report, candidate, 40);
assert.ok(chunks.length > 1, 'long input should split at source line boundaries');
assert.equal(chunks[0].text.includes('[1] # 花旗'), true);
assert.ok(chunks.every((chunk) => chunk.startLine <= chunk.endLine && chunk.text.includes(`[${chunk.startLine}]`)));

function keepOperations(records: ReviewRecord[] = candidate.records) {
  return records.filter((record) => record.kind !== 'evidence').map((record) => ({
    op: 'keep' as const,
    candidateId: record.id,
    reason: '原文与候选一致',
  }));
}

const validPatch: ReviewPatch = {
  baseRevisionId: candidate.reportRevisionId,
  baseCandidateHash: candidate.candidateHash,
  sourceHash: candidate.sourceHash,
  coverage: { ...candidate.coverage, ranges: candidate.coverage.ranges.map((range) => ({ ...range })), complete: true },
  operations: keepOperations(),
};
assert.equal(validateReviewPatch(validPatch, candidate).valid, true);
const extraPatchField = { ...validPatch, unexpected: true } as unknown as ReviewPatch;
assert.equal(validateReviewPatch(extraPatchField, candidate).valid, false, 'unknown patch fields must be rejected');
const applied = applyReviewPatch(candidate, validPatch);
assert.deepEqual(applied.records.map((record) => record.status), candidate.records.map(() => 'active'));
assert.notEqual(applied.records, candidate.records, 'patch application must not mutate candidate');

const statement = candidate.records.find((record): record is Extract<ReviewRecord, { kind: 'statement' }> => record.kind === 'statement');
assert.ok(statement);
const ratingGuard = buildReviewFieldGuards(statement).find((guard) => guard.path === 'payload.rating.value');
assert.ok(ratingGuard);
const rationaleGuard=buildReviewFieldGuards(statement).find(g=>g.path==='payload.rationale')!;
const rationaleEvidence=candidate.evidence.find(e=>e.quote.includes('订单增长'))!;
const changedPatch: ReviewPatch = {
  ...validPatch,
  operations: keepOperations().map((operation) => operation.candidateId === statement.id ? {
    op: 'modify' as const,
    candidateId: statement.id,
    reason: '补充原文评级',
    fieldChanges: [{
      path: rationaleGuard.path,
      expectedValueHash: rationaleGuard.expectedValueHash,
      value: {state:'stated',value:'订单增长',evidenceIDs:[rationaleEvidence.evidenceId]},
      evidenceIDs: [rationaleEvidence.evidenceId],
    }],
  } : operation),
};
assert.equal(validateReviewPatch(changedPatch, candidate).valid, true);
const changed = applyReviewPatch(candidate, changedPatch);
const changedStatement = changed.records.find((record) => record.id === statement.id);
assert.equal((changedStatement as Extract<ReviewRecord, { kind: 'statement' }>).payload.rationale.value, '订单增长');

const signal = candidate.records.find((record): record is Extract<ReviewRecord, { kind: 'signal' }> => record.kind === 'signal');
if (signal) {
  const signalGuard = buildReviewFieldGuards(signal).find((guard) => guard.path === 'payload.evidenceIDs');
  assert.ok(signalGuard);
  const signalPatch: ReviewPatch = { ...validPatch, operations: keepOperations().map(operation => operation.candidateId === signal.id ? {
    op: 'modify' as const, candidateId: signal.id, reason: '替换为更具体的原文证据',
    fieldChanges: [{ path: 'payload.evidenceIDs', expectedValueHash: signalGuard!.expectedValueHash, value: signal.payload.evidenceIDs, evidenceIDs: signal.payload.evidenceIDs }],
  } : operation) };
  assert.equal(validateReviewPatch(signalPatch, candidate).valid, true, 'signal evidence references may be corrected while the record evidence inventory stays immutable');
}

const wrongRating: ReviewPatch = { ...validPatch, operations: keepOperations().map(op => op.candidateId === statement.id ? { op:'modify', candidateId:statement.id, reason:'不合法的映射', fieldChanges:[{path:ratingGuard!.path,expectedValueHash:ratingGuard!.expectedValueHash,value:{...statement.payload.rating.value!,normalizedLabel:'sell'},evidenceIDs:statement.payload.rating.evidenceIDs}] } : op) };
assert.equal(validateReviewPatch(wrongRating,candidate).valid,false,'a literal Buy must not be normalized to Sell');

const badHash = { ...changedPatch, operations: changedPatch.operations.map((operation) => operation.candidateId === statement.id ? {
  ...operation,
  fieldChanges: operation.fieldChanges?.map((field) => ({ ...field, expectedValueHash: hashReviewValue('stale') })),
} : operation) };
assert.equal(validateReviewPatch(badHash, candidate).valid, false);

const forbiddenIdentity = { ...changedPatch, operations: changedPatch.operations.map((operation) => operation.candidateId === statement.id ? {
  ...operation,
  fieldChanges: [{ path: 'payload.subject', expectedValueHash: hashReviewValue(statement.payload.subject), value: { ...statement.payload.subject, resolvedSecurityKey: 'code:forged' }, evidenceIDs: statement.evidenceIDs }],
} : operation) };
assert.equal(validateReviewPatch(forbiddenIdentity, candidate).valid, false);

const prototypePollution = { ...changedPatch, operations: changedPatch.operations.map((operation) => operation.candidateId === statement.id ? {
  ...operation,
  fieldChanges: [{ path: 'payload.__proto__.polluted', expectedValueHash: hashReviewValue(undefined), value: true }],
} : operation) };
assert.equal(validateReviewPatch(prototypePollution, candidate).valid, false);
assert.equal(({} as { polluted?: boolean }).polluted, undefined);

const invalidRating = { ...changedPatch, operations: changedPatch.operations.map((operation) => operation.candidateId === statement.id ? {
  ...operation,
  fieldChanges: [{ path: 'payload.rating.value', expectedValueHash: ratingGuard!.expectedValueHash, value: { normalizedLabel: 'forged' }, evidenceIDs: statement.payload.rating.evidenceIDs }],
} : operation) };
assert.equal(validateReviewPatch(invalidRating, candidate).valid, false);

const deleted = { ...validPatch, operations: validPatch.operations.map((operation) => operation.candidateId === statement.id ? { op: 'delete' as const, candidateId: statement.id, reason: '明确误报', evidenceIDs: statement.evidenceIDs } : candidate.records.find((record) => record.id === operation.candidateId && record.kind === 'signal' && record.payload.relatedStatementRefs.includes(statement.id)) ? { op: 'delete' as const, candidateId: operation.candidateId, reason: '关联观点已删除', evidenceIDs: candidate.records.find((record) => record.id === operation.candidateId)!.evidenceIDs } : operation) };
assert.equal(validateReviewPatch(deleted, candidate).valid, true);
assert.equal(applyReviewPatch(candidate, deleted).records.find((record) => record.id === statement.id)?.status, 'deleted');
const deleteWithoutEvidence = { ...deleted, operations: deleted.operations.map((operation) => operation.candidateId === statement.id ? { ...operation, evidenceIDs: [] } : operation) };
assert.equal(validateReviewPatch(deleteWithoutEvidence, candidate).valid, false);

const issuePatch: ReviewPatch = {
  ...validPatch,
  issues: [{ issueId: 'issue-model', recordRef: statement.id, fieldPath: null, category: 'identity_conflict', severity: 'error', status: 'open', description: '主体存在冲突', evidenceIDs: statement.evidenceIDs }],
};
assert.equal(validateReviewPatch(issuePatch, candidate).valid, false, 'model reported errors must block patch application');

const sourceCorrupt = structuredClone(candidate);
sourceCorrupt.evidence[0].quote = `${sourceCorrupt.evidence[0].quote}被篡改`;
assert.equal(validateReviewCandidate(sourceCorrupt).valid, false, 'evidence quote must stay an exact source slice');
const extraField = structuredClone(candidate);
const signalRecord = extraField.records.find((record) => record.kind === 'signal');
if (signalRecord?.kind === 'signal') (signalRecord.payload as unknown as Record<string, unknown>).note = null;
assert.equal(validateReviewCandidate(extraField).valid, false, 'unknown payload fields must be rejected');

const orphanMention = { ...validPatch, operations: validPatch.operations.map((operation) => operation.candidateId === statement.id ? operation : operation.candidateId === (candidate.records.find((record) => record.kind === 'mention' && record.articleRef === statement.articleRef)?.id ?? '') ? { op: 'delete' as const, candidateId: operation.candidateId, reason: '误报主体', evidenceIDs: candidate.records.find((record) => record.id === operation.candidateId)!.evidenceIDs } : operation) };
assert.equal(validateReviewPatch(orphanMention, candidate).valid, false, 'active statements cannot point to deleted mentions');

const config: ResolvedAiConfig = {
  providerId: 'deepseek', providerName: 'DeepSeek', baseUrl: 'https://example.invalid', model: 'deepseek-test', apiKey: 'test', timeoutMs: 10_000,
  dailyTokenBudget: 100_000, maxConcurrency: 1, reviewTimeoutMs: 10_000, reviewMaxTokens: 800, reviewThinking: 'disabled',
};
let completeCalls = 0;
const completionProvider: AiProvider = {
  async test() {},
  async *stream() { yield ''; },
  async complete(input): Promise<ProviderCompletion> {
    completeCalls += 1;
    const context = JSON.parse(input.messages.at(-1)?.content.split('\n', 1)[0] ?? '{}') as { candidateRecordIDs?: string[]; range?: { startLine: number; endLine: number } };
    const patch: ReviewPatch = {
      baseRevisionId: candidate.reportRevisionId,
      baseCandidateHash: candidate.candidateHash,
      sourceHash: candidate.sourceHash,
      coverage: { ranges: context.range ? [context.range] : candidate.coverage.ranges, complete: false },
      operations: (context.candidateRecordIDs ?? []).map((candidateId) => ({ op: 'keep' as const, candidateId, reason: '原文与候选一致' })),
    };
    return { content: JSON.stringify(patch), finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, id: 'review-1', model: 'deepseek-test' };
  },
};
const reviewed = await reviewReportCandidate(report, candidate, config, { provider: completionProvider, chunkMaxChars: 100_000, reserve: async () => ({ id: 'r', day: '2026-09-16' }) });
assert.equal(reviewed.complete, true);
assert.equal(reviewed.readiness, 'ready');
assert.equal(reviewed.validationState, 'valid');
const reviewChunks = buildReviewChunks(report, candidate, 100_000);
assert.equal(reviewed.usage.provider?.totalTokens, reviewChunks.length * 30);
assert.equal(completeCalls, reviewChunks.length);

const cache = new Map<string, ReviewChunkResult>();
const cached = await reviewReportCandidate(report, candidate, config, {
  provider: completionProvider,
  chunkMaxChars: 100_000,
  loadChunk: async (key) => cache.get(key),
  saveChunk: async (key, value) => { cache.set(key, value); },
  reserve: async () => ({ id: 'r2', day: '2026-09-16' }),
});
assert.equal(cached.complete, true);
const callsAfterFirst = completeCalls;
const cachedAgain = await reviewReportCandidate(report, candidate, config, {
  provider: completionProvider,
  chunkMaxChars: 100_000,
  loadChunk: async (key) => cache.get(key),
  reserve: async () => ({ id: 'r3', day: '2026-09-16' }),
});
assert.equal(cachedAgain.complete, true);
assert.equal(completeCalls, callsAfterFirst, 'successful chunk checkpoint should prevent a paid retry');

const truncatedProvider: AiProvider = {
  async test() {},
  async *stream() { yield ''; },
  async complete() { return { content: JSON.stringify(validPatch), finishReason: 'length', usage: null }; },
};
const truncated = await reviewReportCandidate(report, candidate, config, { provider: truncatedProvider, chunkMaxChars: 100_000, reserve: async () => ({}) });
assert.equal(truncated.complete, false);
assert.equal(truncated.readiness, 'failed');
assert.ok(truncated.issues.some((issue) => issue.category === 'incomplete_output' || issue.category === 'provider_error'));

await assert.rejects(
  reviewReportCandidate(report, candidate, config, {
    provider: completionProvider,
    chunkMaxChars: 100_000,
    reserve: async () => { throw new Error('AI_DAILY_BUDGET:额度不足'); },
  }),
  /AI_DAILY_BUDGET/,
  'reservation failures must reach the queue so it can pause the job',
);

console.log('research review tests passed');
