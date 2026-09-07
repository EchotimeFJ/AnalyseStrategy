import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomicJson } from './atomicJson.js';

type Usage = { day: string; estimatedTokens: number };
const queues = new Map<string, Promise<unknown>>();

export function createAiUsage(file = path.resolve('data/runtime/ai-usage.json'), now = () => new Date()) {
  const day = () => now().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  async function read(): Promise<Usage> {
    try {
      const stored = JSON.parse(await fs.readFile(file, 'utf8')) as Usage;
      if (typeof stored.day !== 'string' || !Number.isSafeInteger(stored.estimatedTokens) || stored.estimatedTokens < 0) throw new Error('Invalid AI usage ledger');
      return stored.day === day() ? stored : { day: day(), estimatedTokens: 0 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { day: day(), estimatedTokens: 0 };
      // A corrupt or unreadable ledger must never silently reset the budget.
      throw new Error('AI_USAGE_UNAVAILABLE');
    }
  }
  function reserve(tokens: number, limit: number) {
    const previous = queues.get(file);
    const job = (async () => {
      await previous?.catch(() => undefined);
      const usage = await read();
      if (!Number.isSafeInteger(tokens) || tokens < 1 || usage.estimatedTokens + tokens > limit) throw new Error('AI_DAILY_BUDGET:今日 AI 额度已用完');
      await writeAtomicJson(file, { day: usage.day, estimatedTokens: usage.estimatedTokens + tokens });
    })();
    queues.set(file, job);
    void job.finally(() => { if (queues.get(file) === job) queues.delete(file); }).catch(() => undefined);
    return job;
  }
  return { read, reserve };
}
