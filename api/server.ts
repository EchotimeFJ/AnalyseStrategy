/**
 * local server entry file, for local development
 */
import 'dotenv/config';
import app from './app.js';
import { getServerPort } from './runtimeConfig.js';
import { dataUpdater } from './services/dataUpdate.js';
import { startReviewScheduler } from './services/reviewScheduler.js';
let reviewScheduler: Awaited<ReturnType<typeof startReviewScheduler>> | undefined;

/**
 * start server with port
 */
const PORT = getServerPort();

const server = app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`Server ready on port ${PORT}`);
  if (process.env.REPORT_AUTO_UPDATE !== 'false') {
    dataUpdater.start();
    void startReviewScheduler(async () => { await dataUpdater.reindex(); }).then(scheduler => {
      reviewScheduler = scheduler;
      dataUpdater.setAfterUpdate(scheduler.wake);
      scheduler.wake();
    }).catch(() => console.error('[research-review] initialization failed; preserving published facts while source checks continue'));
  }
});

/**
 * close server
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received');
  await reviewScheduler?.stop();
  await dataUpdater.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received');
  await reviewScheduler?.stop();
  await dataUpdater.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
