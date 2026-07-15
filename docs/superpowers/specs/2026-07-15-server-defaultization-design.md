# Server Defaultization Design

**Date:** 2026-07-15

**Context**

AnalyseStrategy is now server-first. Production runs from `/opt/AnalyseStrategy`, consumes reports from `/opt/Strategy`, and should work without a server-local `.env` for normal operation.

**Approved Direction**

Use server defaults in code while keeping environment-variable override support for exceptional deployments. Also clean up the current split between `REPORT_DIR` and `REPORTS_DIR` so runtime behavior is predictable.

```mermaid
flowchart LR
    A[process.env.REPORT_DIR] --> D[getReportDir]
    B[process.env.REPORTS_DIR] --> D
    C[/opt/Strategy/港A美/机构日报] --> D
    D --> E[reportIndex rebuild and summary APIs]

    F[process.env.STRATEGY_DIR] --> G[getStrategyDir]
    H[/opt/Strategy] --> G
    G --> I[git pull --ff-only]

    J[process.env.PORT] --> K[getServerPort]
    L[3003] --> K
    K --> M[Express listen]
```

**Design**

1. Add one small runtime-config entry point for server defaults.
2. Resolve report directory with backward compatibility:
   - prefer `REPORT_DIR`
   - accept legacy `REPORTS_DIR`
   - otherwise use `/opt/Strategy/港A美/机构日报`
3. Resolve Strategy repo directory from `STRATEGY_DIR`, fallback to `/opt/Strategy`.
4. Resolve server port from `PORT`, fallback to `3003`.
5. Update `.gitignore` so server-local `.env` does not pollute git status.

**Compatibility**

- Existing tests and any older deployment using `REPORTS_DIR` continue to work.
- Production can delete `.env` after the code defaults are switched.
- Future overrides remain available through env vars.

**Validation**

- Add a dedicated runtime-config test first.
- Run the new test in red/green order.
- Run full `npm test`.
- Run `npm run build`.
