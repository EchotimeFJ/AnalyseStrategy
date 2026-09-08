import type { BuyCoverage, OpinionRecord } from '../domain/research.js';
import type { ReportDocument } from './reportParser.js';
import { isBuyOpinion } from '../../src/lib/opinionPredicates.js';

export function isExplicitBuy(opinion: OpinionRecord) {
  return isBuyOpinion(opinion);
}

// This original-text check is independent from the candidate/field recognizer.
// Every literal reference has a visible destination, even when parsing is unsure.
export function getBuyCoverage(report: ReportDocument, opinions: OpinionRecord[]): BuyCoverage {
  const buys = opinions.filter(isExplicitBuy);
  const result: BuyCoverage = { references: 0, covered: 0, companyCount: new Set(buys.map((opinion) => opinion.sourceName ?? opinion.security.displayName)).size, review: [], other: [] };
  let fenced = false;
  report.lines.forEach((line, index) => {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    for (const match of line.matchAll(/买入|\bBuy\b/gi)) {
      result.references += 1;
      const column = match.index! + 1;
      const direct = buys.some((opinion) => opinion.evidence.some((source) => ['rating-statement', 'buy-recommendation-statement'].includes(source.method) &&
        source.lineNumber === index + 1 && source.startColumn !== undefined && source.endColumn !== undefined && column >= source.startColumn && column < source.endColumn));
      if (direct) { result.covered += 1; continue; }
      const start = Math.max(0, match.index! - 100);
      const excerpt = line.slice(start, match.index! + 220).trim();
      const before = line.slice(Math.max(0, match.index! - 100), match.index!);
      const after = line.slice(match.index! + match[0].length, match.index! + match[0].length + 35);
      const reference = /参见[^。]{0,85}报告|此前[^。]{0,35}|曾经[^。]{0,20}|(?:不是|并非|不再|没有)[^。]{0,10}$/.test(before)
        || /^[”"']?(?:评级)?以来/.test(after)
        || /^[”"']?(?:[/／]高风险)?[”"']?\s*(?:评级)?\s*(?:下调|调整)至/.test(after);
      const sameLineBuy = buys.some((opinion) => opinion.evidence.some((source) => source.method === 'rating-statement' && source.lineNumber === index + 1));
      const commentary = sameLineBuy && /^(?:价值|时机|机会)/.test(after);
      const item = { lineNumber: index + 1, startColumn: column, excerpt,
        reason: reference ? '涉及历史、引用或非当前买入表述' : commentary ? '同一行买入观点的补充说明' : '标的或当前评级尚需核对' };
      (reference || commentary ? result.other : result.review).push(item);
    }
  });
  return result;
}
