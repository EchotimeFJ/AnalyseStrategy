import type { Root } from 'mdast';
import type { Plugin } from 'unified';

export type MarkdownTagMatch = {
  raw: string;
  name: string;
  start: number;
  end: number;
};

export type MarkdownTagOccurrence = MarkdownTagMatch & {
  lineNumber: number;
};

const TAG_CHARACTER = /^(?:\p{L}|\p{M}|\p{N}|_|-|\/|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F)$/u;
const MEANINGFUL_TAG_CHARACTER = /^(?:\p{L}|\p{M}|\p{Extended_Pictographic})$/u;
const SKIPPED_MARKDOWN_NODE_TYPES = new Set(['link', 'linkReference', 'code', 'inlineCode', 'html', 'definition', 'yaml']);

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string;
  children?: MarkdownNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  position?: {
    start?: { line?: number };
  };
};

export const remarkMarkdownTags: Plugin<[], Root> = () => (tree) => {
  transformMarkdownTags(tree as unknown as MarkdownNode);
};

export function extractMarkdownTagOccurrences(tree: Root): MarkdownTagOccurrence[] {
  const occurrences: MarkdownTagOccurrence[] = [];
  collectMarkdownTags(tree as unknown as MarkdownNode, occurrences);
  return occurrences;
}

export function findMarkdownTags(value: string): MarkdownTagMatch[] {
  const matches: MarkdownTagMatch[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const hashIndex = value.indexOf('#', cursor);
    if (hashIndex === -1) break;
    cursor = hashIndex + 1;

    if (!canStartTag(value, hashIndex)) continue;

    let end = cursor;
    while (end < value.length) {
      const character = String.fromCodePoint(value.codePointAt(end) ?? 0);
      if (!TAG_CHARACTER.test(character)) break;
      end += character.length;
    }

    const name = value.slice(cursor, end);
    if (!name || !Array.from(name).some((character) => MEANINGFUL_TAG_CHARACTER.test(character))) continue;

    matches.push({
      raw: value.slice(hashIndex, end),
      name,
      start: hashIndex,
      end,
    });
    cursor = end;
  }

  return matches;
}

export function markdownTagMatches(candidate: string, query: string): boolean {
  const normalizedCandidate = normalizeTagName(candidate);
  const normalizedQuery = normalizeTagName(query);
  if (!normalizedCandidate || !normalizedQuery) return false;
  return normalizedCandidate === normalizedQuery || normalizedCandidate.startsWith(`${normalizedQuery}/`);
}

export function buildMarkdownTagSearchPath(tag: string): string {
  const value = tag.startsWith('#') ? tag : `#${tag}`;
  return `/search?q=${encodeURIComponent(value)}&mode=tag`;
}

function canStartTag(value: string, hashIndex: number): boolean {
  if (hashIndex === 0) return true;
  const previous = value[hashIndex - 1] ?? '';
  return previous !== '#' && !TAG_CHARACTER.test(previous);
}

function normalizeTagName(value: string): string {
  return value.replace(/^#/, '').normalize('NFKC').toLocaleLowerCase();
}

function transformMarkdownTags(node: MarkdownNode) {
  if (SKIPPED_MARKDOWN_NODE_TYPES.has(node.type) || !Array.isArray(node.children)) return;

  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && typeof child.value === 'string') {
      return splitMarkdownTagText(child.value);
    }
    transformMarkdownTags(child);
    return [child];
  });
}

function collectMarkdownTags(node: MarkdownNode, occurrences: MarkdownTagOccurrence[]) {
  if (SKIPPED_MARKDOWN_NODE_TYPES.has(node.type)) return;
  if (node.type === 'text' && typeof node.value === 'string') {
    const startLine = node.position?.start?.line ?? 1;
    for (const match of findMarkdownTags(node.value)) {
      occurrences.push({
        ...match,
        lineNumber: startLine + countLineBreaks(node.value.slice(0, match.start)),
      });
    }
    return;
  }
  for (const child of node.children ?? []) collectMarkdownTags(child, occurrences);
}

function splitMarkdownTagText(value: string): MarkdownNode[] {
  const matches = findMarkdownTags(value);
  if (!matches.length) return [{ type: 'text', value }];

  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) nodes.push({ type: 'text', value: value.slice(cursor, match.start) });
    nodes.push({
      type: 'link',
      url: buildMarkdownTagSearchPath(match.raw),
      title: `搜索标签 ${match.raw}`,
      data: {
        hProperties: {
          className: ['markdown-tag'],
          'data-markdown-tag': match.name,
        },
      },
      children: [{ type: 'text', value: match.raw }],
    });
    cursor = match.end;
  }
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

function countLineBreaks(value: string): number {
  return (value.match(/\n/g) ?? []).length;
}
