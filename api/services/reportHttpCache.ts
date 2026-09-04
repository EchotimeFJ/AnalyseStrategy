import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import type { IndexState } from './reportIndex.js';

const compress = promisify(gzip);
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 128;
type Entry = { identity: Buffer; gzip: Buffer; etag: string };
type Generation = { entries: Map<string, Promise<Entry>>; sizes: Map<string, number>; bytes: number };
const generations = new WeakMap<IndexState, Generation>();

// The captured immutable index object is the cache generation. An old request can
// finish safely after a rebuild, without overwriting the new generation's cache.
export async function sendCachedReport(
  req: Request,
  res: Response,
  index: IndexState,
  load: () => Promise<unknown>,
): Promise<void> {
  let generation = generations.get(index);
  if (!generation) {
    generation = { entries: new Map(), sizes: new Map(), bytes: 0 };
    generations.set(index, generation);
  }
  const key = req.originalUrl;
  let pending = generation.entries.get(key);
  const hit = Boolean(pending);
  if (!pending) {
    const target = generation;
    pending = (async () => {
      const identity = Buffer.from(JSON.stringify({ success: true, data: await load() }));
      const compressed = await compress(identity);
      return {
        identity,
        gzip: compressed,
        etag: `W/"${createHash('sha256').update(index.version ?? '').update(identity).digest('hex')}"`,
      };
    })();
    target.entries.set(key, pending);
    const ownPending = pending;
    void pending.then((entry) => {
      if (target.entries.get(key) !== ownPending) return;
      const size = entry.identity.length + entry.gzip.length;
      target.sizes.set(key, size);
      target.bytes += size;
      trim(target);
    }, () => {
      if (target.entries.get(key) === ownPending) target.entries.delete(key);
    });
    trim(target);
  } else {
    // Refresh insertion order for bounded LRU eviction.
    generation.entries.delete(key);
    generation.entries.set(key, pending);
  }
  const entry = await pending;
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('ETag', entry.etag);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Report-Cache', hit ? 'HIT' : 'MISS');
  res.vary('Accept-Encoding');
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  const encoding = req.acceptsEncodings('gzip', 'identity');
  if (!encoding) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(406).end();
    return;
  }
  const body = encoding === 'gzip' ? entry.gzip : entry.identity;
  if (encoding === 'gzip') res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', body.length);
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function trim(generation: Generation) {
  while (generation.entries.size > MAX_ENTRIES || generation.bytes > MAX_BYTES) {
    const key = generation.entries.keys().next().value;
    if (key === undefined) break;
    generation.entries.delete(key);
    generation.bytes -= generation.sizes.get(key) ?? 0;
    generation.sizes.delete(key);
  }
}
