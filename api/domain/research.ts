export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceEvidence {
  sourceHash?: string;
  reportId: string;
  filePath: string;
  lineNumber: number;
  endLineNumber?: number;
  startColumn?: number;
  endColumn?: number;
  excerpt: string;
  method: string;
  confidence: ConfidenceLevel;
}

export interface SecurityEntity {
  organizationId?: string;
  securityId?: string;
  listingId?: string;
  key: string;
  code: string | null;
  displayName: string;
  aliases: string[];
  confidence: ConfidenceLevel;
}

export type OpinionType =
  | 'positive'
  | 'rating-change'
  | 'target-price-change'
  | 'catalyst'
  | 'risk';

export interface OpinionRecord {
  rawCode?: string | null;
  sourceHash?: string;
  id: string;
  reportId: string;
  reportDate: string;
  institution: string;
  institutionVerified: boolean;
  security: SecurityEntity;
  sourceName?: string;
  rating: string | null;
  rawRating: string | null;
  action: string | null;
  targetPrice: string | null;
  /** The prior target price stated in the same source statement, when any. */
  previousTargetPrice?: string | null;
  currentPrice: string | null;
  types: OpinionType[];
  evidence: SourceEvidence[];
  ratingAlternatives?: string[];
  previousRating?: string;
  buyRecommendation?: boolean;
}

export interface DataQualityIssue {
  type: 'parse-error' | 'unverified-institution' | 'low-confidence-security' | 'review-pending' | 'review-partial' | 'review-failed';
  reportId?: string;
  filePath?: string;
  lineNumber?: number;
  message: string;
}

export interface ReportOverview {
  publicationId?: string;
  review?: {status:string;sourceHash?:string;publishedSourceHash?:string;model?:string;issueCount?:number};
  companyCount?: number;
  signals?: Array<{id:string;kind:'risk'|'catalyst';subject:string;subjectScope:string;summary:string;lineNumber:number;sourceHash:string}>;
  summaries?: Array<{id:string;title:string;summary:string;lineNumber:number;sourceHash:string}>;

  reportId: string;
  date: string;
  title: string;
  institutions: string[];
  opinions: OpinionRecord[];
  securities: SecurityEntity[];
  positiveCount: number;
  ratingChangeCount: number;
  targetPriceChangeCount: number;
  riskCount: number;
  catalystCount: number;
  buyCoverage?: BuyCoverage;
}

export interface BuyReference {
  lineNumber: number;
  startColumn: number;
  excerpt: string;
  reason: string;
}
export interface BuyCoverage {
  references: number;
  covered: number;
  companyCount: number;
  review: BuyReference[];
  other: BuyReference[];
}

export interface CompanyProfile {
  companyId?: string;
  listings?: SecurityEntity[];
  security: SecurityEntity;
  firstMention: string | null;
  latestMention: string | null;
  latestRating: string | null;
  latestTargetPrice: string | null;
  institutions: string[];
  opinions: OpinionRecord[];
  catalysts: OpinionRecord[];
  risks: OpinionRecord[];
}
