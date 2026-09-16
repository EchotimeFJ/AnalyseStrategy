/**
 * Shared vocabulary for the source-backed research contract.
 *
 * Keep the values in one place.  The API and the client may use different
 * views of a record, but they must not invent a second set of enum values.
 * Individual industry/topic names remain open values and are deliberately not
 * represented by a closed enum here.
 */

export const RESEARCH_VOCABULARY_VERSION = '1.0.0' as const;
export const REVIEW_PROTOCOL_VERSION = 'review-v1' as const;

export const REVIEW_RECORD_KINDS = [
  'article',
  'mention',
  'statement',
  'signal',
  'topic',
  'evidence',
] as const;
export type ReviewRecordKind = (typeof REVIEW_RECORD_KINDS)[number];

export const REVIEW_OPERATIONS = ['keep', 'add', 'modify', 'delete', 'defer'] as const;
export type ReviewOperation = (typeof REVIEW_OPERATIONS)[number];

export const CLAIM_STATES = ['stated', 'not_stated', 'ambiguous', 'not_applicable'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const VALIDATION_STATES = ['valid', 'needs_review', 'rejected'] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];

export const HUMAN_REVIEW_STATES = ['not_reviewed', 'confirmed', 'corrected', 'rejected'] as const;
export type HumanReviewState = (typeof HUMAN_REVIEW_STATES)[number];

export const REVIEW_READINESS = ['legacy_unreviewed', 'pending', 'ready', 'partial', 'failed', 'withdrawn'] as const;
export type ReviewReadiness = (typeof REVIEW_READINESS)[number];

export const ARTICLE_KINDS = ['company', 'industry', 'macro', 'strategy', 'mixed', 'unknown'] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const TITLE_ORIGINS = ['source', 'generated'] as const;
export type TitleOrigin = (typeof TITLE_ORIGINS)[number];

