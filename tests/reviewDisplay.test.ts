import assert from 'node:assert/strict';
import { hasUnpublishedReview, normalizeReportReview, reviewStatusLabel, reviewStatusTone, safeReviewLabel } from '../src/lib/reviewDisplay';

assert.equal(normalizeReportReview().status, 'legacy_unreviewed');
assert.equal(reviewStatusLabel('queued'), '排队中');
assert.equal(reviewStatusLabel('running'), '处理中');
assert.equal(reviewStatusLabel('succeeded'), 'AI 复核完成');
assert.equal(reviewStatusLabel('partial'), '部分完成，待核对');
assert.equal(reviewStatusLabel('failed'), '复核失败');
assert.equal(reviewStatusTone('running'), 'blue');
assert.equal(reviewStatusTone('partial'), 'amber');
assert.equal(reviewStatusTone('failed'), 'red');
assert.equal(reviewStatusTone('legacy_unreviewed'), 'slate');
assert.equal(hasUnpublishedReview({ status: 'running', sourceHash: 'new', publishedSourceHash: 'old' }), true);
assert.equal(hasUnpublishedReview({ status: 'succeeded', sourceHash: 'same', publishedSourceHash: 'same' }), false);
assert.equal(safeReviewLabel('模型响应超时'), '模型响应超时');
assert.equal(safeReviewLabel('/opt/app/config.json'), '');
assert.equal(safeReviewLabel('apiKey=sk-secret-value'), '');

console.log('review display logic tests passed');
