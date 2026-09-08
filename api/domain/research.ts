export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceEvidence {
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
  currentPrice: string | null;
  types: OpinionType[];
  evidence: SourceEvidence[];
  ratingAlternatives?: string[];
  previousRating?: string;
  buyRecommendation?: boolean;
}

export interface DataQualityIssue {
  type: 'parse-error' | 'unverified-institution' | 'low-confidence-security';
  reportId?: string;
  filePath?: string;
  lineNumber?: number;
  message: string;
}

export interface ReportOverview {
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
