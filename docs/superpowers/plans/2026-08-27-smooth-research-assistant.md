# Smooth Research Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the report-grounded assistant reliably answer reasoning-model requests and provide a smooth, Doubao-like multi-turn chat experience on desktop and mobile.

**Architecture:** Resolve relative-date intent before lexical retrieval, inject current/report dates into the grounded prompt, and make the OpenAI-compatible provider self-heal when a reasoning-only completion produces no answer. Keep bounded conversation sessions in browser storage and render streamed Markdown, citations, phases, filters, and recovery actions in a focused chat workspace.

**Tech Stack:** TypeScript, Express SSE, OpenRouter/OpenAI-compatible chat completions, React 18, React Markdown, Tailwind CSS, browser localStorage

**Spec:** `docs/superpowers/specs/2026-08-27-research-workbench-ai-assistant-design.md`

## Global Constraints

- AI remains optional and globally configured; no non-AI page may depend on provider availability.
- API keys and internal reasoning content never reach browser storage, responses, application logs, or test output.
- Relative dates use `Asia/Shanghai`; if the latest report predates today, the answer states both dates.
- Empty model output is never cached or rendered as a successful assistant message.
- Conversations are browser-local and capped; only bounded recent turns are sent upstream.
- Desktop and mobile layouts share one data flow and respect `prefers-reduced-motion`.
- Publish the verified commit to GitHub before fast-forwarding the server checkout.

---

### Task 1: Resolve relative-date report intent

**Files:**
- Modify: `api/services/researchRetrieval.ts`
- Modify: `api/services/aiService.ts`
- Modify: `tests/researchRetrieval.test.ts`
- Modify: `tests/aiService.test.ts`

**Interfaces:**
- Produces: `resolveResearchIntent(query, scope, chunks, now)` returning `{ scope, currentDate, latestReportDate, mode }`.
- Consumes: existing `ResearchScope`, `RetrievalChunk[]`, and `retrieveResearch`.

- [ ] **Step 1: Write the failing latest-intent test**

```ts
const intent = resolveResearchIntent('今天的报告有什么值得关注', {}, chunks, new Date('2026-08-27T08:00:00+08:00'));
assert.equal(intent.currentDate, '2026-08-27');
assert.equal(intent.latestReportDate, '2026-08-26');
assert.deepEqual(intent.scope, { from: '2026-08-26', to: '2026-08-26' });
```

Also assert that an explicit date range is preserved and “最近一周” resolves to the seven-day window ending on the newest report date.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/researchRetrieval.test.ts`

Expected: import/export failure for `resolveResearchIntent`.

- [ ] **Step 3: Implement deterministic date intent and prompt context**

Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })` for the current date. Apply automatic scope only when the user did not provide `from`/`to`. In `buildMessages`, state `当前日期` and `报告库最新日期`, and number sources from `1` so citations render as `[1]`.

- [ ] **Step 4: Run focused tests to GREEN**

Run: `npx tsx tests/researchRetrieval.test.ts && npx tsx tests/aiService.test.ts`

Expected: both PASS.

### Task 2: Recover from reasoning-only and malformed provider streams

**Files:**
- Modify: `api/services/aiProvider.ts`
- Modify: `tests/aiService.test.ts`
- Modify: `tests/aiProviderAdapters.test.ts`

**Interfaces:**
- Produces: provider streams that either yield non-empty final text or throw `AI_EMPTY_COMPLETION`/`AI_PROVIDER_ERROR`.
- Consumes: `ProviderChatInput.maxTokens` with a default final-answer budget of 2400 tokens.

- [ ] **Step 1: Write a failing reasoning-only recovery test**

