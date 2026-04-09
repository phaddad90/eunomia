# Red Team v4 — Full System Review (Code-Level)

> Five specialists reviewed the built codebase on 2026-04-09.
> This is the first review against actual code (previous rounds reviewed the brief).

## Verdict: PASS WITH CONDITIONS

The architecture is sound. The token economics are honest. The safety *intent* is correct. But three critical implementation bugs mean the safety guardrails aren't actually working as designed.

---

## The Three Showstoppers

### 1. `canUseTool` return type is wrong — worker write isolation is silently broken

**File:** `safety.ts` lines 94-108, `agent-adapter.ts` line 225

The guard returns `{ allowed: boolean; reason?: string }`. The SDK expects `Promise<{ behavior: 'allow' | 'deny' | 'ask' }>`. The SDK receives a non-matching object and likely ignores it. Workers can write outside their directory. The Bash block via `disallowedTools` still works, but Write/Edit path guarding is non-functional.

### 2. Natural worker completion creates zombie sessions

**File:** `agent-adapter.ts` lines 239-241

When a worker's `for await` loop ends naturally (task complete), no code updates `session.status` or removes it from the Map. The session stays `status: 'running'` forever. It counts against the concurrency cap. After a few completed workers, no new workers can spawn. Tasks stay `active` indefinitely.

### 3. CEO can rewrite its own SOUL.md

**File:** `index.ts` line 727 (`bypassPermissions`), no `canUseTool` guard on CEO

The CEO has full unrestricted file access. It can modify SOUL.md, GOALS.md, PROJECT.md, TASKS.md — anything in the project folder. A prompt injection or autonomous decision to "optimise" its instructions would rewrite its own rules with no safeguard.

---

## All Issues Ranked by Impact

### Critical (must fix)

| # | Issue | Source | Fix |
|---|-------|--------|-----|
| 1 | canUseTool return type mismatch — write isolation broken | Architecture | Return `Promise<{ behavior: 'allow' | 'deny' }>` |
| 2 | Zombie sessions on natural completion — concurrency cap consumed | Architecture | Add post-loop cleanup in runSdkSession |
| 3 | CEO can rewrite SOUL.md/GOALS.md | Chaos | Add canUseTool guard on CEO blocking writes to SOUL.md, GOALS.md |
| 4 | Server binds 0.0.0.0, not 127.0.0.1 | Security | `server.listen(port, '127.0.0.1')` |
| 5 | Safety config PATCH has no validation | Security + Chaos | Whitelist fields, validate types/ranges |
| 6 | Status polling never stops after sleep screen | UX | Clear the interval in showSleepScreen |
| 7 | Worker xterm.js instances never disposed — memory leak | UX | Dispose on worker stop/crash |

### High (should fix)

| # | Issue | Source |
|---|-------|--------|
| 8 | Path guard `startsWith` vulnerable to prefix confusion (missing trailing `/`) | Security |
| 9 | No server-side rate limiting on any endpoint | Security + Chaos |
| 10 | POST /api/tasks bypasses maxPlannedTasks cap | Security |
| 11 | Approval deadlock — no timeout on requestApproval | Architecture |
| 12 | POST /api/shutdown has no auth token | Security |
| 13 | Crashed worker leaves task stuck for 30min until timeout | Architecture |
| 14 | Heartbeat fires indefinitely on dead CEO | Architecture |
| 15 | Milestone metrics never reset across day boundary | Architecture |
| 16 | MCP import failure not surfaced to dashboard | Chaos |

### Medium

| # | Issue | Source |
|---|-------|--------|
| 17 | Worker terminal fit() called while tab hidden — 0-column resize | UX |
| 18 | renderTasks crashes if maxBudgetUsd undefined | UX |
| 19 | Sleep screen doesn't disable header buttons | UX |
| 20 | "Remove" button marks task Done instead of deleting | UX |
| 21 | Audit.jsonl has no rotation | Chaos |
| 22 | Zod v3/v4 mismatch risk in MCP tool builder | Architecture |

### Token Optimisations

| # | Optimisation | Savings |
|---|-------------|---------|
| T1 | Lean heartbeat prompt (permission to no-op) | ~200-500K tok/day |
| T2 | Remove Daily Review section from SOUL.md (move to prompt) | ~4K tok/day |
| T3 | Merge SOUL.md Rules + How You Work sections | ~2.5K tok/day |

---

## Risk Score Comparison

| Review | Scope | Aggregate Top 5 |
|--------|-------|-----------------|
| v1 (brief) | Brief only | 96/125 |
| v2 (brief) | Brief revised | 31/125 |
| v3 (brief) | Brief final | 15/125 |
| **v4 (code)** | **Built code** | **75/125** |

The score went up because v1-v3 reviewed the *specification*. v4 reviewed the *implementation*. The canUseTool type mismatch, zombie sessions, and CEO self-modification are code-level bugs that couldn't be found from a brief.

---

## Priority Fix Order

1. Fix canUseTool to return correct SDK PermissionResult type
2. Add post-loop cleanup for natural session completion
3. Add CEO canUseTool guard (block writes to SOUL.md, GOALS.md)
4. Bind server to 127.0.0.1
5. Validate safety config PATCH endpoint
6. Fix dashboard: clear interval, dispose terminals, disable buttons on sleep
7. Add server-side rate limiting
8. Fix path guard trailing slash
9. Add approval timeout
10. Apply token optimisations
