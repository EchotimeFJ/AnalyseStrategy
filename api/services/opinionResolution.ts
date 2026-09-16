import type { OpinionRecord } from '../domain/research.js';

export function resolveOpinions(opinions: OpinionRecord[]): OpinionRecord[] {
  const groups = new Map<string, OpinionRecord[]>();
  for (const opinion of opinions) {
    const key = `${opinion.reportId}|${opinion.institution}|${opinion.security.key}|${statementScope(opinion)}`;
    groups.set(key, [...(groups.get(key) ?? []), opinion]);
  }
  return [...groups.values()].map((records) => {
    const first = records[0];
    const ratings = [...new Set(records.flatMap((opinion) => opinion.ratingAlternatives?.length ? opinion.ratingAlternatives : opinion.rating ? [opinion.rating] : []))];
    const conflict = ratings.length > 1;
    const buyRecommendation = records.some((record) => record.buyRecommendation);
    const rank = (method: string) => method === 'buy-recommendation-statement' && buyRecommendation && ratings[0] !== '买入' ? -1 : method === 'rating-statement' ? 0 : method === 'target-price-statement' ? 1 : 2;
    const evidence = [...new Map(records.flatMap((record) => record.evidence).map((source) => [`${source.method}:${source.lineNumber}:${source.startColumn ?? ''}:${source.excerpt}`, source])).values()]
      .sort((a, b) => rank(a.method) - rank(b.method));
    return {
      ...first,
      rating: conflict ? null : ratings[0] ?? null,
      rawRating: conflict ? null : records.find((record) => record.rating)?.rawRating ?? null,
      ratingAlternatives: conflict ? ratings : undefined,
      buyRecommendation,
      action: conflict ? null : records.find((record) => record.action)?.action ?? null,
      targetPrice: records.find((record) => record.targetPrice)?.targetPrice ?? null,
      currentPrice: records.find((record) => record.currentPrice)?.currentPrice ?? null,
      types: [...new Set(records.flatMap((record) => record.types))].filter((type) => !conflict || type !== 'positive'),
      evidence,
      security: { ...first.security, aliases: [...new Set(records.flatMap((record) => record.security.aliases))] },
    };
  });
}

function statementScope(opinion: OpinionRecord) {
  // The same report/institution/security can occur in several article blocks.
  // Keep their fields separate unless the evidence points to the same local
  // security heading/segment. A line anchor is intentionally retained even
  // when the excerpt is absent so source evidence remains the deciding scope.
  const anchor = opinion.evidence.find((source) => source.method === 'security-code-segment' || source.method === 'security-heading-segment');
  if (anchor) return `${anchor.method}:${anchor.lineNumber}:${fingerprint(anchor.excerpt)}`;
  const statementLines = opinion.evidence
    .filter((source) => /(?:rating|target-price|current-price|buy-recommendation)-statement$/.test(source.method))
    .map((source) => source.lineNumber)
    .sort((left, right) => left - right);
  if (statementLines.length) return `statement:${statementLines.join(',')}`;
  // Without a source anchor, merging would invent a relationship that the
  // input cannot prove. The record id is stable for the current extraction.
  return `record:${opinion.id}`;
}

function fingerprint(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 240);
}
