export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceEvidence {
  reportId: string;
  filePath: string;
  lineNumber: number;
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
  rating: string | null;
  rawRating: string | null;
  action: string | null;
  targetPrice: string | null;
  currentPrice: string | null;
  types: OpinionType[];
  evidence: SourceEvidence[];
}

export interface DataQualityIssue {
  type: 'parse-error' | 'unverified-institution' | 'low-confidence-security';
  reportId?: string;
  filePath?: string;
  lineNumber?: number;
  message: string;
}
