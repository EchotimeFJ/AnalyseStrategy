import type { OpinionRecord, OpinionType, SecurityEntity, SourceEvidence } from '../domain/research.js';
import {
  isInvalidEntityName,
  normalizeEntityName,
  normalizeSecurityCode,
  resolveInstitution,
  securityKey,
} from './entityResolver.js';
import { extractTargetMentions, type ReportDocument, type TargetMention } from './reportParser.js';

const POSITIVE_RATINGS = ['买入', '增持', '跑赢', '优于大市', 'overweight', 'buy', 'ow'];

export function isPositiveRating(value: string | null | undefined): boolean {
  const normalized = value?.normalize('NFKC').trim().toLowerCase() ?? '';
  return POSITIVE_RATINGS.some((rating) => normalized === rating.toLowerCase());
}

export function classifyOpinionTypes(input: {
  rating: string | null;
  action: string | null;
  text: string;
}): OpinionType[] {
  const types = new Set<OpinionType>();
  const normalized = input.text.normalize('NFKC').toLowerCase();
  if (isPositiveRating(input.rating) || /首选股|top pick|重点推荐/.test(normalized)) {
    types.add('positive');
  }
  if (input.action && /上调|下调|首次覆盖|恢复覆盖|首予|重申/.test(input.action)) {
    types.add('rating-change');
  }
  if (/目标价[^。\n]{0,28}(?:上调|下调|升至|降至|提高|降低)|(?:上调|下调|升至|降至)[^。\n]{0,28}目标价/.test(normalized)) {
    types.add('target-price-change');
  }
  if (/催化剂|catalyst/.test(normalized)) types.add('catalyst');
  if (/风险|risk/.test(normalized)) types.add('risk');
  return [...types];
}

export function extractOpinions(report: ReportDocument): OpinionRecord[] {
  return extractTargetMentions(report).map((mention, index) => toOpinion(report, mention, index));
}

function toOpinion(report: ReportDocument, mention: TargetMention, index: number): OpinionRecord {
  const headingInstitution = resolveInstitution(mention.institution);
  const institution = headingInstitution.verified ? headingInstitution : inferInstitutionFromText(mention.excerpt) ?? headingInstitution;
  const code = normalizeSecurityCode(mention.code);
  const aliases = [...new Set([mention.targetName, ...mention.aliases]
    .map(normalizeEntityName)
    .filter((alias) => !isInvalidEntityName(alias) && normalizeSecurityCode(alias) !== code))];
  const security: SecurityEntity = {
    key: securityKey({ code, name: mention.targetName }),
    code,
    displayName: normalizeEntityName(mention.targetName),
    aliases,
    confidence: code ? 'high' : 'medium',
  };
  const evidence: SourceEvidence[] = [
    {
      reportId: report.id,
      filePath: report.filePath,
      lineNumber: mention.lineNumber,
      excerpt: mention.excerpt,
      method: code ? 'security-code-segment' : 'security-heading-segment',
      confidence: code ? 'high' : 'medium',
    },
    ...mention.signals.map((signal) => ({
      reportId: report.id,
      filePath: report.filePath,
      lineNumber: signal.lineNumber,
      excerpt: signal.excerpt,
      method: `signal-${signal.type}`,
      confidence: 'medium' as const,
    })),
  ];
  const rating = mention.rating ?? null;
  const action = mention.action ?? null;

  return {
    id: `${report.id}:${mention.lineNumber}:${index}`,
    reportId: report.id,
    reportDate: report.date,
    institution: institution.verified ? institution.canonicalName : `待识别机构（${institution.rawName || '未知'}）`,
    institutionVerified: institution.verified,
    security,
    rating,
    rawRating: rating,
    action,
    targetPrice: mention.targetPrice ?? null,
    currentPrice: mention.currentPrice ?? null,
    types: classifyOpinionTypes({ rating, action, text: mention.excerpt }),
    evidence,
  };
}

function inferInstitutionFromText(text: string) {
  const candidates = [...text.matchAll(/([\u4e00-\u9fa5A-Za-z]{2,12})(?:研究)?观点/g)]
    .map((match) => resolveInstitution(match[1]));
  return candidates.find((candidate) => candidate.verified) ?? null;
}
