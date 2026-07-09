import path from 'node:path';

export type SignalType = 'catalyst' | 'risk' | 'valuation' | 'financial' | 'macro';

export type InstitutionBlock = {
  institution: string;
  startLine: number;
  endLine: number;
  tags: string[];
  content: string;
};

export type ReportDocument = {
  id: string;
  date: string;
  year: string;
  filePath: string;
  markdown: string;
  lines: string[];
  lineCount: number;
  title: string;
  institutions: InstitutionBlock[];
  updatedAt?: string;
};

export type SearchHit = {
  reportId: string;
  date: string;
  institution: string;
  lineNumber: number;
  snippet: string;
  matchedText: string;
};

export type CatalystRiskItem = {
  reportId: string;
  date: string;
  institution: string;
  targetName?: string;
  type: SignalType;
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
  signals: CatalystRiskItem[];
};

export type BuildReportInput = {
  id: string;
  filePath: string;
  markdown: string;
  updatedAt?: string;
};

const RATING_WORDS = [
  '买入',
  '增持',
  '中性',
  '卖出',
  '减持',
  '持有',
  '跑赢',
  '跑输',
  '优于大市',
  '弱于大市',
  'Buy',
  'Hold',
  'Sell',
  'OW',
  'UW',
  'Overweight',
  'Underweight',
];

const ACTION_WORDS = ['首次覆盖', '维持', '上调', '下调', '恢复覆盖', '首予', '新增'];

const LISTED_CODE_PATTERN = /\b(?:\d{4,6}|[A-Z]{1,6})\.(?:HK|SS|SZ|US|TW|KS|KQ|JP|L|O|N)\b/;
const PAREN_TARGET_PATTERN = /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9&.\-\s]{1,40})[（(]([^）)]+)[）)]/g;

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildReportFromMarkdown(input: BuildReportInput): ReportDocument {
  const lines = input.markdown.split(/\r?\n/);
  const date = extractDate(input.filePath, input.id);
  const institutions = extractInstitutionBlocks(lines).map((block) => ({
    ...block,
    content: lines.slice(block.startLine - 1, block.endLine).join('\n'),
  }));

  return {
    id: input.id,
    date,
    year: date.slice(0, 4),
    filePath: input.filePath,
    markdown: input.markdown,
    lines,
    lineCount: lines.length,
    title: path.basename(input.filePath),
    institutions,
    updatedAt: input.updatedAt,
  };
}

export function createExactSearch(reports: ReportDocument[]) {
  return (query: string): SearchHit[] => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return [];
    }

    const hits: SearchHit[] = [];
    for (const report of reports) {
      for (let index = 0; index < report.lines.length; index += 1) {
        const line = report.lines[index] ?? '';
        if (!normalizeText(line).includes(normalizedQuery)) {
          continue;
        }

        hits.push({
          reportId: report.id,
          date: report.date,
          institution: findInstitutionForLine(report, index + 1),
          lineNumber: index + 1,
          snippet: buildSnippet(report.lines, index),
          matchedText: query,
        });
      }
    }
    return hits;
  };
}

export function extractTargetMentions(report: ReportDocument): TargetMention[] {
  const mentions: TargetMention[] = [];
  for (const block of report.institutions) {
    const blockLines = report.lines.slice(block.startLine - 1, block.endLine);
    const candidates = extractTargetCandidates(blockLines, block.startLine);
    const blockText = blockLines.join('\n');

    for (const candidate of candidates) {
      const nearbyText = getNearbyText(report.lines, candidate.lineNumber - 1, 5);
      const rating = extractRating(nearbyText) ?? extractRating(blockText);
      const targetPrice = extractTargetPrice(nearbyText) ?? extractTargetPrice(blockText);
      const currentPrice = extractCurrentPrice(nearbyText) ?? extractCurrentPrice(blockText);
      const action = extractAction(nearbyText) ?? extractAction(blockText);
      const excerpt = compactExcerpt(nearbyText);

      mentions.push({
        reportId: report.id,
        date: report.date,
        institution: block.institution,
        targetName: candidate.name,
        aliases: uniqueStrings([candidate.name, ...candidate.aliases]),
        code: candidate.code,
        rating,
        targetPrice,
        currentPrice,
        action,
        lineNumber: candidate.lineNumber,
        excerpt,
        signals: extractSignals(report, block, candidate.name),
      });
    }
  }

  return dedupeMentions(mentions);
}

