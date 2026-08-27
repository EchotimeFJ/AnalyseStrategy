# Research Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current feature list into a responsive “今日速览” workbench with consistent naming, report-level stock previews, grouped search, smooth mobile interaction, and a home-page data update flow.

**Architecture:** Centralize route metadata and API access, build reusable workbench cards and state components, then migrate each page to structured APIs. Desktop and mobile share the same components and domain logic; CSS breakpoints only change layout and navigation density.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind utilities plus `src/index.css`, Vite

---

### Task 1: Centralize product routes and resilient API access

**Files:**
- Create: `src/lib/navigation.ts`
- Create: `src/lib/api.ts`
- Create: `src/components/AppErrorBoundary.tsx`
- Create: `tests/navigation.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add a failing route-label test**

```ts
assert.equal(routeById.company.label, '公司研究');
assert.equal(routeById.company.mobileLabel, '公司');
assert.equal(routes.some(route => route.label.includes('标的') || route.label.includes('指标')), false);
assert.equal(routes.some(route => route.path === '/radar'), false);
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/navigation.test.ts`

- [ ] **Step 3: Create the single route metadata source**

```ts
export type RouteId = 'today' | 'reports' | 'search' | 'company' | 'assistant' | 'watchlist' | 'data';
export interface AppRouteMeta {
  id: RouteId;
  path: string;
  label: string;
  mobileLabel: string;
  description: string;
  nav: 'primary' | 'secondary';
}
export const routes: AppRouteMeta[] = [/* approved information architecture */];
export const routeById: Record<RouteId, AppRouteMeta>;
```

Both navigation variants, page headings, document titles, and empty states consume this metadata.

- [ ] **Step 4: Add a typed API helper**

`src/lib/api.ts` must parse JSON errors safely, support `AbortSignal`, and expose `apiGet`, `apiPost`, and `apiPut`. Invalid or non-JSON responses should produce a human-readable Chinese error rather than `Unexpected token`.

- [ ] **Step 5: Add route-level recovery**

`AppErrorBoundary` shows a concise message, retry action, and link back to 今日速览. Add redirects `/targets -> /company` and `/radar -> /`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx tsx tests/navigation.test.ts
npm run check
```

Commit: `refactor(ui): centralize research navigation`

### Task 2: Establish the responsive visual system and version surface

**Files:**
- Create: `src/components/ui/StateView.tsx`
- Create: `src/components/ui/MetricCard.tsx`
- Create: `src/components/ui/Panel.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/index.css`
- Modify: `vite.config.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `package.json`

- [ ] **Step 1: Introduce design and motion tokens**

Define semantic variables for canvas, surface, border, primary text, secondary text, accent, success, warning, and danger. Use the system sans-serif stack for controls and retain serif styling only inside report Markdown.

- [ ] **Step 2: Make interaction states consistent**

Buttons, fields, chips, dialogs, and cards require visible focus rings, a minimum 44px mobile target, disabled states, and 160–240ms transitions. Under `prefers-reduced-motion: reduce`, remove transforms and animated scrolling.

- [ ] **Step 3: Rebuild layout shells**

Desktop uses a compact fixed sidebar and bounded content column. Mobile uses a top context bar and bottom primary navigation; secondary entries live in a “更多” sheet. No horizontal page overflow is allowed at 390px.

- [ ] **Step 4: Add build metadata**

Set `package.json` version to `0.1.0`. Inject `__APP_VERSION__`, `__GIT_COMMIT__`, and `__BUILD_TIME__` through Vite defines and show them in the layout footer. The server-side `/api/version` task will use the same package version and environment commit.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run check
npm run build
```

Commit: `feat(ui): add responsive workbench design system`

### Task 3: Build 今日速览 and the home update flow

**Files:**
- Create: `src/pages/TodayPage.tsx`
- Create: `src/components/UpdateDataMenu.tsx`
- Create: `src/components/OpinionCard.tsx`
- Create: `src/components/ReportOverviewCard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Add state-transition tests for update actions**

Extract a pure reducer from `UpdateDataMenu.tsx` and test idle → confirming → updating → success/error, including repeat-click suppression.

- [ ] **Step 2: Create the workbench header**

Show current date, latest report date, last indexed time, health state, a keyboard-focusable global search field, and the “更新数据” menu.

- [ ] **Step 3: Implement both update actions**

- “从 GitHub 更新并重建” calls the existing safe update endpoint.
- “仅重新扫描报告” calls reindex.
- Keep showing the old overview during the request.
- On success, show added/modified/deleted counts and refresh overview.
- On failure, show a retryable message without clearing existing content.

- [ ] **Step 4: Render priority sections**

Render today’s positive opinions, per-report stock overviews, watchlist changes, and a compact data summary. Remove institution-count and research-radar emphasis.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx tests/updateDataMenu.test.ts
npm run check
npm run build
```

