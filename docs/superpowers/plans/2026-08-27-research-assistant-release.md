# Research Assistant and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, globally configured report-grounded AI assistant with citations and safety limits, then publish the verified `0.1.0` release through GitHub before deploying it to the server.

**Architecture:** Store only encrypted provider configuration on the server, retrieve bounded source chunks from the existing structured index, stream an OpenAI-compatible response through an isolated provider adapter, and keep browser-local conversations. Release artifacts expose version/commit/build metadata and use a GitHub-first, fast-forward-only server deployment.

**Tech Stack:** Node.js native `crypto` and `fetch`, Express SSE, React, TypeScript, PM2, Nginx, Git/GitHub

---

### Task 1: Protect global AI configuration

**Files:**
- Create: `api/services/aiConfig.ts`
- Create: `api/services/secretStore.ts`
- Create: `tests/aiConfig.test.ts`
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Write failing secret-storage tests**

Test all of the following:

```ts
assert.equal(maskApiKey('sk-1234567890'), '••••7890');
assert.equal(decryptSecret(encryptSecret('sk-secret', key), key), 'sk-secret');
await assert.rejects(saveAiConfig({ apiKey: 'sk-secret' }), /AI_CONFIG_SECRET/);
assert.equal(JSON.stringify(publicConfig).includes('sk-secret'), false);
```

Also assert wrong admin token rejection and environment-only configuration when no encryption key exists.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/aiConfig.test.ts`

- [ ] **Step 3: Implement AES-256-GCM storage**

`secretStore.ts` must export:

```ts
export function encryptSecret(value: string, keyMaterial: string): EncryptedValue;
export function decryptSecret(value: EncryptedValue, keyMaterial: string): string;
export function maskApiKey(value: string): string;
```

Derive a fixed-length key with SHA-256, generate a random 12-byte IV, and store `{ algorithm, iv, tag, ciphertext }`. Never log plaintext or include it in thrown errors.

- [ ] **Step 4: Implement server-level configuration**

`aiConfig.ts` must support provider name, base URL, model, encrypted key, timeout, daily token budget, and concurrency. Runtime file: `data/runtime/ai-config.json`. Ignore `data/runtime/` in Git. Environment variables override stored values.

Mutating configuration requires the `AI_CONFIG_ADMIN_TOKEN`. If `AI_CONFIG_SECRET` is absent, a provided API key can be tested for the current request but cannot be persisted.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx tests/aiConfig.test.ts`

Commit: `feat(ai): secure global provider configuration`

### Task 2: Build bounded report retrieval

**Files:**
- Create: `api/services/researchRetrieval.ts`
- Create: `tests/researchRetrieval.test.ts`
- Modify: `api/services/reportIndex.ts`

- [ ] **Step 1: Write failing retrieval tests**