Return a first mock SSE response containing `delta.reasoning`, empty `delta.content`, and `finish_reason: "length"`; return a second response containing `delta.content: "可见回答"`. Assert the collected stream equals `可见回答` and two upstream requests were made.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/aiService.test.ts`

Expected: empty answer instead of `可见回答`.

- [ ] **Step 3: Implement bounded provider recovery**

For OpenRouter send:

```ts
body.reasoning = { effort: 'low', exclude: true };
```

Use 2400 tokens initially and 3600 only for one empty retry. Parse structured SSE provider errors. Track content characters and `finish_reason`; never yield reasoning text. If both attempts are empty, throw a clear Chinese `AI_EMPTY_COMPLETION` error.

- [ ] **Step 4: Prevent empty cache entries**

In `trackedStream`, cache only when `answer.trim()` is non-empty. Preserve partial text if a stream fails after producing content.

- [ ] **Step 5: Run focused tests to GREEN**

Run: `npx tsx tests/aiService.test.ts && npx tsx tests/aiProviderAdapters.test.ts`

Expected: both PASS.

### Task 3: Add bounded multi-turn sessions and streaming states

**Files:**
- Create: `src/lib/chatSessions.ts`
- Create: `tests/chatSessions.test.ts`
- Modify: `src/hooks/useAiChat.ts`
- Modify: `api/routes/ai.ts`
- Modify: `api/services/aiService.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `ChatSession`, `readChatSessions`, `createChatSession`, `upsertSession`, and a hook exposing `sessions`, `activeSessionId`, `messages`, `phase`, `send`, `retry`, `stop`, `newChat`, `selectSession`, and `deleteSession`.
- Consumes: `/api/ai/chat` SSE events `sources`, `delta`, `done`, and `error` plus bounded `{ role, content }[]` history.

- [ ] **Step 1: Write failing storage-bound tests**

Assert corrupted JSON returns one empty session, titles come from the first user question, no more than 12 sessions and 40 messages per session survive normalization, and transient `pending` state is removed when reading persisted data.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/chatSessions.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure session utilities and hook integration**

Send at most the last eight completed messages and 12,000 total characters as history. Persist only IDs, roles, content, sources, timestamps, and titles. Update generation phase from request start, source receipt, first delta, completion, stop, and error.

- [ ] **Step 4: Add server history validation**

Accept only `user`/`assistant` roles, trim content, cap each item at 4,000 characters, cap to eight turns, and include bounded history in the provider messages and cache key.

- [ ] **Step 5: Run focused tests to GREEN**

Run: `npx tsx tests/chatSessions.test.ts && npx tsx tests/aiService.test.ts && npx tsx tests/aiStreamParser.test.ts`

Expected: all PASS.

### Task 4: Rebuild the assistant workspace and publish

**Files:**
- Modify: `src/pages/ResearchAssistant.tsx`
- Create: `src/components/assistant/AssistantMessage.tsx`
- Create: `src/components/assistant/AssistantSources.tsx`
- Create: `src/components/assistant/ChatComposer.tsx`
- Modify: `src/index.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the Task 3 chat hook and existing `AiConfigDialog`, `AiSource`, `buildReportLink`, theme variables, and route metadata.
- Produces: responsive conversation rail, collapsible filters, streamed Markdown answers, numbered source links, copy/retry/stop actions, and accessible keyboard behavior.

- [ ] **Step 1: Build the focused chat shell**

Replace the large page header and permanent filter column with a compact chat header. Desktop shows the local session rail; mobile opens it as an overlay. Keep provider/model and settings visible without exposing the key.

- [ ] **Step 2: Render smooth messages and citations**

Render assistant Markdown using `react-markdown` and `remark-gfm`. Transform only valid `[n]` citations into links for the corresponding source. Show phases before the first token, a streaming caret during generation, source cards in a collapsible section, and inline error/retry controls instead of a blank bubble.

- [ ] **Step 3: Upgrade the composer and filters**

Implement auto-growing input, Enter send, Shift+Enter newline, IME-safe key handling, stop generation, prompt suggestions, auto-follow only near the bottom, and a compact date/company/institution filter panel.

- [ ] **Step 4: Add restrained motion and accessibility**

Use 160–220ms message, drawer, filter, and source transitions. Maintain visible focus, 44px touch targets, dark-mode contrast, and reduced-motion overrides.

- [ ] **Step 5: Run complete release gates**

Run:

```bash
npm test
npm run check
npm run lint
npm run build
```

Expected: all PASS with no new warnings.

- [ ] **Step 6: Verify locally, publish, and deploy**

Browser-smoke desktop and mobile with a configured mock or live provider. Bump patch version, commit, push `main`, verify `origin/main`, then fast-forward `/opt/AnalyseStrategy`, run server tests/build, restart PM2, and verify `/api/version`, `/api/ai/status`, the public page, and one live cited chat response.
