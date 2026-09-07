import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { formatDateTime } from '@/lib/format';

type Publication = { publishedAt: string | null; state: 'ready' | 'pending' | 'delayed' };

export function PublicationStatus() {
  const { data, error } = useAsyncData(() => apiGet<Publication>('/api/publication'), []);
  return (
    <span>
      {data?.publishedAt ? `数据最近发布于 ${formatDateTime(data.publishedAt)}` : '数据发布时间暂未确认'}
      {data?.state === 'delayed' || error ? ' · 自动更新暂有延迟' : null}
    </span>
  );
}
