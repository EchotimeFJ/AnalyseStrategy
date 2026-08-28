import { compactCommitLabel } from '@/lib/versionDisplay';

export function ReleaseStamp({ version, commit }: { version: string; commit: string }) {
  return (
    <div className="min-w-0">
      <div>AnalyseStrategy v{version}</div>
      <div
        className="mt-1 max-w-full truncate font-mono"
        title={commit}
        aria-label={`Git 提交 ${commit}`}
      >
        {compactCommitLabel(commit)}
      </div>
      <div className="mt-1">报告内容仅作研究参考</div>
    </div>
  );
}