export const DATE_PRECISIONS = ['day', 'month', 'quarter', 'year', 'unknown'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const REPORT_LIFECYCLES = ['active', 'withdrawn'] as const;
export type ReportLifecycle = (typeof REPORT_LIFECYCLES)[number];

export const MENTION_ROLES = [
  'main_subject',
  'recommended_target',
  'peer',
  'customer_supplier',
  'publisher',
  'analyst',
  'terminology',
  'other',
  'unknown',
] as const;
export type MentionRole = (typeof MENTION_ROLES)[number];

export const IDENTIFIER_INTERPRETATIONS = ['ticker', 'abbreviation', 'unknown'] as const;
export type IdentifierInterpretation = (typeof IDENTIFIER_INTERPRETATIONS)[number];

export const RESOLUTION_STATUSES = ['resolved', 'ambiguous', 'unresolved', 'conflict'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const SUBJECT_SCOPES = ['company', 'security', 'listing', 'theme', 'market', 'unresolved'] as const;
export type SubjectScope = (typeof SUBJECT_SCOPES)[number];

export const ATTRIBUTION_KINDS = ['article_publisher', 'quoted_party', 'unknown'] as const;
export type AttributionKind = (typeof ATTRIBUTION_KINDS)[number];

export const POLARITIES = ['affirmative', 'negated', 'unknown'] as const;
export type Polarity = (typeof POLARITIES)[number];

export const STATEMENT_MODALITIES = ['actual', 'conditional', 'hypothetical', 'unknown'] as const;
export type StatementModality = (typeof STATEMENT_MODALITIES)[number];

export const STATEMENT_TEMPORAL_CONTEXTS = ['current', 'historical', 'unknown'] as const;
export type StatementTemporalContext = (typeof STATEMENT_TEMPORAL_CONTEXTS)[number];

export const SIGNAL_TEMPORAL_CONTEXTS = ['current', 'historical', 'future', 'unknown'] as const;
export type SignalTemporalContext = (typeof SIGNAL_TEMPORAL_CONTEXTS)[number];

export const RECOMMENDATION_ACTIONS = ['buy', 'hold', 'sell', 'top_pick', 'positive', 'avoid', 'other'] as const;
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export const RATING_LABELS = ['buy', 'overweight', 'neutral', 'hold', 'underweight', 'sell', 'other'] as const;
export type RatingLabel = (typeof RATING_LABELS)[number];

export const RATING_DISPLAY_LABELS: Readonly<Record<RatingLabel, string>> = {
  buy: '买入',
  overweight: '增持',
  neutral: '中性',
  hold: '持有',
  underweight: '减持',
  sell: '卖出',
  other: '其他原文评级',
};

export const RATING_COVERAGE = ['rated', 'not_covered', 'unrated'] as const;
export type RatingCoverage = (typeof RATING_COVERAGE)[number];

export const RATING_BASES = ['absolute_return', 'relative_benchmark', 'portfolio_weight', 'unknown'] as const;
export type RatingBasis = (typeof RATING_BASES)[number];

export const RATING_ACTIONS = ['maintain', 'upgrade', 'downgrade', 'initiate', 'resume', 'withdraw', 'other'] as const;
export type RatingAction = (typeof RATING_ACTIONS)[number];

export const TARGET_PRICE_ACTIONS = ['maintain', 'raise', 'lower', 'initiate', 'withdraw', 'other'] as const;
export type TargetPriceAction = (typeof TARGET_PRICE_ACTIONS)[number];

export const PRICE_SHAPES = ['point', 'range'] as const;
export type PriceShape = (typeof PRICE_SHAPES)[number];

export const PRICE_UNITS = ['per_share', 'per_ads', 'index_point', 'other', 'unknown'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const SHARED_SCOPE_KINDS = ['rating', 'recommendation', 'both'] as const;
export type SharedScopeKind = (typeof SHARED_SCOPE_KINDS)[number];

export const SIGNAL_KINDS = ['risk', 'catalyst'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_REALIZATION_STATES = [
  'not_tracked',
  'pending',
  'occurred',
  'not_occurred',
  'cancelled',
  'unknown',
] as const;
export type SignalRealizationStatus = (typeof SIGNAL_REALIZATION_STATES)[number];

export const TOPIC_KINDS = ['sector', 'theme', 'market_scope'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

export const TOPIC_ORIGINS = ['source_tag', 'ai_extracted', 'manual'] as const;
export type TopicOrigin = (typeof TOPIC_ORIGINS)[number];

export const TOPIC_TAXONOMY_STATES = ['candidate', 'approved', 'deprecated'] as const;
export type TopicTaxonomyState = (typeof TOPIC_TAXONOMY_STATES)[number];

export const ISSUE_CATEGORIES = [
  'subject_role',
  'attribution',
  'identity_conflict',
  'time_ambiguity',
  'rating_conflict',
  'price_conflict',
  'evidence_unlocated',
  'coverage_gap',
  'incomplete_output',
  'unsupported_value',
  'provider_error',
  'other',
] as const;
export type ReviewIssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_SEVERITIES = ['info', 'warning', 'error'] as const;
export type ReviewIssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReviewIssueStatus = (typeof ISSUE_STATUSES)[number];

export const CHANGE_REASONS = ['source_update', 'rule_correction', 'ai_review', 'identity_resolution', 'human_correction'] as const;
export type ReviewChangeReason = (typeof CHANGE_REASONS)[number];

export const ACTOR_TYPES = ['system', 'ai', 'human'] as const;
export type ReviewActorType = (typeof ACTOR_TYPES)[number];

export const DICTIONARY_DISPLAY_RATINGS: Readonly<Record<string, RatingLabel>> = {
  Buy: 'buy',
  买入: 'buy',
  '买入/高风险': 'buy',
  增持: 'overweight',
  超配: 'overweight',
  Overweight: 'overweight',
  OW: 'overweight',
  跑赢: 'overweight',
  跑赢大市: 'overweight',
  跑赢大盘: 'overweight',
  跑赢行业: 'overweight',
  优于大市: 'overweight',
  Neutral: 'neutral',
  中性: 'neutral',
  Hold: 'hold',
  持有: 'hold',
  减持: 'underweight',
  Underweight: 'underweight',
  UW: 'underweight',
  跑输: 'underweight',
  跑输大市: 'underweight',
  跑输大盘: 'underweight',
  跑输行业: 'underweight',
  弱于大市: 'underweight',
  低于行业表现: 'underweight',
  Sell: 'sell',
  卖出: 'sell',
};

export function isVocabularyValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function normalizeRatingLabel(value: string | null | undefined): RatingLabel | null {
  if (!value) return null;
  const raw = value.normalize('NFKC').trim();
  return DICTIONARY_DISPLAY_RATINGS[raw]
    ?? DICTIONARY_DISPLAY_RATINGS[Object.keys(DICTIONARY_DISPLAY_RATINGS).find((key) => key.toLowerCase() === raw.toLowerCase()) ?? '']
    ?? null;
}

export const ORGANIZATION_KINDS = ['company','research_institution','other','unknown'] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];
export const INSTRUMENT_TYPES = ['common_equity','preferred_equity','depositary_receipt','reit','etf','fund','other','unknown'] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
export const LISTING_STATUSES = ['active','suspended','delisted','unknown'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const REVIEW_JOB_STATES = ['queued','running','retry_wait','budget_paused','config_paused','succeeded','partial','failed','superseded','withdrawn'] as const;
export type SharedReviewJobState = (typeof REVIEW_JOB_STATES)[number];
