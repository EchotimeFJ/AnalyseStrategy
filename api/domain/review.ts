import type { OpinionRecord, SecurityEntity, SourceEvidence } from './research.js';
import type {
  ArticleKind,
  AttributionKind,
  ClaimState,
  DatePrecision,
  IdentifierInterpretation,
  MentionRole,
  Polarity,
  PriceShape,
  PriceUnit,
  RatingAction,
  RatingBasis,
  RatingCoverage,
  RatingLabel,
  RecommendationAction,
  ResolutionStatus,
  ReviewChangeReason,
  ReviewIssueCategory,
  ReviewIssueSeverity,
  ReviewIssueStatus,
  ReviewOperation as ReviewOperationKind,
  ReviewReadiness,
  ReviewRecordKind,
  SignalKind,
  SignalRealizationStatus,
  SignalTemporalContext,
  StatementModality,
  StatementTemporalContext,
  SubjectScope,
  TargetPriceAction,
  TitleOrigin,
  TopicKind,
  TopicOrigin,
  TopicTaxonomyState,
  ValidationState,
} from '../../src/shared/researchVocabulary.js';

/** A line/character interval in the immutable report revision. */
export interface ReviewRange {
  startLine: number;
  endLine: number;
  startOffset?: number;
  endOffset?: number;
}

/**
 * Evidence is allocated by the program.  A model can refer to an evidenceId,
 * but it cannot allocate, move, or rewrite one.  Offsets use JavaScript UTF-16
 * code units and the quote is an exact slice of the source string.
 */
export interface ReviewEvidence {
  evidenceId: string;
  reportId: string;
  reportRevisionId: string;
  sourceHash: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  quote: string;
  method: string;
  confidence?: 'high' | 'medium' | 'low';
}

/** Alias matching the six-object contract vocabulary. */
export type Evidence = ReviewEvidence;

export interface ReviewClaim<T> {
  state: ClaimState;
  value: T | null;
  evidenceIDs: string[];
  candidates?: Array<{ value: T; evidenceIDs: string[] }>;
}

export type Claim<T> = ReviewClaim<T>;

export interface ReviewDateValue {
  date: string | null;
  precision: DatePrecision;
  rawText: string;
}

export interface ReviewIdentifier {
  text: string;
  interpretation: IdentifierInterpretation;
  evidenceIDs: string[];
}

export interface ReviewRatingValue {
  rawLabel: string;
  coverage: RatingCoverage;
  normalizedLabel: RatingLabel | null;
  scaleRef: string | null;
  benchmarkText: string | null;
  horizonText: string | null;
  basis: RatingBasis;
}

export interface ReviewPriceValue {
  rawText: string;
  shape: PriceShape;
  amount?: string | null;
  lower?: string | null;
  upper?: string | null;
  currency?: string | null;
  unit: PriceUnit;
  unitText?: string | null;
  horizonText?: string | null;
}

export interface ReviewRecommendationValue {
  rawText: string;
  action: RecommendationAction;
}

export interface ReviewAttribution {
  kind: AttributionKind;
  rawName: string | null;
  institutionVerified: boolean;
  evidenceIDs: string[];
}

export interface ReviewSubject {
  scope: SubjectScope;
  mentionRef?: string | null;
  rawText?: string | null;
  /** References a program-resolved identity. Models cannot edit this field. */
  resolvedSecurityKey?: string | null;
}

export interface ReviewArticlePayload {
  title: string;
  titleOrigin: TitleOrigin;
  titleEvidenceIDs: string[];
  ranges: ReviewRange[];
  articleKind: ArticleKind;
  summary: ReviewClaim<string>;
  publisher: ReviewClaim<string>;
  articleDate: ReviewClaim<ReviewDateValue>;
  mainMentionRefs: string[];
  topicRefs: string[];
}

