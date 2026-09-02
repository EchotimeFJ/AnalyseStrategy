import assert from 'node:assert/strict';

import { buildReportFromMarkdown, createTagSearch } from '../api/services/reportParser';

const reports = [
  buildReportFromMarkdown({
    id: 'report-1',
    filePath: '/reports/2026-09-01.md',
    markdown: '普通高盛\n#高盛 #行业/半导体 #AI\n`#高盛`\n```bash\n#高盛\n```',
  }),
  buildReportFromMarkdown({
    id: 'report-2',
    filePath: '/reports/2026-09-02.md',
    markdown: '#行业/软件 #ai',
  }),
  buildReportFromMarkdown({
    id: 'report-3',
    filePath: '/reports/2026-09-03.md',
    markdown: '#行业化 #1984',
  }),
];

const searchTags = createTagSearch(reports);

assert.deepEqual(
  searchTags('#高盛').map(({ reportId, lineNumber }) => ({ reportId, lineNumber })),
  [{ reportId: 'report-1', lineNumber: 2 }],
);
assert.deepEqual(searchTags('#行业').map(({ reportId }) => reportId), ['report-1', 'report-2']);
assert.deepEqual(searchTags('#AI').map(({ reportId }) => reportId), ['report-1', 'report-2']);
assert.deepEqual(searchTags('#1984'), []);

console.log('tag search tests passed');
