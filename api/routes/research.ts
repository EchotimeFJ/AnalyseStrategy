import { Router, type Request, type Response } from 'express';
import {
  ensureIndex,
  exportData,
  getInstitutionView,
  getRadar,
  getReportById,
  getReports,
  getSummary,
  getTargetProfile,
  getWatchlistView,
  rebuildIndex,
  searchReports,
} from '../services/reportIndex.js';
import {
  addAlias,
  addWatchItem,
  readUserConfig,
  removeWatchItem,
} from '../services/localConfig.js';
import { pullStrategyRepository } from '../services/gitUpdater.js';

const router = Router();

router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getSummary() });
});

router.get('/reports', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await getReports({
      year: asString(req.query.year),
      institution: asString(req.query.institution),
    }),
  });
});

router.get('/reports/:id', async (req: Request, res: Response): Promise<void> => {
  const report = await getReportById(req.params.id);
  if (!report) {
    res.status(404).json({ success: false, error: '报告不存在' });
    return;
  }
  res.json({ success: true, data: report });
});

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await searchReports({
      q: asString(req.query.q),
      from: asString(req.query.from),
      to: asString(req.query.to),
      institution: asString(req.query.institution),
      mode: asString(req.query.mode),
    }),
  });
});

router.get('/targets', async (req: Request, res: Response): Promise<void> => {
  const query = asString(req.query.q);
  if (!query) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: await getTargetProfile(query) });
});

router.get('/radar', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await getRadar({
      from: asString(req.query.from),
      to: asString(req.query.to),
    }),
  });
});

router.get('/institutions', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await getInstitutionView({
      target: asString(req.query.target),
      institution: asString(req.query.institution),
    }),
  });
});

router.get('/watchlist', async (_req: Request, res: Response): Promise<void> => {
  const config = await readUserConfig();
  res.json({
    success: true,
    data: {
      watchlist: config.watchlist,
      aliases: config.aliases,
      items: await getWatchlistView(config.watchlist),
    },
  });
});

router.post('/watchlist', async (req: Request, res: Response): Promise<void> => {
  const config = await addWatchItem({
    name: String(req.body.name ?? ''),
    aliases: Array.isArray(req.body.aliases) ? req.body.aliases : [],
    note: req.body.note,
  });
  res.json({ success: true, data: config });
});

router.delete('/watchlist/:id', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await removeWatchItem(req.params.id) });
});

router.post('/aliases', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await addAlias({
      canonical: String(req.body.canonical ?? ''),
      aliases: Array.isArray(req.body.aliases) ? req.body.aliases : [],
    }),
  });
});

router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const type = asString(req.query.type) ?? 'summary';
  const q = asString(req.query.q);
  const content = await exportData(type, q);
  const isCsv = type === 'target' || type === 'search';
  res.setHeader('Content-Type', isCsv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  res.send(content);
});

router.get('/index', async (_req: Request, res: Response): Promise<void> => {
  const index = await ensureIndex();
  res.json({
    success: true,
    data: {
      sourceDir: index.sourceDir,
      indexedAt: index.indexedAt,
      reportCount: index.reports.length,
      mentionCount: index.mentions.length,
      errors: index.errors,
    },
  });
});

router.post('/reindex', async (_req: Request, res: Response): Promise<void> => {
  const index = await rebuildIndex();
  res.json({
    success: true,
    data: {
      sourceDir: index.sourceDir,
      indexedAt: index.indexedAt,
      reportCount: index.reports.length,
      mentionCount: index.mentions.length,
      errors: index.errors,
    },
  });
});

router.post('/update-strategy', async (_req: Request, res: Response): Promise<void> => {
  const pull = await pullStrategyRepository();
  if (!pull.success) {
    res.status(500).json({ success: false, error: pull.stderr, data: pull });
    return;
  }

  const index = await rebuildIndex();
  res.json({
    success: true,
    data: {
      pull,
      index: {
        sourceDir: index.sourceDir,
        indexedAt: index.indexedAt,
        reportCount: index.reports.length,
        mentionCount: index.mentions.length,
        errors: index.errors,
      },
    },
  });
});

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

export default router;
