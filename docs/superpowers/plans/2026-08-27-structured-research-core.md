# Structured Research Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile heading and line-based inference with a code-first, source-backed research index that powers report overviews, grouped search, and company profiles without breaking existing API clients.

**Architecture:** Parse each Markdown file into source-addressable blocks, resolve institutions and securities in dedicated modules, extract opinions only inside the current security segment, then atomically publish a structured index. Legacy `targets`, `radar`, and raw search responses remain available while new overview, company, and grouped-search endpoints become the preferred API.

**Tech Stack:** TypeScript, Node.js, Express, native `node:test`-style assertions executed by `tsx`, existing Markdown parser helpers

---

### Task 1: Define source evidence and stable entity identity

**Files:**
- Create: `api/domain/research.ts`
- Create: `api/services/entityResolver.ts`
- Create: `tests/entityResolver.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing identity tests**

Cover these contracts in `tests/entityResolver.test.ts`:

```ts
assert.equal(normalizeSecurityCode('1768 hk'), '1768.HK');
assert.equal(securityKey({ code: '1768.HK', name: '鸣鸣很忙' }), 'code:1768.HK');
assert.equal(securityKey({ code: '1768.HK', name: '明明很忙' }), 'code:1768.HK');
assert.equal(isInvalidEntityName('AI'), true);
assert.equal(isInvalidEntityName('AH'), true);
assert.equal(resolveInstitution('精选-中金').canonicalName, '中金');
assert.equal(resolveInstitution('AI').verified, false);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx tests/entityResolver.test.ts`

Expected: FAIL because `entityResolver.ts` and the domain types do not exist.

- [ ] **Step 3: Add explicit domain contracts**

`api/domain/research.ts` must export:

```ts
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceEvidence {
  reportId: string;
  filePath: string;
  lineNumber: number;
  excerpt: string;
  method: string;
  confidence: ConfidenceLevel;
}

export interface SecurityEntity {
  key: string;
  code: string | null;
  displayName: string;
  aliases: string[];
  confidence: ConfidenceLevel;
}

export type OpinionType =
  | 'positive'
  | 'rating-change'
  | 'target-price-change'
  | 'catalyst'
  | 'risk';

export interface OpinionRecord {
  id: string;
  reportId: string;
  reportDate: string;
  institution: string;
  institutionVerified: boolean;
  security: SecurityEntity;
  rating: string | null;
  rawRating: string | null;
  action: string | null;
  targetPrice: string | null;
  currentPrice: string | null;
  types: OpinionType[];
  evidence: SourceEvidence[];
}
```

- [ ] **Step 4: Implement pure resolver functions**

`api/services/entityResolver.ts` must export:

```ts
export function normalizeSecurityCode(input: string | null | undefined): string | null;
export function normalizeEntityName(input: string): string;
export function isInvalidEntityName(input: string): boolean;
export function securityKey(input: { code?: string | null; name: string }): string;
export function resolveInstitution(input: string): {
  rawName: string;
  canonicalName: string;
  verified: boolean;
};
export function chooseCanonicalSecurityName(names: string[]): string;
```

Use a small checked-in institution alias map for common broker headings. Strip only presentation prefixes such as `精选-`; do not promote unknown headings to verified institutions. Reject market/theme tokens and rating words as security names.

- [ ] **Step 5: Export matching frontend DTO types**

Add DTOs to `src/types.ts` rather than importing server-only modules into the Vite bundle.

- [ ] **Step 6: Run the focused test and confirm GREEN**

Run: `npx tsx tests/entityResolver.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/domain/research.ts api/services/entityResolver.ts src/types.ts tests/entityResolver.test.ts
git commit -m "feat(index): add stable research entities"
```

### Task 2: Segment reports and extract source-backed opinions

**Files:**
- Create: `api/services/opinionExtractor.ts`
- Create: `tests/fixtures/report-1768-aliases.md`
- Create: `tests/fixtures/report-multiple-securities.md`
- Create: `tests/opinionExtractor.test.ts`
- Modify: `api/services/reportParser.ts`

- [ ] **Step 1: Add fixtures for known failure modes**

The fixtures must include:

- `1768.HK` with the names `明明很忙`, `鸣鸣很忙`, and `忙碌明`.
- headings `AI`, `AH`, `零件材料`, and `未覆盖` that must not become verified institutions or security aliases.
- two consecutive securities with different ratings and target prices, proving that values do not leak across segments.

- [ ] **Step 2: Write failing extraction assertions**

```ts
const parsed = parseReport(fixture, '/tmp/2026-08-26.md');
const opinions = extractOpinions(parsed);
const aliases = opinions.filter(item => item.security.code === '1768.HK');

