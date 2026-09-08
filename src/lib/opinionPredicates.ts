export function isBuyOpinion(opinion: { rating: string | null; ratingAlternatives?: string[]; buyRecommendation?: boolean }) {
  return !opinion.ratingAlternatives?.length && (/^(?:买入|Buy)$/i.test(opinion.rating ?? '') ||
    Boolean(opinion.buyRecommendation && (!opinion.rating || /^(?:增持|跑赢|优于大市)/.test(opinion.rating))));
}
