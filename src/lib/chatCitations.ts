import { buildReportLink } from '@/lib/reportLinks';
import type { AiSource } from '@/types';

export function linkifyChatCitations(content: string, sources: AiSource[] = []) {
  return content.replace(/\[(\d+)\](?!\()/g, (match, rawIndex: string) => {
    const index = Number(rawIndex);
    const source = sources[index - 1];
    if (!source) return match;
    const href = buildReportLink({
      reportId: source.reportId,
      lineNumber: source.lineNumber,
      highlightTerms: [source.securityName ?? undefined],
    });
    return `[来源 ${index}](${href})`;
  });
}
