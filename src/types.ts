export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string | { code?: string; message?: string };
};

export type CountItem = {
  name: string;
  count: number;
};

export type ReportSummary = {
  id: string;
  date: string;
  year: string;
  filePath: string;
  title: string;
  institutions: string[];
  targetCount: number;
  lineCount: number;
  updatedAt?: string;
};

export type ReportChangeType = 'added' | 'modified' | 'removed';

export type ReportChange = ReportSummary & {
  type: ReportChangeType;
  previousUpdatedAt?: string;
  nextUpdatedAt?: string;
};

export type ReportChangeSet = {
  added: ReportChange[];
  modified: ReportChange[];
  removed: ReportChange[];
  generatedAt: string;
};

export type InstitutionBlock = {
  institution: string;
  startLine: number;
  endLine: number;
  tags: string[];
  content: string;
};

export type SignalItem = {
  reportId: string;
  date: string;
  institution: string;
  targetName?: string;
  type: 'catalyst' | 'risk' | 'valuation' | 'financial' | 'macro';
  title: string;
  excerpt: string;
  lineNumber: number;
};

export type TargetMention = {
  reportId: string;
  date: string;
  institution: string;
  targetName: string;
  aliases: string[];
  code?: string;
  rating?: string;
  targetPrice?: string;
  currentPrice?: string;
  action?: string;
  lineNumber: number;
  excerpt: string;
  signals: SignalItem[];
};

export type SearchHit = {
  reportId: string;
  date: string;
  institution: string;
  lineNumber: number;
  snippet: string;
  matchedText: string;
};

export type SearchIntent = {
  type: 'security-code' | 'security-name' | 'institution' | 'text';
  query: string;
  securityKey?: string;
  institution?: string;
};

export type SearchResultGroup = {
  reportId: string;
  date: string;
  institutions: string[];
  matchCount: number;
  snippets: Array<{
    startLine: number;
    endLine: number;
    lineNumbers: number[];
    text: string;
  }>;
};

export type GroupedSearchResponse = {
  query: string;
  intent: SearchIntent;
  totalHits: number;
  groups: SearchResultGroup[];
  company: CompanyProfile | null;
};

export type TargetChange = {
  targetName: string;
  institution: string;
  previousRating?: string;
  currentRating?: string;
  previousTargetPrice?: string;
  currentTargetPrice?: string;
  changeType: string;
  date: string;
  reportId: string;
  lineNumber: number;
};

export type MatrixRow = {
  targetName: string;
  items: TargetMention[];
};

export type SummaryData = {
  sourceDir: string;
  indexedAt?: string;
  reportCount: number;
  targetCount: number;
  mentionCount: number;
  errorCount: number;
  latestDate?: string;
  years: CountItem[];
  institutions: CountItem[];
  latestReports: ReportSummary[];
  radar: RadarData;
};

export type ReportDetail = ReportSummary & {
  markdown: string;
  institutions: InstitutionBlock[];
  mentions: TargetMention[];
};

export type RadarData = {
  firstCoverages: TargetMention[];
  ratingChanges: TargetChange[];
  targetPriceChanges: TargetChange[];
  catalysts: SignalItem[];
  risks: SignalItem[];
  themes: CountItem[];
};

export type TargetProfile = {
  query: string;
  canonicalName: string;
  aliases: string[];
  firstMention?: string;
  latestMention?: string;
  institutions: string[];
  mentions: TargetMention[];
  ratingChanges: TargetChange[];
  matrix: MatrixRow[];
  signals: SignalItem[];
  summary: {
    latestRating?: string;
    latestTargetPrice?: string;
    ratingDistribution: CountItem[];
    targetPrices: Array<{ date: string; institution: string; targetPrice?: string }>;
    sentimentHint: string;
  };
};

export type InstitutionView = {
  matrix: MatrixRow[];
  coverage: CountItem[];
  targetCoverage: CountItem[];
  divergence: MatrixRow[];
};

export type WatchItem = {
  id: string;
  name: string;
  aliases: string[];
  note?: string;
  createdAt: string;
  mentionCount?: number;
  latestMention?: TargetMention;
  latestChanges?: TargetChange[];
};

export type WatchlistData = {
  watchlist: WatchItem[];
  aliases: Array<{ canonical: string; aliases: string[] }>;
  items: WatchItem[];
};

export type IndexStatus = {
  sourceDir: string;
  indexedAt?: string;
  reportCount: number;
  mentionCount: number;
  errors: Array<{ filePath: string; message: string }>;
  qualityIssues?: Array<{
    type: 'parse-error' | 'unverified-institution' | 'low-confidence-security';
    reportId?: string;
    filePath?: string;
    lineNumber?: number;
    message: string;
  }>;
  indexVersion?: string;
  reportChanges?: ReportChangeSet;
};

export type AppVersion = { version: string; commit: string; buildTime: string };

export type StrategyUpdateResult = {
  pull: {
    success: boolean;
    strategyDir: string;
    stdout: string;
    stderr: string;
    startedAt: string;
    finishedAt: string;
  };
  index: IndexStatus;
};

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type OpinionType = 'positive' | 'rating-change' | 'target-price-change' | 'catalyst' | 'risk';

export type SourceEvidence = {
  reportId: string;
  filePath: string;
  lineNumber: number;
  excerpt: string;
  method: string;
  confidence: ConfidenceLevel;
};

export type SecurityEntity = {
  key: string;
  code: string | null;
  displayName: string;
  aliases: string[];
  confidence: ConfidenceLevel;
};

export type OpinionRecord = {
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
};

export type ReportOverview = {
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
};

export type TodayOverview = {
  sourceDir: string;
  indexedAt?: string;
  indexVersion?: string;
  reportCount: number;
  securityCount: number;
  opinionCount: number;
  errorCount: number;
  qualityIssueCount: number;
  latestDate?: string;
  positiveOpinions: OpinionRecord[];
  reportOverviews: ReportOverview[];
};

export type CompanyProfile = {
  security: SecurityEntity;
  firstMention: string | null;
  latestMention: string | null;
  latestRating: string | null;
  latestTargetPrice: string | null;
  institutions: string[];
  opinions: OpinionRecord[];
  catalysts: OpinionRecord[];
  risks: OpinionRecord[];
};

export type AiStatus = {
  configured: boolean;
  providerId: 'openai' | 'deepseek' | 'mimo' | 'openrouter' | 'custom';
  providerName: string;
  baseUrl: string;
  model: string;
  apiKeyMask: string;
  timeoutMs: number;
  dailyTokenBudget: number;
  maxConcurrency: number;
  canPersist: boolean;
  adminProtected: boolean;
  providerPresets: AiProviderPreset[];
  usage: { estimatedTokens: number; active: number };
};

export type AiProviderPreset = {
  id: AiStatus['providerId'];
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
};

export type AiSource = {
  id: string;
  reportId: string;
  date: string;
  institution: string;
  securityName: string | null;
  lineNumber: number;
  excerpt: string;
};
