import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { AppVersion, TodayOverview } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { PublicationStatus } from '@/components/PublicationStatus';
import { formatDateTime } from '@/lib/format';

export default function IndexPage() {
  const overview = useAsyncData(() => apiGet<TodayOverview>('/api/overview'), []);
  const version = useAsyncData(() => apiGet<AppVersion>('/api/version'), []);
  return (
    <Layout>
      <PageHeader eyebrow="Data & Release" title="数据与版本" description="报告每小时自动检查更新，这里显示最近成功发布的时间。" />
      {overview.loading ? <LoadingBlock label="正在读取数据状态…" /> : null}
      {overview.error ? <ErrorBlock message={overview.error} /> : null}
      <div className="space-y-6">
        {overview.data ? <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="报告数量" value={overview.data.reportCount} />
          <StatCard label="最新报告" value={overview.data.latestDate ?? '暂无'} />
        </div> : null}
        <Panel title="报告数据" eyebrow="Reports">
          <div className="text-sm leading-7 text-slate-600"><PublicationStatus /></div>
        </Panel>
        <Panel title="网站版本" eyebrow="Release">
          <div className="text-sm leading-7 text-slate-600">
            <p>当前版本 v{version.data?.version ?? __APP_VERSION__}</p>
            <p>网站发布于 {formatDateTime(version.data?.buildTime ?? __BUILD_TIME__)}</p>
          </div>
        </Panel>
      </div>
    </Layout>
  );
}
