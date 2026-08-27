import type { AiSource } from '@/types';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSource[];
  pending?: boolean;
  failed?: boolean;
  stopped?: boolean;
  error?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ChatSessionState = {
  activeSessionId: string;
  sessions: ChatSession[];
};

const MAX_SESSIONS = 12;
const MAX_MESSAGES = 40;

export function createChatSession(id = crypto.randomUUID(), now = new Date().toISOString()): ChatSession {
  return { id, title: '新对话', createdAt: now, updatedAt: now, messages: [] };
}

export function deriveSessionTitle(messages: ChatMessage[]) {
  const question = messages.find((message) => message.role === 'user' && message.content.trim())?.content
    .replace(/\s+/g, ' ')
    .trim();
  if (!question) return '新对话';
  return question.length > 28 ? `${question.slice(0, 28)}…` : question;
}

export function readChatSessionState(raw: string | null, fallback: ChatSession): ChatSessionState {
  try {
    const parsed = JSON.parse(raw ?? 'null') as unknown;
    const candidate = Array.isArray(parsed)
      ? [{ ...fallback, messages: parsed }]
      : parsed && typeof parsed === 'object' && 'sessions' in parsed
        ? (parsed as { sessions?: unknown }).sessions
        : [];
    const sessions = (Array.isArray(candidate) ? candidate : [])
      .map(normalizeSession)
      .filter((session): session is ChatSession => Boolean(session))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SESSIONS);
    if (!sessions.length) return { activeSessionId: fallback.id, sessions: [fallback] };
    const requestedActive = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'activeSessionId' in parsed
      ? String((parsed as { activeSessionId?: unknown }).activeSessionId ?? '')
      : sessions[0].id;
    return {
      activeSessionId: sessions.some((session) => session.id === requestedActive) ? requestedActive : sessions[0].id,
      sessions,
    };
  } catch {
    return { activeSessionId: fallback.id, sessions: [fallback] };
  }
}

export function upsertSession(state: ChatSessionState, session: ChatSession): ChatSessionState {
  const next = {
    ...session,
    title: deriveSessionTitle(session.messages),
    messages: session.messages.slice(-MAX_MESSAGES),
  };
  return {
    activeSessionId: next.id,
    sessions: [next, ...state.sessions.filter((item) => item.id !== next.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_SESSIONS),
  };
}

export function buildChatHistory(messages: ChatMessage[]) {
  const candidates = messages
    .filter((message) => !message.pending && !message.failed && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 4_000) }))
    .slice(-8);
  const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let totalChars = 0;
  for (let index = candidates.length - 1; index >= 0 && totalChars < 12_000; index -= 1) {
    const content = candidates[index].content.slice(0, 12_000 - totalChars);
    if (!content) continue;
    selected.unshift({ ...candidates[index], content });
    totalChars += content.length;
  }
  return selected;
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ChatSession>;
  if (typeof input.id !== 'string' || !input.id) return null;
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : new Date(0).toISOString();
  const updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : createdAt;
  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .map(normalizeMessage)
    .filter((message): message is ChatMessage => Boolean(message))
    .slice(-MAX_MESSAGES);
  return {
    id: input.id,
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : deriveSessionTitle(messages),
    createdAt,
    updatedAt,
    messages,
  };
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ChatMessage>;
  if ((input.role !== 'user' && input.role !== 'assistant') || typeof input.content !== 'string' || !input.content.trim()) return null;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    role: input.role,
    content: input.content,
    sources: Array.isArray(input.sources) ? input.sources : undefined,
    pending: false,
    failed: Boolean(input.failed),
    stopped: Boolean(input.stopped),
    error: typeof input.error === 'string' ? input.error : undefined,
  };
}
