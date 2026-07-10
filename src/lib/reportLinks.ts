import type { SignalItem, TargetMention } from '../types';

type ReportLinkInput = {
  reportId: string;
  lineNumber?: number;
  highlightTerms?: Array<string | undefined>;
};

export function buildReportLink({ reportId, lineNumber, highlightTerms = [] }: ReportLinkInput) {
  const params = new URLSearchParams();
  params.set('id', reportId);

  if (lineNumber && Number.isFinite(lineNumber) && lineNumber > 0) {
    params.set('line', String(Math.floor(lineNumber)));
  }

  uniqueTerms(highlightTerms).forEach((term) => {
    params.append('highlight', term);
  });

  return `/reports?${params.toString()}`;
}

export function targetMentionHighlightTerms(
  item: Pick<TargetMention, 'targetName' | 'aliases' | 'code'>,
) {
  return uniqueTerms([item.targetName, item.code, ...item.aliases]);
}

export function signalHighlightTerms(item: Pick<SignalItem, 'targetName' | 'title'>) {
  return uniqueTerms([item.targetName, item.title]);
}

export function searchHitHighlightTerms({ matchedText, query }: { matchedText: string; query?: string }) {
  return uniqueTerms([matchedText, query]);
}

function uniqueTerms(terms: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  terms.forEach((term) => {
    const value = term?.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    result.push(value);
  });

  return result;
}
