export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
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
};

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
