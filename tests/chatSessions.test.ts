import assert from 'node:assert/strict';
import {
  buildChatHistory,
  createChatSession,
  deriveSessionTitle,
  readChatSessionState,
  upsertSession,
  type ChatMessage,
} from '../src/lib/chatSessions';

const fallback = createChatSession('fallback', '2026-08-27T08:00:00.000Z');
assert.deepEqual(readChatSessionState('{broken json', fallback), {
  activeSessionId: 'fallback',
  sessions: [fallback],
});

assert.equal(
  deriveSessionTitle([{ id: 'u1', role: 'user', content: '  今天有哪些真正值得关注的买入观点？  ' }]),
  '今天有哪些真正值得关注的买入观点？',
);

const manySessions = Array.from({ length: 13 }, (_, sessionIndex) => ({
  id: `session-${sessionIndex}`,
  title: '新对话',
  createdAt: `2026-08-${String(sessionIndex + 1).padStart(2, '0')}T00:00:00.000Z`,
  updatedAt: `2026-08-${String(sessionIndex + 1).padStart(2, '0')}T00:00:00.000Z`,
  messages: Array.from({ length: 42 }, (_, messageIndex): ChatMessage => ({
    id: `message-${sessionIndex}-${messageIndex}`,
    role: messageIndex % 2 ? 'assistant' : 'user',
    content: messageIndex === 41 ? '' : `消息 ${messageIndex}`,
    pending: messageIndex >= 40,
  })),
}));
const normalized = readChatSessionState(JSON.stringify({
  activeSessionId: 'session-12',
  sessions: manySessions,
}), fallback);
assert.equal(normalized.sessions.length, 12);
assert.equal(normalized.sessions[0].id, 'session-12');
assert.ok(normalized.sessions.every((session) => session.messages.length <= 40));
assert.ok(normalized.sessions.flatMap((session) => session.messages).every((message) => !message.pending));
assert.ok(normalized.sessions.flatMap((session) => session.messages).every((message) => message.content));

const older = createChatSession('older', '2026-08-26T08:00:00.000Z');
const updated = {
  ...older,
  updatedAt: '2026-08-27T09:00:00.000Z',
  messages: [{ id: 'u2', role: 'user' as const, content: '鸣鸣很忙有什么风险？' }],
};
const upserted = upsertSession({ activeSessionId: fallback.id, sessions: [fallback, older] }, updated);
assert.equal(upserted.activeSessionId, 'older');
assert.equal(upserted.sessions[0].id, 'older');
assert.equal(upserted.sessions[0].title, '鸣鸣很忙有什么风险？');

const history = buildChatHistory([
  ...Array.from({ length: 9 }, (_, index): ChatMessage => ({
    id: `history-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: `${index}:${'答'.repeat(2_000)}`,
  })),
  { id: 'pending', role: 'assistant', content: '尚未完成', pending: true },
  { id: 'failed', role: 'assistant', content: '失败内容', failed: true },
]);
assert.ok(history.length <= 8);
assert.ok(history.every((message) => !message.content.includes('尚未完成') && !message.content.includes('失败内容')));
assert.ok(history.reduce((total, message) => total + message.content.length, 0) <= 12_000);
assert.equal(history.at(-1)?.content.startsWith('8:'), true);

console.log('chat session tests passed');
