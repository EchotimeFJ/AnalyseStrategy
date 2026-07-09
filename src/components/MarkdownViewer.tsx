import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownViewer({ markdown }: { markdown: string }) {
  const prepared = markdown.replace(/==([^=\n]+)==/g, '**$1**');
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepared}</ReactMarkdown>
    </article>
  );
}
