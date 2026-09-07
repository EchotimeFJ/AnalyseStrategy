import 'dotenv/config'

/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { publicJsonReplacer, requireAdmin, requestLimit, validateQuery } from './security.js'
import researchRoutes from './routes/research.js'
import aiRoutes from './routes/ai.js'

const app: express.Application = express()

app.disable('x-powered-by')
app.set('query parser', 'simple')
app.set('json replacer', publicJsonReplacer)
app.set('trust proxy', process.env.TRUST_PROXY_LOOPBACK === 'true' ? 'loopback' : false)
app.use(helmet())
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
app.use(cors({ origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.includes(origin))) }))
app.use('/api', requestLimit(120), validateQuery)
app.use('/api/search', requestLimit(20))
app.use('/api/export', requestLimit(4))
app.use('/api/ai/chat', requestLimit(6))
app.use('/api/ai/config', requestLimit(5))
// Deny writes before parsing bodies or doing any expensive work. An absent
// administrator secret disables management rather than opening it to visitors.
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !(req.method === 'POST' && req.path === '/ai/chat')) {
    requireAdmin(req, res, next)
  } else next()
})
app.use(express.json({ limit: '64kb', strict: true }))

/**
 * API Routes
 */
app.use('/api', researchRoutes)
app.use('/api/ai', aiRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (_req: Request, res: Response): void => {
    void _req
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  void req
  void next
  res.setHeader('Cache-Control', 'no-store')
  const isIndexUnavailable = 'code' in error && error.code === 'ENOENT'
  const parseStatus = 'status' in error ? error.status : undefined
  if (parseStatus === 400 || parseStatus === 413) {
    res.status(parseStatus).json({ success: false, error: { code: 'INVALID_BODY', message: parseStatus === 413 ? '请求内容过大' : '请求格式不正确' } })
    return
  }
  res.status(500).json({
    success: false,
    error: isIndexUnavailable
      ? {
          code: 'INDEX_UNAVAILABLE',
          message: '报告目录不可用，请检查数据源配置后重试',
        }
      : {
          code: 'INTERNAL_ERROR',
          message: '服务暂时不可用，请稍后重试',
        },
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  void req
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
