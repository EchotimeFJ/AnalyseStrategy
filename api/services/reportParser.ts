import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { recognizeTargets } from './reportRecognition.js';
import {
  extractMarkdownTagOccurrences,
  findMarkdownTags,
  markdownTagMatches,
  type MarkdownTagOccurrence,
} from '../../src/lib/markdownTags.js';

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
  tags: MarkdownTagOccurrence[];
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
  rawRating?: string;
  targetPrice?: string;
  currentPrice?: string;
  action?: string;
  lineNumber: number;
  excerpt: string;
  signals: CatalystRiskItem[];
  headingLineNumber?: number;
  fieldEvidence?: Array<{ field: 'rating' | 'buy-recommendation' | 'target-price' | 'current-price'; lineNumber: number; excerpt: string; startColumn?: number; endColumn?: number }>;
  previousRating?: string;
  previousTargetPrice?: string;
  ratingChanged?: boolean;
  targetPriceChanged?: boolean;
  ratingAlternatives?: string[];
  buyRecommendation?: boolean;
};

export type BuildReportInput = {
  id: string;
  filePath: string;
  markdown: string;
  updatedAt?: string;
};

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
  const markdownTree = unified().use(remarkParse).parse(input.markdown);
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
    tags: extractMarkdownTagOccurrences(markdownTree),
    institutions,
    updatedAt: input.updatedAt,
  };
}

export function createTagSearch(reports: ReportDocument[]) {
  return (query: string): SearchHit[] => {
    const rawQuery = query.trim().startsWith('#') ? query.trim() : `#${query.trim()}`;
    const queryMatch = findMarkdownTags(rawQuery)[0];
    if (!queryMatch || queryMatch.start !== 0 || queryMatch.end !== rawQuery.length) return [];

    const hits: SearchHit[] = [];
    for (const report of reports) {
      const matchingLines = new Set(
        report.tags
          .filter((tag) => markdownTagMatches(tag.name, queryMatch.name))
          .map((tag) => tag.lineNumber),
      );
      for (const lineNumber of matchingLines) {
        hits.push({
          reportId: report.id,
          date: report.date,
          institution: findInstitutionForLine(report, lineNumber),
          lineNumber,
          snippet: buildSnippet(report.lines, lineNumber - 1),
          matchedText: rawQuery,
        });
      }
    }
    return hits;
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
  return recognizeTargets(report, extractSignals);
}

export function extractSignals(
  report: ReportDocument,
  block: InstitutionBlock,
  targetName?: string,
  range?: { startLine: number; endLine: number },
): CatalystRiskItem[] {
  const signals: CatalystRiskItem[] = [];
  const startLine = Math.max(block.startLine, range?.startLine ?? block.startLine);
  const endLine = Math.min(block.endLine, range?.endLine ?? block.endLine);
  for (let index = startLine - 1; index < endLine; index += 1) {
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
