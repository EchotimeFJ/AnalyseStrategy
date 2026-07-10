const SETEXT_HEADING_EQUALS_LINE = /^ {0,3}={2,}\s*$/;

export function protectReportMarkdown(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => (SETEXT_HEADING_EQUALS_LINE.test(line) ? line.replace('=', '\\=') : line))
    .join('\n');
}