assert.equal(new Set(aliases.map(item => item.security.key)).size, 1);
assert.equal(opinions.some(item => item.institution === 'AI' && item.institutionVerified), false);
assert.equal(first.targetPrice, '114 港元');
assert.notEqual(first.targetPrice, second.targetPrice);
assert.ok(first.evidence.every(item => item.lineNumber > 0));
```

- [ ] **Step 3: Run and confirm RED**

Run: `npx tsx tests/opinionExtractor.test.ts`

Expected: FAIL because opinion segmentation is not implemented.

- [ ] **Step 4: Refactor parser output into addressable blocks**

Keep the current exported parser API compatible, and add:

```ts
export interface ParsedLine { lineNumber: number; text: string }
export interface ParsedBlock {
  heading: string;
  institution: ReturnType<typeof resolveInstitution>;
  startLine: number;
  endLine: number;
  lines: ParsedLine[];
}
export interface ParsedReport {
  reportId: string;
  filePath: string;
  date: string;
  title: string;
  lines: string[];
  blocks: ParsedBlock[];
}

export function parseReport(content: string, filePath: string): ParsedReport;
```

Only headings accepted by `resolveInstitution` open a verified institution block. Unknown first-level headings may remain as traceable unverified blocks, but must be excluded from institution rankings.

- [ ] **Step 5: Implement security-segment extraction**

`opinionExtractor.ts` must export:

```ts
export function extractOpinions(report: ParsedReport): OpinionRecord[];
export function isPositiveRating(value: string | null): boolean;
export function classifyOpinionTypes(input: {
  rating: string | null;
  action: string | null;
  text: string;
}): OpinionType[];
```

Segment on high-confidence `name (code)` headings or coverage lines. Bind rating, action, target price, current price, catalyst, and risk only until the next security segment. Store the exact source line for every extracted field.

- [ ] **Step 6: Keep existing `parseReportFile` callers working**

Adapt the legacy mention output from `OpinionRecord` so the old API remains stable during migration.

- [ ] **Step 7: Run focused and parser regressions**

Run:

```bash
npx tsx tests/opinionExtractor.test.ts
npx tsx tests/ratingSearch.test.ts
npx tsx tests/parser.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add api/services/reportParser.ts api/services/opinionExtractor.ts tests/fixtures tests/opinionExtractor.test.ts
git commit -m "feat(index): extract source-backed report opinions"
```

### Task 3: Build and swap the index atomically

**Files:**
- Create: `tests/indexResilience.test.ts`
- Modify: `api/services/reportIndex.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write a failing resilience test**

Test an injectable report directory:

```ts
const index = createReportIndex({ sourceDir: validFixtureDir });
await index.rebuild();
const before = index.getSnapshot();
index.setSourceDir(missingDir);
await assert.rejects(index.rebuild());
assert.deepEqual(index.getSnapshot().reports, before.reports);
```

