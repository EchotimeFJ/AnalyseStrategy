import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
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

const remarkHighlightMarkers: Plugin<[], Root> = () => (tree) => {
  const markdownTree = tree as unknown as MarkdownNode;
  transformHighlightMarkers(markdownTree, {
    active: false,
    remainingMarkers: countHighlightMarkers(markdownTree),
  });
};

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

export function MarkdownViewer({ markdown }: { markdown: string }) {
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkHighlightMarkers]}>{markdown}</ReactMarkdown>
    </article>
  );
}
