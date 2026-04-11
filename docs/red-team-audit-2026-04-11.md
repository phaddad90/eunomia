# Yunomia Red Team Audit - 2026-04-11

> Full 5-specialist audit against v1.3.0 codebase.

## Scorecard

| Specialist | Score | Grade | Key Issues |
|---|---|---|---|
| Security | 11/25 | D | Bash blocklist bypassable, shell injection in git commit, WS bypasses rate limit |
| Pipeline/Logic | 14/25 | C | `require()` in ESM crashes dependency feature, shell injection, double-mark race |
| Architecture | 15/25 | C+ | `git add -A` stages everything, workers/ never cleaned, no uncaughtException handler |
| Frontend/UX | 16/25 | B- | Worker terminals leak memory, zero accessibility, editor overwrites without confirmation |
| Domain Ops | 17/25 | B | MCP enums missing scheduled/pulled, output validation too weak, no read_worker_output tool |
| **Overall** | **13.8/25** | **C+** | Weighted: Sec 30%, Pipeline 25%, Domain 20%, Arch 15%, FE 10% |

## Tier 0 - Fix Now

| # | Source | Finding | File:Line | Fix |
|---|--------|---------|-----------|-----|
| 1 | Security | **Bash blocklist trivially bypassable** - regex patterns have construction bugs, easy circumvention | safety.ts:147-155 | Replace blocklist with allowlist of safe commands |
| 2 | Pipeline | **`require('fs')` in ESM context** - crashes on any task with dependencies. v1.3 dependency feature is broken on arrival | mcp-server.ts:329 | Use the already-imported `readdirSync`/`copyFileSync` |
| 3 | Pipeline + Security | **Shell injection in git commit** - task title with backticks or `$()` executes in shell | index.ts:923 | Use `execFileSync('git', ['commit', '-m', msg])` instead of `execSync` |
| 4 | Architecture | **`git add -A` stages entire project** - commits secrets, logs, metrics, temp files, unrelated WIP | index.ts:920 | Scope to `git add workers/${taskId}/output/` |
| 5 | Security | **PATCH /api/tasks/:id passes raw body** - Object.assign writes arbitrary keys to task objects | index.ts:516 | Whitelist allowed fields, validate types/ranges |

## Tier 1 - Fix This Week

| # | Source | Finding | File:Line | Fix |
|---|--------|---------|-----------|-----|
| 6 | Security | **WebSocket prompt bypasses rate limiter** | index.ts:775 | Add server-side cooldown to WS prompt handler |
| 7 | Security | **Task description newlines not stripped** - SOUL.md heading injection possible | mcp-server.ts:343 | Strip newlines from sanitizedDesc |
| 8 | Security | **SOUL/GOALS PUT has no size limit** | index.ts:374-393 | Cap at 10000 chars |
| 9 | Security | **Skill config interpolated without validation** | skills.ts:83 | Validate against configFields schema |
| 10 | Architecture | **No uncaughtException/unhandledRejection handler** | (missing) | Add handlers that log and call shutdown() |
| 11 | Architecture | **Health loop has no top-level try/catch** | index.ts:975 | Wrap entire setInterval body |
| 12 | Architecture | **Shutdown can hang indefinitely** | index.ts:1224 | Add 30s hard ceiling with Promise.race |
| 13 | Architecture | **workers/ directories never cleaned** | mcp-server.ts:317 | Add retention policy (delete after 7 days) |
| 14 | Architecture | **Health endpoint misses degraded states** | index.ts:458 | Report degraded on CEO crash, budget exhaustion, SDK unavailable |
| 15 | Pipeline | **Double readdirSync TOCTOU** | index.ts:884-891 | Cache the result |
| 16 | Pipeline | **nudgedWorkers not cleared on natural completion** | agent-adapter.ts:290 | Clear in onWorkerCompleted path |
| 17 | Pipeline | **Approval timeout never calls clearTimeout** | safety.ts:289 | Store timer handle, clear on resolve |
| 18 | Frontend | **Worker terminals leak memory during normal operation** | dashboard.js:141,474 | Dispose on worker stop/crash with 60s delay |
| 19 | Domain | **MCP enums missing scheduled/pulled statuses** | mcp-server.ts:105 | Add to tasks_list and tasks_update schemas |
| 20 | Domain | **Output validation too weak** - empty files count as success | index.ts:884 | Check file size > 0 bytes |

## Tier 2 - Fix Before Launch

| # | Source | Finding | File:Line | Fix |
|---|--------|---------|-----------|-----|
| 21 | Architecture | **Daily budget resets on process restart** | safety.ts:60 | Persist spend to file |
| 22 | Architecture | **audit.jsonl .bak files never cleaned** | tasks.ts:363 | Keep only last 7 .bak files |
| 23 | Architecture | **Config parse failure is silent** | index.ts:76 | Log warning or fail-fast |
| 24 | Architecture | **SDK rate limits not retried** | agent-adapter.ts:299 | Add exponential backoff for 429/529 |
| 25 | Frontend | **Paused state desyncs on WS reconnect** | dashboard.js:22 | Fetch /api/safety on reconnect |
| 26 | Frontend | **Onboarding: no validation, no error handling** | dashboard.js:1084 | Validate required fields, add try/catch |
| 27 | Frontend | **Editor can overwrite with empty content** | dashboard.js:1141 | Confirm dialog when content is empty |
| 28 | Frontend | **Zero accessibility** | index.html:65 | Add roles, tabindex, ARIA, fix contrast |
| 29 | Domain | **tasks_update allows setting active without worker** | mcp-server.ts:255 | Block status=active via MCP |
| 30 | Domain | **No read_worker_output MCP tool** | (missing) | Add tool for CEO to read output files |
| 31 | Domain | **Multi-worker skills have no aggregation step** | skills.ts:131 | Add CEO compile step after all workers complete |

## Priority Fix Order

The 5 Tier 0 items are the priority. Specifically:
1. Fix `require('fs')` -> use imports (1 line, v1.3 dependencies are broken without it)
2. Replace Bash blocklist with allowlist (security critical)
3. Fix `git add -A` scoping (data leak prevention)
4. Fix shell injection in git commit (use execFileSync)
5. Validate PATCH /api/tasks/:id fields
