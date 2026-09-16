import type { InstrumentType, ListingStatus, OrganizationKind } from '../../src/shared/researchVocabulary.js';
export type { InstrumentType, ListingStatus } from '../../src/shared/researchVocabulary.js';
import type { ReviewMentionPayload } from './review.js';

export type IdentityVerificationState = 'verified' | 'candidate' | 'ambiguous' | 'unknown';
export type IdentityResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved' | 'conflict';
export type IdentityEntityKind = OrganizationKind;
export type IdentityValidity = 'known' | 'unknown';
export type IdentityTargetKind = 'organization' | 'security' | 'listing';
export type IdentitySourceKind = 'dictionary' | 'mention' | 'review';

export interface IdentityProvenance {
  provenanceId: string;
  sourceKind: IdentitySourceKind;
  sourceRef: string;
  asOf: string | null;
  sourceUrls: string[];
  sourceFiles: string[];
  evidenceRefs: string[];
}

export interface OrganizationIdentity {
  organizationId: string;
  canonicalName: string;
  legalName: string | null;
  entityKind: IdentityEntityKind;
  verificationState: IdentityVerificationState;
  aliases: string[];
  rawNames: string[];
  provenanceRefs: string[];
  dictionaryAsOf: string | null;
  validFrom: string | null;
  validTo: string | null;
  validity: IdentityValidity;
  /** Set only when a later verified relation redirects this historical node. */
  redirectOrganizationId?: string;
}

export interface SecurityIdentity {
  securityId: string;
  issuerOrganizationId: string;
  displayName: string;
  instrumentType: InstrumentType;
  verificationState: IdentityVerificationState;
  aliases: string[];
  rawNames: string[];
  provenanceRefs: string[];
  dictionaryAsOf: string | null;
  validFrom: string | null;
  validTo: string | null;
  validity: IdentityValidity;
}

export interface ListingIdentity {
  listingId: string;
  securityId: string;
  code: string;
  symbol: string;
  venue: string;
  market: string;
  listingStatus: ListingStatus;
  tradingCurrency: string | null;
  aliases: string[];
  rawCodes: string[];
  provenanceRefs: string[];
  dictionaryAsOf: string | null;
  validFrom: string | null;
  validTo: string | null;
  validity: IdentityValidity;
}

export interface IdentityAliasAssignment {
  assignmentId: string;
  targetKind: IdentityTargetKind;
  targetId: string;
  value: string;
  scheme: 'dictionary_name' | 'source_name' | 'source_code' | 'review_alias' | 'ticker' | 'abbreviation' | 'unknown';
  provenanceRefs: string[];
  verificationState: IdentityVerificationState;
  validFrom: string | null;
  validTo: string | null;
  validity: IdentityValidity;
}

export interface IdentityDictionaryInfo {
  asOf: string | null;
  sourceUrls: string[];
  sources: Array<{ file: string; sha256: string }>;
}

export interface IdentityGraph {
  version: 1;
  dictionary: IdentityDictionaryInfo;
  organizations: OrganizationIdentity[];
  securities: SecurityIdentity[];
  listings: ListingIdentity[];
  aliases: IdentityAliasAssignment[];
  provenance: IdentityProvenance[];
}

export interface IdentityMapping {
  mentionKey: string;
  mentionId?: string;
  rawName: string;
  rawCode: string | null;
  resolvedCode: string | null;
  status: IdentityResolutionStatus;
  organizationId: string | null;
  securityId: string | null;
  listingId: string | null;
  candidateOrganizationIds: string[];
  basis: string[];
  provenanceRefs: string[];
}

/** JSON-serializable mapping keyed by the original mention ID. */
export type IdentityMappingIndex = Record<string, IdentityMapping>;

export interface IdentityResolutionResult {
  identityGraph: IdentityGraph;
  /** Keys are stable mention IDs when supplied, otherwise generated mention keys. */
  mapping: IdentityMappingIndex;
  /** Input order is retained for callers whose legacy mentions have no ID. */
  mappingByIndex: IdentityMapping[];
}

/**
 * Structural input accepted from legacy TargetMention values and reviewed
 * Mention records. The resolver intentionally reads only identity fields.
 */
export interface IdentityMentionLike {
  id?: string;
  mentionId?: string;
  reportId?: string;
  articleRef?: string;
  date?: string;
  institution?: string;
  targetName?: string;
  sourceName?: string;
  aliases?: string[];
  code?: string | null;
  rawCode?: string | null;
  excerpt?: string;
  lineNumber?: number;
  headingLineNumber?: number;
  evidence?: Array<{ lineNumber?: number; excerpt?: string; method?: string; evidenceId?: string }>;
  evidenceIDs?: string[];
  payload?: ReviewMentionPayload | {
    articleRef?: string | null;
    rawName?: string;
    rawCode?: string | null;
    roles?: string[];
    aliases?: string[];
    rawIdentifiers?: Array<{ text?: string; interpretation?: string; evidenceIDs?: string[] }>;
    resolution?: {
      status?: string;
      resolvedCode?: string | null;
      displayName?: string | null;
      aliases?: string[];
    };
  };
}

export type { IdentityMentionLike as MentionIdentityInput };
