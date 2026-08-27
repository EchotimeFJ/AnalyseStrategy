import type { SecurityEntity } from '../domain/research.js';
import { normalizeSecurityCode } from './entityResolver.js';
import { normalizeText, type SearchHit } from './reportParser.js';

export type SearchIntentType = 'security-code' | 'security-name' | 'institution' | 'text';

export interface SearchContext {
  securities: SecurityEntity[];
  institutions: string[];
}

export interface SearchIntent {
  type: SearchIntentType;
  query: string;
  securityKey?: string;
  institution?: string;
}

export interface SearchResultSnippet {
  startLine: number;
  endLine: number;
  lineNumbers: number[];
  text: string;
}

export interface SearchResultGroup {
  reportId: string;
  date: string;
  institutions: string[];
  matchCount: number;
  snippets: SearchResultSnippet[];
}

export function classifySearchIntent(query: string, context: SearchContext): SearchIntent {
  const value = query.trim();
  const normalized = normalizeText(value);
  const code = normalizeSecurityCode(value);
  if (code) {
    const security = context.securities.find((item) => item.code === code);
    return { type: 'security-code', query: value, securityKey: security?.key };
  }

  const security = context.securities.find((item) =>
    [item.displayName, ...item.aliases].some((name) => normalizeText(name) === normalized),
  );
  if (security) return { type: 'security-name', query: value, securityKey: security.key };

  const institution = context.institutions.find((name) => normalizeText(name) === normalized);
  if (institution) return { type: 'institution', query: value, institution };
  return { type: 'text', query: value };
}

export function groupSearchHits(hits: SearchHit[], gap = 2): SearchResultGroup[] {
  const reports = new Map<string, SearchHit[]>();
  for (const hit of hits) reports.set(hit.reportId, [...(reports.get(hit.reportId) ?? []), hit]);

  return [...reports.entries()].map(([reportId, reportHits]) => {
    const ordered = reportHits.slice().sort((left, right) => left.lineNumber - right.lineNumber);
    const snippets: SearchResultSnippet[] = [];
    for (const hit of ordered) {
      const current = snippets.at(-1);
      if (current && hit.lineNumber - current.endLine <= gap) {
        current.endLine = hit.lineNumber;
        current.lineNumbers.push(hit.lineNumber);
        if (!current.text.includes(hit.snippet)) current.text += `\n${hit.snippet}`;
      } else {
        snippets.push({
          startLine: hit.lineNumber,
          endLine: hit.lineNumber,
          lineNumbers: [hit.lineNumber],
          text: hit.snippet,
        });
      }
    }
    return {
      reportId,
      date: ordered[0]?.date ?? '',
      institutions: [...new Set(ordered.map((hit) => hit.institution))],
      matchCount: ordered.length,
      snippets,
    };
  }).sort((left, right) => right.date.localeCompare(left.date) || left.reportId.localeCompare(right.reportId));
}
