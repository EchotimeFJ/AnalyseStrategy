import { useRef, useState } from 'react';
import { resolveApiPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { parseSseFrames } from '@/lib/sse';
import type { AiSource } from '@/types';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSource[];
  pending?: boolean;
};

const STORAGE_KEY = 'analyse-strategy:research-assistant-history';

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(readMessages);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function send(question: string, scope: Record<string, string | undefined>) {
    if (!question.trim() || abortRef.current) return;
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question.trim() };
    const assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', sources: [], pending: true };
    setError('');
    updateMessages((current) => [...current, user, assistant]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(resolveApiPath('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: user.content, scope: compactScope(scope) }),
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
          if (event.event === 'sources') patchAssistant(assistant.id, { sources: payload.sources ?? [] });
          if (event.event === 'delta') appendAssistant(assistant.id, payload.text ?? '');
          if (event.event === 'error') throw new Error(payload.message ?? '回答中断');
        }
        if (done) break;
      }
      patchAssistant(assistant.id, { pending: false });
    } catch (reason) {
      const message = reason instanceof Error && reason.name === 'AbortError' ? '已停止生成' : reason instanceof Error ? reason.message : String(reason);
      setError(message);
      patchAssistant(assistant.id, { pending: false, content: message === '已停止生成' ? '生成已停止，已保留上方内容。' : '' }, true);
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clear() {
    abortRef.current?.abort();
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  function updateMessages(updater: (current: ChatMessage[]) => ChatMessage[]) {
    setMessages((current) => {
      const next = updater(current).slice(-30);
      persist(next);
      return next;
    });
  }

  function patchAssistant(id: string, patch: Partial<ChatMessage>, keepExistingContent = false) {
    updateMessages((current) => current.map((message) => message.id === id
      ? { ...message, ...patch, content: keepExistingContent && message.content ? message.content : patch.content ?? message.content }
      : message));
  }

  function appendAssistant(id: string, text: string) {
    updateMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + text } : message));
  }

  return { messages, error, streaming: Boolean(abortRef.current), send, stop, clear };
}

function compactScope(scope: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value));
}

function readMessages(): ChatMessage[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(-30).map((message) => ({ ...message, pending: false })) : [];
  } catch {
    return [];
  }
}

function persist(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources,
    }))));
  } catch {
    // Browser history is optional; chat continues when storage is unavailable.
  }
}