Verify security/date/institution scopes, source-line preservation, deduplication, maximum chunk count, maximum character budget, and that report text containing instructions is returned only as quoted source data.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/researchRetrieval.test.ts`

- [ ] **Step 3: Generate chunks from parsed segments**

```ts
export interface RetrievalChunk {
  id: string;
  reportId: string;
  date: string;
  institution: string;
  securityKey: string | null;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

export function retrieveResearch(
  query: string,
  scope: ResearchScope,
  options?: { maxChunks?: number; maxChars?: number },
): RetrievalResult;
```

Use structured code/name/institution/date matches plus token overlap scoring. Vector search is optional and must not be required for this release.

- [ ] **Step 4: Add an index-version-aware cache key helper**

Cache keys include normalized question, scope, provider/model, and structured index version.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx tests/researchRetrieval.test.ts
npm test
```

Commit: `feat(ai): retrieve bounded report evidence`

### Task 3: Stream provider answers with citations and limits

**Files:**
- Create: `api/services/aiProvider.ts`
- Create: `api/services/aiUsage.ts`
- Create: `api/services/aiService.ts`
- Create: `api/routes/ai.ts`
- Create: `tests/aiService.test.ts`
- Modify: `api/server.ts`

- [ ] **Step 1: Write a mock-provider contract test**

Cover unconfigured status, configuration test, successful stream, abort, timeout, invalid provider JSON, rate limiting, global concurrency, daily budget, cache hit, and citation filtering.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/aiService.test.ts`

- [ ] **Step 3: Add the provider abstraction**

```ts
export interface AiProvider {
  test(config: ResolvedAiConfig, signal?: AbortSignal): Promise<void>;
  stream(input: ProviderChatInput, config: ResolvedAiConfig, signal: AbortSignal): AsyncIterable<string>;
}

export function createOpenAiCompatibleProvider(fetchImpl?: typeof fetch): AiProvider;
```

Send requests only to the configured base URL. The system prompt states that source blocks are untrusted evidence, answers must stay within them, and citations must use only supplied chunk IDs.

- [ ] **Step 4: Add usage controls**

Reject questions over the configured length. Use per-IP sliding-window rate limits, a process-wide semaphore, a daily token counter, bounded in-memory LRU cache, request timeout, and client-abort propagation. Do not persist questions or responses server-side.

- [ ] **Step 5: Add routes**

- `GET /api/ai/status` returns safe public configuration and usage state.
- `PUT /api/ai/config` requires `X-AI-Admin-Token`.
- `POST /api/ai/config/test` requires the admin token when testing a new key.
- `POST /api/ai/chat` streams SSE events: `sources`, `delta`, `done`, or `error`.

Only citations matching retrieved chunk IDs are returned to clients. If no reliable source exists, emit an evidence-insufficient answer.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx tsx tests/aiService.test.ts
npm test
npm run check
```

Commit: `feat(ai): add cited streaming research chat`

### Task 4: Build the 研究助手 workspace

**Files:**
- Create: `src/pages/ResearchAssistant.tsx`
- Create: `src/components/AiConfigDialog.tsx`
- Create: `src/components/ResearchScopeBar.tsx`
- Create: `src/components/CitationList.tsx`
- Create: `src/hooks/useAiChat.ts`
- Modify: `src/App.tsx`
- Modify: `src/lib/navigation.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add stream parser tests**

Extract and test a pure SSE parser handling split frames, UTF-8 text, sources-before-delta, done, structured errors, and abort.

- [ ] **Step 2: Create the assistant empty/configured states**

Without configuration, explain that AI is optional and link to global configuration. With configuration, show provider/model/remaining budget without revealing the key.

- [ ] **Step 3: Build report-grounded chat**

Support all reports, date range, company, and institution scopes. Provide example prompts. Stream the answer, allow stop/retry, show citations below each answer, and preserve partial text after interruption.

- [ ] **Step 4: Keep conversation history browser-local**

Store bounded conversation metadata/content in `localStorage`, keyed by app origin. Desktop shows a conversation rail; mobile opens it from a sheet. Do not send prior conversations except the active bounded context.

- [ ] **Step 5: Build global configuration UI**

The dialog collects provider, base URL, model, key, timeout, budget, concurrency, and admin token. The admin token is held only in component memory. Test-before-save is available; key responses are always masked.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx tsx tests/aiStreamParser.test.ts
npm run check
npm run build
```

Commit: `feat(ui): add report-grounded research assistant`

### Task 5: Expose version metadata and complete release gates

**Files:**
- Create: `api/services/version.ts`
- Create: `tests/version.test.ts`
- Modify: `api/routes/research.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `package-lock.json`

- [ ] **Step 1: Test version precedence**

Verify semantic version comes from `package.json`, commit comes from `APP_GIT_COMMIT` with a safe local fallback, and build time comes from `APP_BUILD_TIME`. No command execution occurs per request.

- [ ] **Step 2: Add `GET /api/version`**

```ts
export interface AppVersion {
  version: string;
  commit: string;
  buildTime: string;
}
```

- [ ] **Step 3: Document AI and release configuration**

Update `.env.example` and README with `AI_CONFIG_SECRET`, `AI_CONFIG_ADMIN_TOKEN`, provider env overrides, runtime directory, limits, and the fact that AI is optional and globally shared.

- [ ] **Step 4: Run every local gate from a clean build**

```bash
npm ci
npm test
npm run check
npm run build
git status --short
```

Expected: tests/check/build PASS; only intentional files are modified; `.superpowers/` and runtime secrets are untracked/ignored.

- [ ] **Step 5: Browser-smoke the production build**

Validate desktop and mobile navigation, overview, report quick view, grouped/raw search, company profile, optional AI states, update menu, data quality, and version display.

- [ ] **Step 6: Commit release documentation**

Commit: `docs: document research workbench configuration`

### Task 6: Update GitHub before touching production

**Files:**
- No source changes expected

- [ ] **Step 1: Record local and remote state**

```bash
git status --short --branch
git fetch origin
git log --oneline --decorate --graph origin/main..HEAD
git log --oneline --decorate --graph HEAD..origin/main
```

Resolve any remote divergence locally and rerun gates. Do not force push.

- [ ] **Step 2: Push the reviewed feature branch**

```bash
git push -u origin codex/research-workbench
```

- [ ] **Step 3: Fast-forward `main` and push**

Use a local fast-forward merge only after verifying `origin/main` ancestry:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only codex/research-workbench
git push origin main
```

If fast-forward is impossible, stop and create a normal merge commit locally; never rewrite remote history.

- [ ] **Step 4: Confirm GitHub commit**

```bash
git ls-remote origin refs/heads/main
```

The returned SHA must equal local `main` before server deployment.

### Task 7: Deploy from GitHub to `fustar.top`

**Files:**
- Server checkout: `/opt/AnalyseStrategy`
- Runtime: PM2 process `analyse-api`
- Public path: `/analyse-strategy`

- [ ] **Step 1: Capture rollback evidence**

Over SSH, record the current server commit, PM2 status, Nginx static root/config, active `dist` metadata, and health response. Preserve a timestamped copy of the current static build or its deploy target.

- [ ] **Step 2: Confirm server worktree is deploy-safe**

Run read-only status checks. If tracked server changes exist, stop rather than overwriting them. Runtime data and ignored config files remain in place.

- [ ] **Step 3: Pull the GitHub commit only**

```bash
cd /opt/AnalyseStrategy
git fetch origin main
git merge --ff-only origin/main
```

The server commit must equal the GitHub SHA recorded in Task 6.

- [ ] **Step 4: Install, test, and build on the server**

```bash
npm ci
npm test
npm run check
APP_GIT_COMMIT=$(git rev-parse --short HEAD) APP_BUILD_TIME=$(date -u +%FT%TZ) npm run build
```

Do not restart the running API if these gates fail.

- [ ] **Step 5: Restart and verify**

Restart `analyse-api` through its existing PM2 definition, then verify:

- process stays online and logs contain no secret/config dump;
- `/api/health`, `/api/overview`, `/api/version`, and `/api/ai/status` return valid JSON;
- `/analyse-strategy/` loads its static assets;
- desktop and mobile critical flows work;
- displayed commit/version match GitHub.

- [ ] **Step 6: Roll back on failure**

Restore the captured prior static build and prior checkout commit through a safe fast-forward/tagged release procedure, then restart the previous PM2 version. Do not edit source directly on the server.

- [ ] **Step 7: Report the release**

Provide the GitHub commit, live version/commit/build time, test/build results, AI configuration state (configured or not, never the key), and any remaining low-confidence parsing issues.

