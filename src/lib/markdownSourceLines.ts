import type { Root } from 'mdast';
import type { Plugin } from 'unified';

type Node = {
  type: string;
  value?: string;
  position?: { start: { line: number } };
  children?: Node[];
  data?: { hName: string; hProperties: Record<string, unknown> };
};

// Capture parser positions before display plugins replace text nodes. Inline
// spans retain Markdown's soft/hard breaks and stay valid inside table cells.
export const remarkSourceLines: Plugin<[], Root> = () => (tree) => {
  function visit(node: Node) {
    if (!node.children) return;
    node.children = node.children.flatMap((child): Node[] => {
      const start = child.position?.start.line;
      if (child.type !== 'text' || child.value === undefined || !start) {
        visit(child);
        return [child];
      }
      return child.value.split('\n').flatMap((value, index) => {
        const result: Node[] = index ? [{ type: 'text', value: '\n' }] : [];
        if (value) result.push({
          type: 'sourceLine',
          data: { hName: 'span', hProperties: { 'data-source-line': start + index } },
          children: [{ type: 'text', value }],
        });
        return result;
      });
    });
  }
  visit(tree as unknown as Node);
};
