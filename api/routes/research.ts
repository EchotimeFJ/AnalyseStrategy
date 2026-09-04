import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  diffReportChanges,
  ensureIndex,
  exportData,
  getInstitutionView,
  getCompanyProfiles,
  getDataQuality,
  getOverview,
  getRadar,
  getReportById,
  getReportOverview,
  getReports,
  getSummary,
  getTargetProfile,
  getWatchlistView,
  rebuildIndex,
  searchReports,
  type IndexState,
  type ReportChangeSet,
} from '../services/reportIndex.js';
import {
  addAlias,
  addWatchItem,
  readUserConfig,
  removeWatchItem,
} from '../services/localConfig.js';
import { pullStrategyRepository } from '../services/gitUpdater.js';
import { getAppVersion } from '../services/version.js';
import { sendCachedReport } from '../services/reportHttpCache.js';

const router = Router();

router.get('/version', (_req: Request, res: Response): void => {
  res.json({ success: true, data: getAppVersion() });
});

router.get('/overview', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  await sendCachedReport(req, res, index, () => getOverview(index));
}));

router.get('/summary', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getSummary() });
}));

router.get('/reports', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  await sendCachedReport(req, res, index, () => getReports({
    year: asString(req.query.year), institution: asString(req.query.institution),
  }, index));
}));

router.get('/reports/:id', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  if (!index.reports.some((report) => report.id === req.params.id)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ success: false, error: '报告不存在' });
    return;
  }
  await sendCachedReport(req, res, index, () => getReportById(req.params.id, index));
}));

router.get('/reports/:id/overview', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  const overview = await getReportOverview(req.params.id, index);
  if (!overview) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ success: false, error: { code: 'REPORT_NOT_FOUND', message: '报告不存在' } });
    return;
  }
  await sendCachedReport(req, res, index, () => Promise.resolve(overview));
}));

router.get('/companies', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getCompanyProfiles(asString(req.query.q) ?? '') });
}));

router.get('/data-quality', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getDataQuality() });
}));

router.get('/search', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await searchReports({
      q: asString(req.query.q),
      from: asString(req.query.from),
      to: asString(req.query.to),
      institution: asString(req.query.institution),
      mode: asString(req.query.mode),
      raw: asBoolean(req.query.raw),
    }),
  });
}));

router.get('/targets', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const query = asString(req.query.q);
  if (!query) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: await getTargetProfile(query) });
}));

router.get('/radar', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await getRadar({
      from: asString(req.query.from),
      to: asString(req.query.to),
    }),
  });
}));

router.get('/institutions', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await getInstitutionView({
      target: asString(req.query.target),
      institution: asString(req.query.institution),
    }),
  });
}));

router.get('/watchlist', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  const config = await readUserConfig();
  res.json({
    success: true,
    data: {
      watchlist: config.watchlist,
      aliases: config.aliases,
      items: await getWatchlistView(config.watchlist),
    },
  });
}));

router.post('/watchlist', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const config = await addWatchItem({
    name: String(req.body.name ?? ''),
    aliases: Array.isArray(req.body.aliases) ? req.body.aliases : [],
    note: req.body.note,
  });
  res.json({ success: true, data: config });
}));

router.delete('/watchlist/:id', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await removeWatchItem(req.params.id) });
}));

router.post('/aliases', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await addAlias({
      canonical: String(req.body.canonical ?? ''),
      aliases: Array.isArray(req.body.aliases) ? req.body.aliases : [],
    }),
  });
}));

router.get('/export', asyncRoute(async (req: Request, res: Response): Promise<void> => {
  const type = asString(req.query.type) ?? 'summary';
  const q = asString(req.query.q);
  const content = await exportData(type, q);
  const isCsv = type === 'target' || type === 'search';
  res.setHeader('Content-Type', isCsv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  res.send(content);
}));

router.get('/index', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  res.json({ success: true, data: toIndexStatus(index) });
}));

router.post('/reindex', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  const previous = await ensureIndex({ checkSource: false });
  const index = await rebuildIndex();
  const reportChanges = diffReportChanges(previous, index);
  res.json({
    success: true,
    data: toIndexStatus(index, reportChanges),
  });
}));

router.post('/update-strategy', asyncRoute(async (_req: Request, res: Response): Promise<void> => {
  const previous = await ensureIndex({ checkSource: false });
  const pull = await pullStrategyRepository();
  if (!pull.success) {
    res.status(500).json({ success: false, error: pull.stderr, data: pull });
    return;
  }

  const index = await rebuildIndex();
  const reportChanges = diffReportChanges(previous, index);
  res.json({
    success: true,
    data: {
      pull,
      index: toIndexStatus(index, reportChanges),
    },
  });
}));

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function toIndexStatus(index: IndexState, reportChanges?: ReportChangeSet) {
  return {
    sourceDir: index.sourceDir,
    indexedAt: index.indexedAt,
    reportCount: index.reports.length,
    mentionCount: index.mentions.length,
    errors: index.errors,
    qualityIssues: index.qualityIssues,
    indexVersion: index.version,
    cache: index.cache,
    reportChanges,
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function asBoolean(value: unknown): boolean {
  return value === 'true' || value === '1';
}

export default router;
