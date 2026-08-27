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
import researchRoutes from './routes/research.js'
import aiRoutes from './routes/ai.js'

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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
  const isIndexUnavailable = 'code' in error && error.code === 'ENOENT'
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