export function extractSignals(
  report: ReportDocument,
  block: InstitutionBlock,
  targetName?: string,
): CatalystRiskItem[] {
  const signals: CatalystRiskItem[] = [];
  for (let index = block.startLine - 1; index < block.endLine; index += 1) {
    const line = report.lines[index] ?? '';
    const type = classifySignal(line);
    if (!type) {
      continue;
    }

    signals.push({
      reportId: report.id,
      date: report.date,
      institution: block.institution,
      targetName,
      type,
      title: line.replace(/^[-•\s]+/, '').slice(0, 48),
      excerpt: compactExcerpt(getNearbyText(report.lines, index, 2)),
      lineNumber: index + 1,
    });
  }
  return signals;
}

function extractDate(filePath: string, fallback: string): string {
  const source = `${filePath} ${fallback}`;
  const match = source.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) {
    return fallback;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractInstitutionBlocks(lines: string[]): InstitutionBlock[] {
  const starts: Array<{ institution: string; lineNumber: number }> = [];
  lines.forEach((line, index) => {
    const match = line.match(/^#\s+([^#].*?)\s*$/);
    if (!match) {
      return;
    }

    const institution = match[1].trim();
    if (!institution || institution.length > 40) {
      return;
    }
    starts.push({ institution, lineNumber: index + 1 });
  });

  return starts.map((start, index) => {
    const endLine = (starts[index + 1]?.lineNumber ?? lines.length + 1) - 1;
    const contentLines = lines.slice(start.lineNumber - 1, endLine);
    return {
      institution: start.institution,
      startLine: start.lineNumber,
      endLine,
      tags: extractTags(contentLines),
      content: '',
    };
  });
}

function extractTags(lines: string[]): string[] {
  const tags = lines.flatMap((line) => {
    if (!line.startsWith('#') || line.startsWith('# ')) {
      return [];
    }
    return [...line.matchAll(/#([^\s#]+)/g)].map((match) => match[1]);
  });
  return uniqueStrings(tags);
}

function extractTargetCandidates(lines: string[], firstLineNumber: number) {
  const candidates: Array<{ name: string; aliases: string[]; code?: string; lineNumber: number }> = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(PAREN_TARGET_PATTERN)) {
      const rawName = cleanupName(match[1]);
      const inside = match[2].trim();
      const highConfidence =
        LISTED_CODE_PATTERN.test(inside) ||
        /覆盖个股|覆盖公司/.test(line);
      if (!highConfidence) {
        continue;
      }
      const aliases = inside
        .split(/[/,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const code = aliases.find((item) => LISTED_CODE_PATTERN.test(item));
      if (rawName && !isNoiseName(rawName)) {
        candidates.push({
          name: rawName,
          aliases,
          code,
          lineNumber: firstLineNumber + index,
        });
      }
    }
  });
  return candidates;
}

function extractRating(text: string): string | undefined {
  const normalized = text.normalize('NFKC');
  const explicit = normalized.match(/(?:投资评级|评级|Rating)[:：]?\s*[“"']?([A-Za-z\u4e00-\u9fa5]+)[”"']?/i);
  if (explicit) {
    const rating = RATING_WORDS.find((word) => normalizeText(explicit[1]).includes(normalizeText(word)));
    if (rating) {
      return rating;
    }
  }
  return RATING_WORDS.find((word) => normalized.includes(word));
}

function extractAction(text: string): string | undefined {
  return ACTION_WORDS.find((word) => text.includes(word));
}

function extractTargetPrice(text: string): string | undefined {
  const normalized = text.normalize('NFKC');
  const patterns = [
    /(?:目标价|target price|TP|PT)[^0-9人民币港元美元]{0,16}(?:为|至|:|：)?\s*(人民币\s*)?([0-9]+(?:\.[0-9]+)?\s*(?:港元|美元|元|新台币|人民币))/i,
    /((?:人民币\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:港元|美元|元|新台币|人民币))[^。\n]{0,12}(?:目标价|target price|TP|PT)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const price = match[2] ? `${match[1] ?? ''}${match[2]}` : match[1];
      return price.replace(/\s+/g, ' ').trim();
    }
  }
  return undefined;
}

function extractCurrentPrice(text: string): string | undefined {
  const normalized = text.normalize('NFKC');
  const direct = normalized.match(/(?:当前股价|现价|current price)[^\n:：]{0,60}[:：]\s*([0-9]+(?:\.[0-9]+)?\s*(?:港元|美元|元|新台币|人民币)?)/i);
  if (direct) {
    return direct[1].replace(/\s+/g, ' ').trim();
  }

  const line = normalized
    .split(/\r?\n/)
    .find((item) => /当前股价|现价|current price/i.test(item));
  const prices = [...(line ?? '').matchAll(/([0-9]+(?:\.[0-9]+)?\s*(?:港元|美元|元|新台币|人民币)?)/g)];
  return prices.at(-1)?.[1]?.replace(/\s+/g, ' ').trim();
}

function classifySignal(line: string): SignalType | undefined {
  const normalized = normalizeText(line);
  if (normalized.includes('催化剂') || normalized.includes('catalyst')) {
    return 'catalyst';
  }
  if (normalized.includes('风险') || normalized.includes('risk')) {
    return 'risk';
  }
  if (normalized.includes('估值') || normalized.includes('valuation')) {
    return 'valuation';
  }
  if (normalized.includes('财务') || normalized.includes('营收') || normalized.includes('利润')) {
    return 'financial';
  }
  if (normalized.includes('宏观') || normalized.includes('政策') || normalized.includes('监管')) {
    return 'macro';
  }
  return undefined;
}

function findInstitutionForLine(report: ReportDocument, lineNumber: number): string {
  const block = report.institutions.find((item) => lineNumber >= item.startLine && lineNumber <= item.endLine);
  return block?.institution ?? '未识别机构';
}

function buildSnippet(lines: string[], index: number): string {
  return compactExcerpt(getNearbyText(lines, index, 1));
}

function getNearbyText(lines: string[], index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(lines.length, index + radius + 1);
  return lines.slice(start, end).join('\n');
}

function compactExcerpt(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 520);
}

function cleanupName(value: string): string {
  const withoutDash = value.includes(' - ') ? value.split(' - ').at(-1) ?? value : value;
  const compact = withoutDash
    .replace(/^#+/, '')
    .replace(/[=*_`]/g, '')
    .replace(/^(?:我们(?:将|对|认为)?|和|与|以及|及|该公司|公司)\s*/g, '')
    .replace(/(?:覆盖个股|覆盖公司|公司|个股|股份有限公司)$/g, '')
    .trim();
  const subjectMatch = compact.match(/^([\u4e00-\u9fa5A-Za-z0-9]{2,12})(?:是|为)/);
  if (subjectMatch) {
    return subjectMatch[1];
  }
  const stockSubjectMatch = compact.match(/^([\u4e00-\u9fa5A-Za-z0-9]{2,12})(?:股价|股票|股份)/);
  return stockSubjectMatch?.[1] ?? compact;
}

function isNoiseName(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    normalized.length < 2 ||
    ['hk', 'us', 'ss', 'sz', 'tw', 'ah', 'ai'].includes(normalized) ||
    normalized.includes('目标价') ||
    normalized.includes('评级') ||
    normalized.includes('发布日期') ||
    normalized.includes('当前股价') ||
    normalized.includes('风险') ||
    normalized.includes('催化剂')
  );
}

function dedupeMentions(mentions: TargetMention[]): TargetMention[] {
  const seen = new Set<string>();
  const result: TargetMention[] = [];
  for (const mention of mentions) {
    const key = [
      normalizeText(mention.targetName),
      mention.code ?? '',
      mention.institution,
      mention.lineNumber,
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(mention);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeText(trimmed);
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