Commit: `feat(home): build today research workbench`

### Task 4: Add report-level stock quick view

**Files:**
- Modify: `src/pages/Reports.tsx`
- Create: `src/components/ReportOpinionTable.tsx`
- Create: `src/components/SourceLink.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Replace the all-at-once list**

Use server pagination on desktop and month-grouped incremental loading on mobile. Persist filters in URL search params: year/month, institution, and opinion type.

- [ ] **Step 2: Put structured overview before Markdown**

Each report detail defaults to positive opinions and offers “全部观点 / 风险 / 催化剂 / 变化”. The table shows stable security name/code, institution, rating, action, target price, types, confidence, and a source link.

- [ ] **Step 3: Implement source navigation**

Clicking evidence scrolls to and briefly highlights the corresponding rendered Markdown line or source anchor. Low-confidence rows are collapsed behind “待确认识别”.

- [ ] **Step 4: Verify keyboard/mobile behavior and commit**

Run:

```bash
npm run check
npm run build
```

Commit: `feat(reports): add stock opinion quick view`

### Task 5: Migrate smart search and company research

**Files:**
- Modify: `src/pages/SearchPage.tsx`
- Create: `src/pages/CompanyResearch.tsx`
- Modify: `src/pages/Targets.tsx`
- Create: `src/components/SearchResultGroup.tsx`
- Create: `src/components/CompanyOpinionTimeline.tsx`

- [ ] **Step 1: Build grouped search as the default**

Debounce input, cancel stale requests, show detected intent, and render a company summary for security queries followed by report groups. Adjacent source lines are one expandable snippet; remove raw `==` marker leakage.

- [ ] **Step 2: Keep strict source mode**

An explicit “严格原文” switch calls `raw=true` and displays the legacy line results for audit workflows.

- [ ] **Step 3: Build 公司研究**

Show the stable name/code/aliases, latest rating and target price, coverage institutions, first/latest mention, rating and target-price timeline, latest-opinion matrix, catalysts, risks, and source-linked history.

- [ ] **Step 4: Delete duplicated labels and inference**

The old `Targets` route becomes a redirect/export shim only. All visible page names come from `navigation.ts`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx tests/navigation.test.ts
npm run check
npm run build
```

Commit: `feat(research): add grouped search and company profiles`

### Task 6: Polish watchlist and data management

**Files:**
- Modify: `src/pages/Watchlist.tsx`
- Modify: `src/pages/IndexPage.tsx`
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/DataQualityPanel.tsx`

- [ ] **Step 1: Resolve watch additions against stable companies**

Search before adding, show code/name together, and prevent duplicate keys even when a different alias is entered.

- [ ] **Step 2: Confirm removal and surface changes**

Removal requires an accessible confirmation dialog. Each item shows new report/rating/target/risk counts since the last visit.

- [ ] **Step 3: Upgrade the data page**

Show source health, current update task, Git summary, index version, semantic/app version, build commit/time, parse issues, unverified institutions, and low-confidence securities.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run check
npm run build
```

Commit: `feat(data): improve watchlist and index diagnostics`

### Task 7: Browser regression on desktop and mobile

**Files:**
- Modify as defects require: `src/**`, `api/**`

- [ ] **Step 1: Start the local app with an explicit fixture/source path**

Run the backend and Vite frontend with matching API port configuration. Confirm the proxy targets port `3003` or derives the port from one source.

- [ ] **Step 2: Verify desktop at 1440×900**

Walk through 今日速览, 报告库, 智能检索, 公司研究, 关注列表, 数据更新. Inspect keyboard focus, loading, empty, error, and success states.

- [ ] **Step 3: Verify mobile at 390×844**

Check bottom navigation, more sheet, filter dialogs, report tables/cards, update confirmation, source jump, and no horizontal overflow.

- [ ] **Step 4: Verify reduced motion**

Emulate reduced motion and confirm content remains understandable without transforms.

- [ ] **Step 5: Run final UI gate and commit fixes**

Run:

```bash
npm test
npm run check
npm run build
```

Commit any verified fixes as `fix(ui): close responsive regression gaps`.