Also assert that one malformed report is recorded in `qualityIssues` while valid reports remain queryable.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/indexResilience.test.ts`

- [ ] **Step 3: Separate candidate state from live state**

Introduce an internal snapshot contract:

```ts
interface ResearchIndexState {
  version: string;
  builtAt: string | null;
  reports: ReportSummary[];
  reportDetails: Map<string, ReportDetail>;
  opinions: OpinionRecord[];
  entities: Map<string, SecurityEntity>;
  qualityIssues: DataQualityIssue[];
}
```

Build a complete candidate in local variables. Assign it to the live `state` only after the directory scan and all aggregate construction succeed. A single file parse error is a quality issue; a missing/unreadable root directory rejects the rebuild and preserves the previous live state.

- [ ] **Step 4: Resolve aliases globally by security code**

Merge all names for the same normalized code into one `SecurityEntity`. Use user aliases as the highest-priority display-name override, then a deterministic quality/frequency rule. Never allow invalid tokens into aliases.

- [ ] **Step 5: Preserve legacy API projections**

Generate current `mentions`, `radar`, and `TargetProfile` shapes from the structured index so existing pages keep working until the UI migration finishes.

- [ ] **Step 6: Run resilience and existing index tests**

Run:

```bash
npx tsx tests/indexResilience.test.ts
npm test
```

Expected: all PASS and no Express process exit on an invalid report path.

- [ ] **Step 7: Commit**

```bash
git add api/services/reportIndex.ts src/types.ts tests/indexResilience.test.ts
git commit -m "refactor(index): publish research snapshots atomically"
```

### Task 4: Expose report overviews and company profiles

**Files:**
- Create: `tests/researchApi.test.ts`
- Modify: `api/services/reportIndex.ts`
- Modify: `api/routes/research.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing service/API assertions**

Verify:

- `GET /api/overview` returns latest positive opinions and report cards.
- `GET /api/reports/:id/overview` returns deduplicated securities and all source evidence.
- `GET /api/companies?q=1768.HK` returns one stable entity with aliases and a time-ordered opinion history.
- missing report IDs return structured `404` JSON.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/researchApi.test.ts`

- [ ] **Step 3: Add index query methods**

```ts
export function getOverview(): TodayOverview;
export function getReportOverview(reportId: string): ReportOverview | null;
export function getCompanyProfiles(query: string): CompanyProfile[];
export function getDataQuality(): DataQualitySummary;
```

Deduplicate by `reportId + institution + security.key`, merge evidence arrays, and sort latest-first with stable tie-breaking.

- [ ] **Step 4: Add compatible routes with async error handling**

Use a shared async handler or explicit `try/catch`; every error response must be JSON with `{ error: { code, message } }`. Do not expose local filesystem paths for unexpected errors.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
npx tsx tests/researchApi.test.ts
npm test
```

- [ ] **Step 6: Commit**

```bash
git add api/services/reportIndex.ts api/routes/research.ts src/types.ts tests/researchApi.test.ts
git commit -m "feat(api): add research overview and company profiles"
```

### Task 5: Add grouped, intent-aware search

**Files:**
- Create: `api/services/searchService.ts`
- Create: `tests/searchService.test.ts`
- Modify: `api/services/reportIndex.ts`
- Modify: `api/routes/research.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing intent and grouping tests**

```ts
assert.equal(classifySearchIntent('1768.HK', fixtureIndex).type, 'security-code');
assert.equal(classifySearchIntent('中金', fixtureIndex).type, 'institution');
assert.equal(classifySearchIntent('消费复苏', fixtureIndex).type, 'text');
assert.equal(groupSearchHits(adjacentHits).length, 1);
```

Also verify `raw=true` returns the legacy line-hit array unchanged.

- [ ] **Step 2: Run and confirm RED**

Run: `npx tsx tests/searchService.test.ts`

- [ ] **Step 3: Implement intent classification and adjacent-line merging**

`searchService.ts` must export:

```ts
export type SearchIntentType = 'security-code' | 'security-name' | 'institution' | 'text';
export function classifySearchIntent(query: string, context: SearchContext): SearchIntent;
export function groupSearchHits(hits: SearchHit[], gap?: number): SearchResultGroup[];
export function searchResearchIndex(input: SearchRequest, state: ResearchIndexState): GroupedSearchResponse;
```

Group by report, merge line hits whose line gap is at most two, and include the resolved company summary for security intents.

- [ ] **Step 4: Extend `/api/search` without breaking raw mode**

Default to grouped output. Return the old array only when `raw=true`. Support date, institution, and opinion-type filters.

- [ ] **Step 5: Run the complete backend suite**

Run:

```bash
npx tsx tests/searchService.test.ts
npm test
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add api/services/searchService.ts api/services/reportIndex.ts api/routes/research.ts src/types.ts tests/searchService.test.ts
git commit -m "feat(search): group report hits by research intent"
```

