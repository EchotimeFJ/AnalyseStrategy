import path from 'node:path';

// All API and background consumers in the single server process share slots.
// A separate worker process must not be started without a shared lease backend.
const groups = new Map<string, { chat: number; review: number }>();
export function aiResourceGroup(file = path.resolve('data/runtime/ai-usage.json')) {
  const key = path.resolve(file);
  let group = groups.get(key);
  if (!group) { group = { chat: 0, review: 0 }; groups.set(key, group); }
  return {
    active: () => group!.chat + group!.review,
    acquire(kind: 'chat' | 'review', limit: number) {
      const total = group!.chat + group!.review;
      if (total >= limit || kind === 'review' && (group!.review >= 1 || limit > 1 && total >= limit - 1)) {
        throw new Error('AI_BUSY:当前 AI 任务较多，请稍后重试');
      }
      group![kind] += 1;
      let released = false;
      return () => { if (!released) { released = true; group![kind] -= 1; } };
    },
  };
}
