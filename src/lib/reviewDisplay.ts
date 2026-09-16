import type { ReportReviewStatus, ReportReviewStatusName } from '@/types';

const REVIEW_STATUS_LABELS: Record<ReportReviewStatusName, string> = {
  queued: '排队中',
  running: '处理中',
  retry_wait: '等待重试',
  budget_paused: '额度暂停',
  config_paused: '配置暂停',
  succeeded: 'AI 复核完成',
  partial: '部分完成，待核对',
  failed: '复核失败',
  pending: '待整理',
  legacy_unreviewed: '旧版结果，待复核',
};

export function normalizeReportReview(review?: ReportReviewStatus): ReportReviewStatus {
  return review ?? { status: 'legacy_unreviewed' };
}

export function hasUnpublishedReview(review?: ReportReviewStatus) {
  return Boolean(review?.sourceHash && review.publishedSourceHash && review.sourceHash !== review.publishedSourceHash);
}

export function reviewStatusLabel(status: ReportReviewStatusName) {
  return REVIEW_STATUS_LABELS[status] ?? '待核对';
}

export function reviewStatusTone(status: ReportReviewStatusName): 'slate' | 'blue' | 'amber' | 'green' | 'red' {
  if (status === 'succeeded') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'partial' || status === 'budget_paused' || status === 'config_paused') return 'amber';
  if (status === 'queued' || status === 'running' || status === 'retry_wait' || status === 'pending') return 'blue';
  return 'slate';
}

export function safeReviewLabel(value?: string) {
  const label = value?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '';
  if (!label || /(?:api[_ -]?key|password|secret|token)(?:\s*[:=]|\s+)\S+|(?:sk|rk|key)-[a-z\d_-]{8,}|[a-z][a-z\d+.-]*:\/\/|(?:^|\s)\/(?:[^/\s]+\/)+[^/\s]*|[A-Za-z]:\\/i.test(label)) return '';
  return label;
}
