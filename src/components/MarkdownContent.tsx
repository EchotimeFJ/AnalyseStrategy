import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Components, Options } from 'react-markdown';

export type MarkdownVariant = 'report' | 'assistant';

type MarkdownNode = {
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
};

export function MarkdownContent({
  markdown,
  variant,
  className = '',
  components,
  remarkPlugins = [],
  internalLinkClassName,
  sourceLines = false,
  trailing,
}: {
  markdown: string;
  variant: MarkdownVariant;
  className?: string;
  components?: Components;
  remarkPlugins?: NonNullable<Options['remarkPlugins']>;
  internalLinkClassName?: string;
  sourceLines?: boolean;
  trailing?: ReactNode;
}) {
  const mergedComponents = createComponents({ components, internalLinkClassName, sourceLines });
  const classes = [`markdown-content`, `markdown-content--${variant}`, className].filter(Boolean).join(' ');

  return (
    <article className={classes}>
      <ReactMarkdown components={mergedComponents} remarkPlugins={[remarkGfm, ...remarkPlugins]}>{markdown}</ReactMarkdown>
      {trailing}
    </article>
  );
}

function createComponents({
  components,
  internalLinkClassName,
  sourceLines,
}: {
  components?: Components;
  internalLinkClassName?: string;
  sourceLines: boolean;
}): Components {
  const line = (node: unknown) => sourceLines ? sourceLineProps(node) : {};
  const common: Components = {
    a: ({ href, children, title }) => {
      if (!href) return <span>{children}</span>;
      if (href.startsWith('/')) {
        return <Link to={href} title={title} className={internalLinkClassName}>{children}</Link>;
      }
      if (/^https?:\/\//i.test(href)) {
        return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>;
      }
      return <a href={href} title={title}>{children}</a>;
    },
    table: ({ node, children }) => (
      <div
        {...line(node)}
        className="markdown-table-scroll"
        role="region"
        aria-label="Markdown 表格，可横向滚动"
        tabIndex={0}
      >
        <table>{children}</table>
      </div>
    ),
  };

  if (sourceLines) {
    Object.assign(common, {
      h1: ({ node, ...props }) => <h1 {...sourceLineProps(node)} {...props} />,
      h2: ({ node, ...props }) => <h2 {...sourceLineProps(node)} {...props} />,
      h3: ({ node, ...props }) => <h3 {...sourceLineProps(node)} {...props} />,
      h4: ({ node, ...props }) => <h4 {...sourceLineProps(node)} {...props} />,
      p: ({ node, ...props }) => <p {...sourceLineProps(node)} {...props} />,
      li: ({ node, ...props }) => <li {...sourceLineProps(node)} {...props} />,
      blockquote: ({ node, ...props }) => <blockquote {...sourceLineProps(node)} {...props} />,
      pre: ({ node, ...props }) => <pre {...sourceLineProps(node)} {...props} />,
    } satisfies Components);
  }

  return { ...common, ...components };
}

function sourceLineProps(node: unknown) {
  const markdownNode = node as MarkdownNode | undefined;
  const startLine = markdownNode?.position?.start?.line;
  const endLine = markdownNode?.position?.end?.line ?? startLine;
  return startLine ? { 'data-line-start': startLine, 'data-line-end': endLine } : {};
}
