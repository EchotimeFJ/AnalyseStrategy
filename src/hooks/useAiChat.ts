import { useRef, useState } from 'react';
import { resolveApiPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { parseSseFrames } from '@/lib/sse';
import {
  buildChatHistory,
  createChatSession,
  readChatSessionState,
  upsertSession,
  type ChatMessage,
  type ChatSession,
  type ChatSessionState,
} from '@/lib/chatSessions';
import type { AiSource } from '@/types';

export type { ChatMessage, ChatSession } from '@/lib/chatSessions';
export type ChatPhase = 'idle' | 'retrieving' | 'analyzing' | 'generating';

const STORAGE_KEY = 'analyse-strategy:research-assistant-history';

export function useAiChat() {
  const [state, setState] = useState<ChatSessionState>(readInitialState);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];
  const messages = activeSession?.messages ?? [];

  async function send(question: string, scope: Record<string, string | undefined>) {
    const content = question.trim();
    if (!content || abortRef.current || !activeSession) return;
    const history = buildChatHistory(activeSession.messages);
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', sources: [], pending: true };
    replaceMessages(activeSession.id, [...activeSession.messages, user, assistant]);
    await streamAnswer(activeSession.id, assistant.id, content, scope, history);
  }

  async function retry(assistantId: string, scope: Record<string, string | undefined>) {
    if (abortRef.current || !activeSession) return;
    const assistantIndex = activeSession.messages.findIndex((message) => message.id === assistantId && message.role === 'assistant');
    if (assistantIndex < 1) return;
    const userIndex = findPreviousUser(activeSession.messages, assistantIndex);
    if (userIndex < 0) return;
    const user = activeSession.messages[userIndex];
    const history = buildChatHistory(activeSession.messages.slice(0, userIndex));
    const replacement: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', sources: [], pending: true };
    replaceMessages(activeSession.id, [...activeSession.messages.slice(0, userIndex + 1), replacement]);
    await streamAnswer(activeSession.id, replacement.id, user.content, scope, history);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    stop();
    const session = createChatSession();
    updateState((current) => upsertSession(current, session));
    setPhase('idle');
  }

  function selectSession(id: string) {
    if (id === state.activeSessionId) return;
    stop();
    updateState((current) => current.sessions.some((session) => session.id === id)
      ? { ...current, activeSessionId: id }
      : current);
    setPhase('idle');
  }

  function deleteSession(id: string) {
    stop();
    updateState((current) => {
      const sessions = current.sessions.filter((session) => session.id !== id);
      if (sessions.length) {
        return {
          activeSessionId: current.activeSessionId === id ? sessions[0].id : current.activeSessionId,
          sessions,
        };
      }
      const fallback = createChatSession();
      return { activeSessionId: fallback.id, sessions: [fallback] };
    });
    setPhase('idle');
  }

  function clear() {
    if (!activeSession) return;
    stop();
    replaceMessages(activeSession.id, []);
    setPhase('idle');
  }

  async function streamAnswer(
    sessionId: string,
    assistantId: string,
    question: string,
    scope: Record<string, string | undefined>,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('retrieving');
    let receivedText = false;
    try {
      const response = await fetch(resolveApiPath('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, scope: compactScope(scope), history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(getApiErrorMessage(payload, response.status));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          const payload = JSON.parse(event.data) as { text?: string; sources?: AiSource[]; message?: string };
          if (event.event === 'sources') {
            patchAssistant(sessionId, assistantId, { sources: payload.sources ?? [] });
            setPhase('analyzing');
          }
          if (event.event === 'delta' && payload.text) {
            receivedText = true;
            appendAssistant(sessionId, assistantId, payload.text);
            setPhase('generating');
          }
          if (event.event === 'error') throw new Error(payload.message ?? '回答中断，请重新生成');
        }
        if (done) break;
      }
      if (!receivedText) throw new Error('模型没有返回正文，请重新生成或更换模型');
      patchAssistant(sessionId, assistantId, { pending: false, failed: false });
    } catch (reason) {
      const stopped = reason instanceof Error && reason.name === 'AbortError';
      const message = stopped ? '已停止生成' : reason instanceof Error ? reason.message : String(reason);
      patchAssistant(sessionId, assistantId, {
        pending: false,
        failed: !stopped,
        stopped,
        error: message,
      });
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  }

  function replaceMessages(sessionId: string, nextMessages: ChatMessage[]) {
    updateSession(sessionId, (session) => ({ ...session, messages: nextMessages }));
  }

  function patchAssistant(sessionId: string, id: string, patch: Partial<ChatMessage>) {
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) => message.id === id ? { ...message, ...patch } : message),
    }));
  }

  function appendAssistant(sessionId: string, id: string, text: string) {
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) => message.id === id
        ? { ...message, content: message.content + text }
        : message),
    }));
  }

  function updateSession(id: string, updater: (session: ChatSession) => ChatSession) {
    updateState((current) => {
      const session = current.sessions.find((item) => item.id === id);
      if (!session) return current;
      const nextSession = updater({ ...session, updatedAt: new Date().toISOString() });
      const next = upsertSession(current, nextSession);
      return { ...next, activeSessionId: current.activeSessionId };
    });
  }

  function updateState(updater: (current: ChatSessionState) => ChatSessionState) {
    setState((current) => {
      const next = updater(current);
      persist(next);
      return next;
    });
  }

  return {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    messages,
    phase,
    streaming: phase !== 'idle',
    send,
    retry,
    stop,
    newChat,
    selectSession,
    deleteSession,
    clear,
  };
}

function findPreviousUser(messages: ChatMessage[], beforeIndex: number) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

function compactScope(scope: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value));
}

function readInitialState() {
  const fallback = createChatSession();
  return readChatSessionState(localStorage.getItem(STORAGE_KEY), fallback);
}

function persist(state: ChatSessionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Browser history is optional; chat continues when storage is unavailable.
  }
}
