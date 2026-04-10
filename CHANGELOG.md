# Changelog

All notable changes to Eunomia are documented here.

---

## v1.0.0 — 2026-04-09

Initial release. Built in one session, then hardened through five rounds of adversarial red-team review.

### Core
- Browser-based dashboard at localhost:4600 (Terminals, Tasks, Status tabs)
- CEO agent: persistent session with auto-compaction, adaptive heartbeat (10m-60m)
- Worker agents: temporary, task-scoped, sandboxed, disposable
- TASKS.md coordination layer with in-memory cache and atomic file writes
- 7 MCP tools for CEO (tasks_list, tasks_create, tasks_update, spawn_worker, worker_status, kill_worker, list_workers)
- One-command project init with auto-generated context files

### Safety (13 guardrails)
- Worker write isolation via SDK `canUseTool` (returns `{ behavior: 'deny' }`)
- Workers cannot use Bash (`disallowedTools: ['Bash']`)
- CEO cannot modify SOUL.md, GOALS.md, PROJECT.md, or TASKS.md
- MEMORY.md size guard (100 lines / 4KB per write)
- Concurrency cap (default: 3 workers)
- Daily budget with 80% warning and 100% hard stop (default: $50)
- Worker timeout (default: 30min)
- Retry limit with auto-fail (default: 2 retries)
- Inactivity pause (default: 60min)
- Working hours support (optional)
- Spawn approval mode (optional)
- CEO session age rotation (default: 8hrs)
- CEO crash auto-restart with 3-strike backoff
- Orphan task cleanup on server restart

### Dashboard
- xterm.js live terminal streaming via WebSocket
- Multi-line prompt input (Shift+Enter for newline, Enter to send)
- Human prompts echo in terminal as `> You:` in cyan
- Worker terminals as expandable pills (click to swap, Back to return)
- Always-visible status bar (CEO state, worker count, daily spend)
- Always-visible prompt input across all tabs
- Sleep screen on shutdown (clean stop, no retry spam)
- Cost badge with amber/red budget warnings

### Metrics + Analytics
- 8 event types tracked to date-partitioned `metrics/metrics-YYYY-MM-DD.jsonl`
- Events: heartbeat, worker_spawned, worker_completed, worker_killed, human_interaction, cost_milestone, ceo_restart, session_summary
- Daily reports auto-generated to `reports/YYYY-MM-DD.md` on shutdown
- CEO daily lessons learned (writes to MEMORY.md on shutdown/review)
- Milestone tracking at 25%, 50%, 80%, 100% of budget
- 30-day metrics rotation

### Security
- Server binds to 127.0.0.1 only
- Safety config PATCH validates all fields (type + range bounds)
- JSON body size limit (16KB)
- Server-side rate limiting (1 prompt/5s, 1 task/2s)
- Prompt length cap (8000 chars)
- Task input validation (title max 200, description max 1000)
- Worker SOUL.md content sanitised (heading injection prevented)
- Config file safety fields validated on load (same bounds as PATCH)

### Token Efficiency
- Lean heartbeat prompt (permission to no-op when nothing changed)
- CEO SOUL.md merged to ~250 tokens (from ~400)
- Daily Review section in prompt only (not loaded every turn in SOUL.md)
- 7 MCP tools at ~600 tokens total overhead
- Worker SOUL.md at ~120 tokens
- MEMORY.md capped at 50 lines with server-side rotation
- Adaptive heartbeat: doubles after 3 idle cycles, caps at 60min, resets on task change
- Heartbeat skips when spawn approval is pending
- Delta-based cost tracking (no double-counting cumulative SDK totals)

### Infrastructure
- Structured logging (pino, daily rotation, 7-day retention)
- Audit log with 1MB rotation
- Graceful shutdown (SIGTERM/SIGINT: stop heartbeat, CEO memory save, worker teardown, task cleanup)
- Health endpoint (`GET /health`)
- SDK adapter layer (swappable if V2 API changes)
- Zod v4 import with v3 fallback for MCP tool schemas
- "Pulled" task status for human-removed tasks (audit trail preserved)
- Crashed worker fast-path detection (marks tasks failed immediately, not after 30min timeout)

### Red Team Review History
- **v1** (brief): 5x FAIL, risk 96/125
- **v2** (brief revised): 5x PASS w/ conditions, risk 31/125
- **v3** (brief final): 5x unconditional PASS, risk 15/125
- **v4** (code review): 3 showstoppers found, risk 75/125
- **v5** (code final): all blockers fixed, risk 16/125
