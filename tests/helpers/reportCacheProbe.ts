import { ensureIndex, getOverview, getReportById } from '../../api/services/reportIndex';

const index = await ensureIndex();
const overview = await getOverview();
const report = await getReportById(index.reports[0]?.id ?? 'missing');
console.log(JSON.stringify({
  version: index.version,
  cache: index.cache,
  entityCount: index.entities.size,
  reportCount: overview.reportCount,
  markdown: report?.markdown,
  lines: index.reports[0]?.lines,
  institutionContent: index.reports[0]?.institutions.map((block) => block.content),
}));
