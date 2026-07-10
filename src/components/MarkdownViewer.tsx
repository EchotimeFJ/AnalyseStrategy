import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';
import type { Components } from 'react-markdown';
import type { Plugin } from 'unified';
import { protectReportMarkdown } from '@/lib/markdownPreprocess';

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
};

type HighlightState = {
  active: boolean;
  remainingMarkers: number;
};

const HIGHLIGHT_MARKER = '==';
const TARGET_MARK_CLASS = 'report-target-highlight';

const remarkHighlightMarkers: Plugin<[], Root> = () => (tree) => {
  const markdownTree = tree as unknown as MarkdownNode;
  transformHighlightMarkers(markdownTree, {
    active: false,
    remainingMarkers: countHighlightMarkers(markdownTree),
  });
};

function createRemarkTargetHighlights(terms: string[]): Plugin<[], Root> {
  const normalizedTerms = normalizeHighlightTerms(terms);

  return () => (tree) => {
    if (!normalizedTerms.length) {
      return;
    }
    transformTargetHighlights(tree as unknown as MarkdownNode, normalizedTerms);
  };
}

function countHighlightMarkers(node: MarkdownNode): number {
  const ownMarkers = node.type === 'text' && typeof node.value === 'string'
    ? node.value.split(HIGHLIGHT_MARKER).length - 1
    : 0;

  return ownMarkers + (node.children ?? []).reduce((sum, child) => sum + countHighlightMarkers(child), 0);
}

function transformHighlightMarkers(node: MarkdownNode, state: HighlightState) {
  if (!Array.isArray(node.children)) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    const markdownChild = child as MarkdownNode;

    if (markdownChild.type === 'text' && typeof markdownChild.value === 'string') {
      return splitTextByHighlight(markdownChild.value, state);
    }

    transformHighlightMarkers(markdownChild, state);
    return [markdownChild];
  }) as typeof node.children;
}

function splitTextByHighlight(value: string, state: HighlightState): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  while (cursor <= value.length) {
    const markerIndex = value.indexOf(HIGHLIGHT_MARKER, cursor);
    const endIndex = markerIndex === -1 ? value.length : markerIndex;
    const segment = value.slice(cursor, endIndex);

    if (segment) {
      nodes.push(state.active ? createHighlightNode(segment) : { type: 'text', value: segment });
    }

    if (markerIndex === -1) {
      break;
    }

    if (!state.active && state.remainingMarkers < 2) {
      nodes.push({ type: 'text', value: HIGHLIGHT_MARKER });
      state.remainingMarkers -= 1;
      cursor = markerIndex + HIGHLIGHT_MARKER.length;
      continue;
    }

    state.remainingMarkers -= 1;
    state.active = !state.active;
    cursor = markerIndex + HIGHLIGHT_MARKER.length;
  }

  return nodes;
}

function createHighlightNode(value: string): MarkdownNode {
  return {
    type: 'highlight',
    data: {
      hName: 'mark',
      hProperties: { className: 'markdown-highlight' },
    },
    children: [{ type: 'text', value } as MarkdownNode],
  };
}

function transformTargetHighlights(node: MarkdownNode, terms: string[]) {
  if (!Array.isArray(node.children)) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    const markdownChild = child as MarkdownNode;

    if (markdownChild.type === 'text' && typeof markdownChild.value === 'string') {
      return splitTextByTarget(markdownChild.value, terms);
    }

    transformTargetHighlights(markdownChild, terms);
    return [markdownChild];
  }) as typeof node.children;
}

function splitTextByTarget(value: string, terms: string[]): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  const lowerValue = value.toLowerCase();

  while (cursor < value.length) {
    const next = findNextTarget(lowerValue, terms, cursor);
    if (!next) {
      nodes.push({ type: 'text', value: value.slice(cursor) });
      break;
    }

    if (next.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, next.index) });
    }

    nodes.push(createTargetHighlightNode(value.slice(next.index, next.index + next.term.length)));
    cursor = next.index + next.term.length;
  }

  return nodes;
}

function findNextTarget(lowerValue: string, terms: string[], start: number) {
  let best: { index: number; term: string } | undefined;

  terms.forEach((term) => {
    const index = lowerValue.indexOf(term.toLowerCase(), start);
    if (index === -1) {
      return;
    }
    if (!best || index < best.index || (index === best.index && term.length > best.term.length)) {
      best = { index, term };
    }
  });

  return best;
}

function createTargetHighlightNode(value: string): MarkdownNode {
  return {
    type: 'targetHighlight',
    data: {
      hName: 'mark',
      hProperties: { className: TARGET_MARK_CLASS },
    },
    children: [{ type: 'text', value } as MarkdownNode],
  };
}

function normalizeHighlightTerms(terms: string[]) {
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))].sort(
    (left, right) => right.length - left.length,
  );
}

function lineProps(node: unknown) {
  const markdownNode = node as MarkdownNode | undefined;
  const startLine = markdownNode?.position?.start?.line;
  const endLine = markdownNode?.position?.end?.line ?? startLine;

  if (!startLine) {
    return {};
  }

  return {
    id: `report-line-${startLine}`,
    'data-line-start': startLine,
    'data-line-end': endLine,
  };
}

const sourceLineComponents: Components = {
  h1: ({ node, ...props }) => <h1 {...lineProps(node)} {...props} />,
  h2: ({ node, ...props }) => <h2 {...lineProps(node)} {...props} />,
  h3: ({ node, ...props }) => <h3 {...lineProps(node)} {...props} />,
  h4: ({ node, ...props }) => <h4 {...lineProps(node)} {...props} />,
  p: ({ node, ...props }) => <p {...lineProps(node)} {...props} />,
  li: ({ node, ...props }) => <li {...lineProps(node)} {...props} />,
  blockquote: ({ node, ...props }) => <blockquote {...lineProps(node)} {...props} />,
  table: ({ node, ...props }) => <table {...lineProps(node)} {...props} />,
  pre: ({ node, ...props }) => <pre {...lineProps(node)} {...props} />,
};

export function MarkdownViewer({ markdown, highlightTerms = [] }: { markdown: string; highlightTerms?: string[] }) {
  const protectedMarkdown = protectReportMarkdown(markdown);

  return (
    <article className="markdown-body">
      <ReactMarkdown
        components={sourceLineComponents}
        remarkPlugins={[remarkGfm, remarkHighlightMarkers, createRemarkTargetHighlights(highlightTerms)]}
      >
        {protectedMarkdown}
      </ReactMarkdown>
    </article>
  );
}
