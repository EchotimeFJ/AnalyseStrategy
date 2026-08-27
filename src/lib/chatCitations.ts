import { buildReportLink } from '@/lib/reportLinks';
import type { AiSource } from '@/types';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

export function createRemarkChatCitations(sources: AiSource[]): Plugin<[], Root> {
  return () => (tree) => transformCitations(tree as unknown as MarkdownNode, sources);
}

function transformCitations(node: MarkdownNode, sources: AiSource[]) {
  if (!Array.isArray(node.children) || node.type === 'link' || node.type === 'linkReference') return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && typeof child.value === 'string') return splitCitations(child.value, sources);
    transformCitations(child, sources);
    return [child];
  });
}

function splitCitations(value: string, sources: AiSource[]): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const pattern = /\[(\d+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const sourceIndex = Number(match[1]) - 1;
    const source = sources[sourceIndex];
    if (!source) continue;
    if (match.index > cursor) nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    nodes.push({
      type: 'link',
      url: buildReportLink({
        reportId: source.reportId,
        lineNumber: source.lineNumber,
        highlightTerms: [source.securityName ?? undefined],
      }),
      children: [{ type: 'text', value: `来源 ${sourceIndex + 1}` }],
    });
    cursor = match.index + match[0].length;
  }
  if (!nodes.length) return [{ type: 'text', value }];
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}
