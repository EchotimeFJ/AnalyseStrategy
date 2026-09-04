import type { IndexStatus } from '@/types';
import { formatDateTime } from '@/lib/format';

export function ReportCacheStatus({ cache }: { cache?: IndexStatus['cache'] }) {
  if (!cache) return null;
  const title = cache.persisted
    ? cache.origin === 'disk' ? '已从服务器缓存恢复' : '服务器缓存已保存'
    : '当前使用内存索引';
  return (
    <div className={`mt-4 rounded-2xl border p-4 text-sm ${cache.warning ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      <div className="font-semibold">{title}</div>
      {cache.savedAt ? <div className="mt-1">保存时间：{formatDateTime(cache.savedAt)}</div> : null}
      {cache.warning ? <p className="mt-2" role="status">{cache.warning}</p> : null}
    </div>
  );
}
