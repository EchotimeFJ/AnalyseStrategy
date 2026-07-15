# Server Defaultization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server paths and port the built-in defaults while preserving env override support and removing routine reliance on a server-local `.env`.

**Architecture:** Introduce one focused runtime-config module, route all backend default resolution through it, keep backward compatibility for `REPORTS_DIR`, and verify behavior with a dedicated test before running the full suite and build.

**Tech Stack:** TypeScript, Node.js, Express, tsx tests, Vite build

---

### Task 1: Lock runtime defaults with a failing test

**Files:**
- Create: `tests/runtimeConfig.test.ts`
- Test: `tests/runtimeConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';

delete process.env.REPORT_DIR;
delete process.env.REPORTS_DIR;
delete process.env.STRATEGY_DIR;
delete process.env.PORT;

const config = await import(`../api/runtimeConfig.ts?defaults=${Date.now()}`);

assert.equal(config.getReportDir(), '/opt/Strategy/港A美/机构日报');
assert.equal(config.getStrategyDir(), '/opt/Strategy');
assert.equal(config.getServerPort(), 3003);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `tsx tests/runtimeConfig.test.ts`
Expected: FAIL because `api/runtimeConfig.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function getReportDir() {
  return process.env.REPORT_DIR || process.env.REPORTS_DIR || '/opt/Strategy/港A美/机构日报';
}

export function getStrategyDir() {
  return process.env.STRATEGY_DIR || '/opt/Strategy';
}

export function getServerPort() {
  return Number(process.env.PORT || 3003);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `tsx tests/runtimeConfig.test.ts`
Expected: PASS

### Task 2: Adopt runtime config everywhere and verify repository hygiene

**Files:**
- Create: `api/runtimeConfig.ts`
- Modify: `api/services/reportIndex.ts`
- Modify: `api/services/gitUpdater.ts`
- Modify: `api/server.ts`
- Modify: `.gitignore`
- Test: `tests/gitUpdater.test.ts`
- Test: `tests/reportChanges.test.ts`
- Test: `tests/ordering.test.ts`
- Test: `tests/ratingSearch.test.ts`

- [ ] **Step 1: Wire consumers to the shared config**

```ts
import { getReportDir, getStrategyDir, getServerPort } from '../runtimeConfig.js';
```

- [ ] **Step 2: Keep legacy report env compatibility while making server defaults canonical**

```ts
const sourceDir = getReportDir();
const strategyDir = options.strategyDir ?? getStrategyDir();
const port = getServerPort();
```

- [ ] **Step 3: Ignore local env files in git**

```gitignore
.env
.env.*
!.env.example
```

- [ ] **Step 4: Run regression suite and build**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS
