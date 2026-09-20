import { useCallback, useEffect } from 'react';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { formatDateTime } from '@/lib/format';

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
