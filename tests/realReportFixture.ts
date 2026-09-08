import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { buildReportFromMarkdown } from '../api/services/reportParser';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'real-reports');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as {
  reports: Array<{ date: string; id: string; file: string; sha256: string }>;
};

export function realReport(date: string) {
  const source = manifest.reports.find((item) => item.date === date);
  if (!source) throw new Error(`Missing real report fixture: ${date}`);
  const bytes = gunzipSync(fs.readFileSync(path.join(directory, source.file)));
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Original report was modified: ${date}`);
  return buildReportFromMarkdown({ id: source.id, filePath: `${date}.md`, markdown: bytes.toString('utf8') });
}