export interface ReviewMentionResolution {
  status: ResolutionStatus;
  resolvedSecurityKey: string | null;
  resolvedCode: string | null;
  displayName: string | null;
  aliases: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ReviewMentionPayload {
  articleRef: string;
  rawName: string;
  /** Exact source spelling of a security code, when the source has one. */
  rawCode?: string | null;
  roles: MentionRole[];
  nameEvidenceIDs: string[];
  rawIdentifiers: ReviewIdentifier[];
  /** The source spelling is separate from this program-owned resolution. */
  resolution: ReviewMentionResolution;
}

export interface ReviewStatementPayload {
  articleRef: string;
  attribution: ReviewAttribution;
  subject: ReviewSubject;
  asOf: ReviewClaim<ReviewDateValue>;
  polarity: Polarity;
  modality: StatementModality;
  temporalContext: StatementTemporalContext;
  conditionText: string | null;
  rating: ReviewClaim<ReviewRatingValue>;
  recommendation: ReviewClaim<ReviewRecommendationValue>;
  ratingAction: ReviewClaim<RatingAction>;
  priorRating: ReviewClaim<ReviewRatingValue>;
  targetPrice: ReviewClaim<ReviewPriceValue>;
  targetPriceAction: ReviewClaim<TargetPriceAction>;
  priorTargetPrice: ReviewClaim<ReviewPriceValue>;
  currentPrice: ReviewClaim<ReviewPriceValue>;
  rationale: ReviewClaim<string>;
  sharedScopeId: string | null;
  /** Stable bridge for legacy views; never allowed in a model patch. */
  legacyOpinionId?: string;
}

export interface ReviewSignalPayload {
  articleRef: string;
  subject: ReviewSubject;
  kind: SignalKind;
  summary: string;
  evidenceIDs: string[];
  temporalContext: SignalTemporalContext;
  polarity: Polarity;
  modality: StatementModality;
  relatedStatementRefs: string[];
  expectedWindowText: string | null;
  eventDate: ReviewClaim<ReviewDateValue>;
  conditionText: string | null;
  realizationStatus: SignalRealizationStatus;
}

export interface ReviewTopicPayload {
  articleRef: string;
  label: string;
  kind: TopicKind;
  origin: TopicOrigin;
  taxonomyVersion: string;
  taxonomyState: TopicTaxonomyState;
  evidenceIDs: string[];
}

export interface ReviewEvidencePayload {
  evidence: ReviewEvidence;
}

export type ReviewRecordBase<K extends ReviewRecordKind, P> = {
  id: string;
  kind: K;
  /** Tombstones remain in the audit result; consumers filter active records. */
  status?: 'active' | 'deleted' | 'deferred';
  articleRef: string | null;
  evidenceIDs: string[];
  payload: P;
};

export type ArticleRecord = ReviewRecordBase<'article', ReviewArticlePayload>;
export type MentionRecord = ReviewRecordBase<'mention', ReviewMentionPayload>;
export type StatementRecord = ReviewRecordBase<'statement', ReviewStatementPayload>;
export type SignalRecord = ReviewRecordBase<'signal', ReviewSignalPayload>;
export type TopicRecord = ReviewRecordBase<'topic', ReviewTopicPayload>;
export type EvidenceRecord = ReviewRecordBase<'evidence', ReviewEvidencePayload>;

/** The six shared, discriminated record shapes used in candidate and result. */
export type ReviewRecord =
  | ArticleRecord
  | MentionRecord
  | StatementRecord
  | SignalRecord
  | TopicRecord
  | EvidenceRecord;

/** Aliases make the contract convenient for callers that use the object names. */
export type Article = ArticleRecord;
export type Mention = MentionRecord;
export type Statement = StatementRecord;
export type Signal = SignalRecord;
export type Topic = TopicRecord;

export interface ReviewCoverage {
  ranges: ReviewRange[];
  complete: boolean;
  chunkId?: string;
  articleRefs?: string[];
  recordIDs?: string[];
  note?: string | null;
}

export interface ReviewCandidate {
  protocolVersion: string;
  vocabularyVersion: string;
  reportId: string;
  reportRevisionId: string;
  sourceHash: string;
  candidateHash: string;
  coverage: ReviewCoverage;
  evidence: ReviewEvidence[];
  records: ReviewRecord[];
  /** All records requiring an explicit model disposition. Evidence inventory is excluded. */
  reviewableRecordIDs: string[];
  /** Original records used only for adapting a reviewed result to legacy APIs. */
  baselineOpinions?: OpinionRecord[];
  /** Internal validation aid; omit when serialising a provider request. */
  sourceText?: string;
}

export interface ReviewFieldChange {
  /** A guarded, allow-listed payload path, such as rating or summary.value. */
  path: string;
  expectedValueHash: string;
  value: unknown;
  evidenceIDs?: string[];
}

export interface ReviewOperation {
  op: ReviewOperationKind;
  candidateId: string;
  reason: string;
  reasonCode?: ReviewChangeReason | 'model_correction' | 'model_addition' | 'model_deletion';
  /** Required for modify; additions carry a complete typed record. */
  fieldChanges?: ReviewFieldChange[];
  record?: ReviewRecord;
  /** Required for delete and useful for audit of every changed record. */
  evidenceIDs?: string[];
}

export interface ReviewIssue {
  issueId: string;
  recordRef?: string | null;
  fieldPath?: string | null;
  category: ReviewIssueCategory;
  severity: ReviewIssueSeverity;
  status: ReviewIssueStatus;
  description: string;
  evidenceIDs: string[];
}

export interface ReviewPatch {
  patchId?: string;
  protocolVersion?: string;
  baseRevisionId: string;
  baseCandidateHash: string;
  sourceHash: string;
  coverage: ReviewCoverage;
  operations: ReviewOperation[];
  issues?: ReviewIssue[];
}

export interface ReviewValidationResult {
  valid: boolean;
  ok: boolean;
  issues: ReviewIssue[];
  operationIDs: string[];
}

export interface AppliedReviewResult {
  records: ReviewRecord[];
  evidence: ReviewEvidence[];
  operations: ReviewOperation[];
  tombstoneIDs: string[];
  deferredIDs: string[];
  additions: string[];
  validation: ReviewValidationResult;
}

export interface ReviewProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface ReviewAttempt {
  actualModel?: string;
  chunkId: string;
  startLine: number;
  endLine: number;
  status: 'succeeded' | 'failed' | 'cancelled';
  finishReason?: string | null;
  usage?: ReviewProviderUsage | null;
  reservedUnits?: number;
  error?: string;
}

export interface ReviewUsage {
  attempts: number;
  reservedUnits: number;
  inputBytes: number;
  provider?: ReviewProviderUsage;
  byAttempt: ReviewAttempt[];
}

export interface ReviewedReport {
  protocolVersion: string;
  vocabularyVersion: string;
  reportId: string;
  reportRevisionId: string;
  sourceHash: string;
  candidateHash: string;
  coverage: ReviewCoverage;
  records: ReviewRecord[];
  evidence: ReviewEvidence[];
  operations: ReviewOperation[];
  issues: ReviewIssue[];
  validationState: ValidationState;
  readiness: ReviewReadiness;
  complete: boolean;
  usage: ReviewUsage;
  attempts: ReviewAttempt[];
  baselineOpinions?: OpinionRecord[];
}

/** Keeps the existing research type available to adapters without widening the review contract. */
export type LegacyEvidence = SourceEvidence;
export type ResolvedSecurity = SecurityEntity;
