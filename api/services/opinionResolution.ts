import type { OpinionRecord } from '../domain/research.js';

export function resolveOpinions(opinions: OpinionRecord[]): OpinionRecord[] {
  const groups = new Map<string, OpinionRecord[]>();
  for (const opinion of opinions) {
    const key = `${opinion.reportId}|${opinion.institution}|${opinion.security.key}`;
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
