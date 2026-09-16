import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeAtomicJson } from './atomicJson.js';

type Reservation = { id: string; tokens: number; kind: 'chat' | 'review'; actual?: number };
type Usage = { day: string; estimatedTokens: number; measuredTokens?: number; reservations?: Reservation[] };
const queues = new Map<string, Promise<unknown>>();
export function createAiUsage(file = path.resolve('data/runtime/ai-usage.json'), now = () => new Date()) {
  file = path.resolve(file);
  const day = () => now().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  async function read(): Promise<Usage> {
    try {
      const stored = JSON.parse(await fs.readFile(file, 'utf8')) as Usage;
      if (typeof stored.day !== 'string' || !Number.isSafeInteger(stored.estimatedTokens) || stored.estimatedTokens < 0 ||
        stored.reservations !== undefined && (!Array.isArray(stored.reservations) || stored.reservations.some(r => typeof r.id !== 'string' || !Number.isSafeInteger(r.tokens) || r.tokens < 1))) throw new Error('Invalid usage');
      return stored.day === day() ? stored : { day: day(), estimatedTokens: 0 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { day: day(), estimatedTokens: 0 };
      throw new Error('AI_USAGE_UNAVAILABLE');
    }
  }
  function serialize<T>(work: () => Promise<T>) {
    const previous = queues.get(file);
    const job = (async () => { await previous?.catch(() => undefined); return work(); })();
    queues.set(file, job);
    void job.finally(() => { if (queues.get(file) === job) queues.delete(file); }).catch(() => undefined);
    return job;
  }
  function reserve(tokens: number, limit: number, kind: 'chat' | 'review' = 'chat') {
    return serialize(async () => {
      const usage = await read();
      if (!Number.isSafeInteger(tokens) || tokens < 1 || usage.estimatedTokens + tokens > limit) throw new Error('AI_DAILY_BUDGET:今日 AI 额度已用完');
      const reservation = { id: randomUUID(), tokens, kind };
      // Unknown/failed requests retain their reservation. A provider-reported
      // total can settle this exact reservation without resetting other spend.
      await writeAtomicJson(file, { ...usage, estimatedTokens: usage.estimatedTokens + tokens, reservations: [...(usage.reservations ?? []), reservation] });
      return { id: reservation.id, day: usage.day };
    });
  }
  function recordActual(reservation: { id: string; day: string }, actual: number) {
    return serialize(async () => {
      if (!Number.isSafeInteger(actual) || actual < 0) throw new Error('AI_USAGE_INVALID');
      const usage = await read();
      if (usage.day !== reservation.day) return; // Previous day's reservation remains conservative.
      const row = usage.reservations?.find(r => r.id === reservation.id);
      if (!row || row.actual !== undefined) return;
      row.actual = actual;
      usage.measuredTokens = (usage.measuredTokens ?? 0) + actual;
      usage.estimatedTokens = Math.max(0, usage.estimatedTokens + actual - row.tokens);
      await writeAtomicJson(file, usage);
    });
  }
  return { read, reserve, recordActual };
}
