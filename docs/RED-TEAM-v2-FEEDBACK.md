# Red Team v2 Feedback — Project Eunomia

> Five critics re-reviewed the revised brief (v2) on 2026-04-09.

## Overall Verdict: PASS WITH CONDITIONS (5/5 unanimous)

No FAILs. No unconditional PASSes. Every critic found the brief dramatically improved but identified specific remaining gaps.

---

## Scorecard

| Critic | v1 Rating | v2 Rating | Summary |
|--------|-----------|-----------|---------|
| Token Economics | FAIL (4-7x undercount) | PASS w/ conditions | Costs now honest. Fix heartbeat default, MEMORY rotation spec, "<3x" claim. |
| Architecture | FAIL (critical gaps) | PASS w/ conditions | Board race & corruption solved. Add logging, graceful shutdown, Bash bypass fix. |
| UX & Product | FAIL (unusable) | PASS w/ conditions | Onboarding & layout fixed. Add parentGoal field, clarify prompt persistence. |
| Chaos Engineer | FAIL (3x score 20/25) | PASS w/ conditions | Top risks dropped 20→4. New top risk: Bash bypass at 12/25. |
| Devil's Advocate | FAIL (kill it) | PASS w/ conditions | No longer "kill it." Cut board from V1. Validate with one real service first. |

---

## Risk Score Movement

| Risk | v1 Score | v2 Score |
|------|----------|----------|
| Worker spawn flood | 20/25 | 4/25 |
| Worker writes to prod code | 20/25 | 4/25 (Write/Edit) but 12/25 (Bash bypass) |
| Unattended cost accrual | 20/25 | 4/25 |
| Retry death spiral | 16/25 | 3/25 |
| Board race condition | 16/25 | 3/25 |
| board.json corruption | 15/25 | 2/25 |
| **New: Bash tool bypass** | — | **12/25** (new top risk) |
| **New: CEO compaction drift** | — | **8/25** |

---

## Remaining Issues (Consolidated, De-Duped)

### Must Fix Before Build (3 items)

**1. Bash tool bypass of worker write scope**
Flagged by: Architecture, Chaos Engineer
The `canUseTool` handler only checks `Write` and `Edit`. Workers can run `echo > /outside/path` via Bash. Fix: block Bash for workers entirely, or require human approval for Bash commands, or intercept and reject writes outside scope.

**2. Structured logging**
Flagged by: Architecture, Token Economics
No application-level logging specified (only audit.jsonl for board mutations). Need server logs, SDK error logs, heartbeat timing, connection events. Recommendation: pino with daily rotation.

**3. Graceful shutdown (SIGTERM handler)**
Flagged by: Architecture
No handler for server stop. Need: stop heartbeat, teardown workers, flush board, close WebSocket connections. Without this, orphan processes and partial state.

### Must Fix During Phase 1 Build (6 items)

**4. Heartbeat interval default**
Flagged by: Token Economics
Never stated. Assumed 10 minutes in cost estimates but the `SafetyConfig` doesn't include it. Add `heartbeatIntervalMinutes: 10` to config.

**5. MEMORY.md rotation mechanism**
Flagged by: Token Economics
Says "capped at 50 lines, rotated" but no spec. Need: what triggers rotation, where archives go, how the CEO is instructed.

**6. Daily CEO restart vs persistent session tension**
Flagged by: Token Economics, Chaos Engineer
"Restart CEO session daily" listed as cost lever but conflicts with session persistence. Resolution: add `maxCeoSessionHours: 8` to SafetyConfig. On trigger: send "write critical context to MEMORY.md", wait 30s, kill, cold-start fresh.

**7. Orphan worker cleanup on restart**
Flagged by: Architecture
On server restart, tasks marked `active` have no worker process. Server must scan for orphaned active tasks on startup and mark them `failed`.

**8. MCP tool list**
Flagged by: Token Economics
Brief says "8 tools" but never enumerates them. Need the list for cost modelling and implementation.

**9. Worker kill lifecycle**
Flagged by: UX
Human kills worker via dashboard → task goes to `failed` → CEO notified on next heartbeat → partial output preserved. Needs explicit specification.

### Nice-to-Have for V1 (5 items)

**10. `parentGoal` field in task schema**
Flagged by: UX
Prevents micro-task flooding. Low effort. Add `parentGoal?: string` and "group by goal" toggle.

**11. Prompt input always-visible across tabs**
Flagged by: UX
Currently ambiguous whether it persists when switching to Board or Status tab. Should be tab-independent like the status bar.

**12. Safety warning surfacing in status bar**
Flagged by: UX
When budget hits 80%, status bar should change colour/show warning icon. One sentence in spec.

**13. Worker terminal expand behaviour**
Flagged by: UX
Should expanding a worker terminal replace CEO terminal temporarily, or split viewport? Specify.

**14. Audit log rotation**
Flagged by: Token Economics, Chaos Engineer
Append-only audit.jsonl grows unbounded. Add daily or size-based rotation.

---

## The Devil's Advocate's Final Position

No longer recommending "kill it." But recommending a leaner V1:

> **"Cut the Board module from V1. Use TASKS.md or ClickUp instead. Ship Phase 1 (terminal + adapter + safety + cost tracking) as a standalone tool. Validate with one real service. Only build the board and worker terminals if Phase 1 proves its value."**

> **"Add spawn approval mode as a V1 safety feature — the CEO spawning workers autonomously without human approval is the riskiest part of the system."**

> **"Do not start until pricing engine Week 2 is complete. Hard deadline: if not functional in 2 weeks, abandon and use native tools."**

---

## The Honest Token Target

The "<3x single agent" claim in the gap table is aspirational. Corrected consensus from the critics:

- **Realistic target: 4-6x single agent** with current architecture
- **Achievable with all cost levers engaged: 3-5x** (Sonnet CEO heartbeats, daily restart, adaptive skip, Haiku for simple tasks)
- **Paperclip comparison: 10x+** — Eunomia is still meaningfully better

---

## Recommendation to Peter

The brief is buildable. The architecture is sound. The safety is first-class. The scope is tight. Three options:

**Option A (Devil's Advocate recommended): Phase 1 only.**
Build: adapter + safety + cost tracking + CEO terminal. Skip: board, worker terminals, MCP server. Use TASKS.md for task tracking. Validate with one service. ~1 week build.

**Option B (Full V1 as specified):**
Build everything in the brief across 3-4 sessions (~2-3 weeks). Includes board, worker terminals, MCP tools, full dashboard. Higher risk, higher payoff.

**Option C (Compromise):**
Phase 1 + simplified board (no drag-and-drop, just a rendered task list with add/edit). Skip SortableJS. Build worker terminals only if Phase 1 proves value. ~1.5 weeks.
