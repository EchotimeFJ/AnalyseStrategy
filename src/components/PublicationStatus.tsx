import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { formatDateTime } from '@/lib/format';
import { safeReviewLabel } from '@/lib/reviewDisplay';
import type { ReviewRetryInput, ReviewStatus as ReviewStatusData } from '@/types';

type Publication = { publishedAt: string | null; state: 'ready' | 'pending' | 'delayed'; reportChanges?: { added: unknown[]; modified: unknown[]; removed: unknown[] } };

export function PublicationStatus() {
  const { data, error, setData } = useAsyncData(() => apiGet<Publication>('/api/publication'), []);
  const refresh = useCallback(async () => {
    try { setData(await apiGet<Publication>('/api/publication')); } catch { /* keep the last confirmed status */ }
  }, [setData]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return (
    <span>
      {data?.publishedAt ? `数据最近发布于 ${formatDateTime(data.publishedAt)}` : '数据发布时间暂未确认'}
      {data?.reportChanges && (data.reportChanges.added.length + data.reportChanges.modified.length + data.reportChanges.removed.length > 0) ? ` · 新增 ${data.reportChanges.added.length} / 修改 ${data.reportChanges.modified.length} / 删除 ${data.reportChanges.removed.length}` : null}
      {data?.state === 'delayed' || error ? ' · 自动更新暂有延迟' : null}
    </span>
  );
}

export type ReviewStatusProps = {
  adminToken?: string;
  onRequestAdmin?: () => void;
};

export function ReviewStatus({ adminToken, onRequestAdmin }: ReviewStatusProps) {
  const { data, error, loading, setData } = useAsyncData(() => apiGet<ReviewStatusData>('/api/review/status'), []);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const refresh = useCallback(async () => {
    setData(await apiGet<ReviewStatusData>('/api/review/status'));
  }, [setData]);

  useEffect(() => {
    if (!data?.enabled || data.queued + data.running < 1) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (document.visibilityState !== 'visible') return;
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
      }, 30_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh().catch(() => undefined);
        start();
      } else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', stop);
    window.addEventListener('focus', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', stop);
      window.removeEventListener('focus', onVisibilityChange);
    };
  }, [data?.enabled, data?.queued, data?.running, refresh]);

  async function retry() {
    if (retrying) return;
    if (!adminToken) {
      onRequestAdmin?.();
      return;
    }
    setRetrying(true);
    setRetryError('');
    try {
      const input: ReviewRetryInput = {};
      await apiPost('/api/review/retry', input, undefined, { 'X-Admin-Token': adminToken });
      await refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setRetryError(/管理员|admin|forbidden|unauthor/i.test(message) ? '请先完成管理员验证，再重试整理任务。' : '重试整理任务失败，请稍后再试。');
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500" role="status">正在读取自动整理状态…</div>;
  }
  if (error || !data) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500" role="status">自动整理状态暂不可用</div>;
  }

  const review = data;
  const total = count(review.total);
  const queued = count(review.queued);
  const running = count(review.running);
  const succeeded = count(review.succeeded);
  const partial = count(review.partial);
  const failed = count(review.failed);
  const paused = count(review.paused);
  const legacy = count(review.legacy);
  const retryable = failed + partial + paused;
  const currentModel = safeReviewLabel(review.model);
  const lastError = safeReviewLabel(review.lastError);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600" aria-label="自动整理状态">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-semibold text-slate-800">自动整理</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${review.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{review.enabled ? '已启用' : '未启用'}</span>
          {total ? <span>共 {total} 篇</span> : <span>暂无任务</span>}
          {succeeded ? <span className="text-emerald-700">已完成 {succeeded}</span> : null}
          {queued ? <span className="text-blue-700">排队中 {queued}</span> : null}
          {running ? <span className="text-blue-700">运行中 {running}</span> : null}
          {partial ? <span className="text-amber-700">部分完成 {partial}</span> : null}
          {failed ? <span className="text-rose-700">失败 {failed}</span> : null}
          {paused ? <span className="text-amber-700">已暂停 {paused}</span> : null}
          {legacy ? <span>待整理 {legacy}</span> : null}
        </div>
        {review.enabled && retryable ? (
          <button type="button" onClick={() => void retry()} disabled={retrying} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? '重试中…' : adminToken ? '重试失败任务' : '管理员验证后重试'}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>自动复核模型：{currentModel || (review.automatedProvider === 'deepseek' ? 'DeepSeek（固定）' : '未配置')}</span>
        {lastError && retryable ? <span className="text-rose-600">最近失败：{lastError}</span> : null}
        {retryError ? <span role="alert" className="text-rose-600">{retryError}</span> : null}
        {!retryError && failed ? <span role="status" className="text-rose-600">有整理失败任务，请管理员重试。</span> : null}
      </div>
    </div>
  );
}

function count(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
