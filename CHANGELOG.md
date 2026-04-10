# Changelog

All notable changes to Eunomia are documented here.

---

## v1.0.1 — 2026-04-10

Post-launch polish based on real-world usage and two additional red-team rounds (v4 code review + v5 final).

### New Features
- **Image attachments** — drag-and-drop or Cmd+V paste screenshots into the prompt area. Up to 5 images per message, sent as base64 content blocks to the CEO. Thumbnail previews with remove button.
- **Voice-to-text input** — Mic button (or press V) for browser-native speech recognition. Continuous recording with interim results. No external service.
- **Scheduled tasks** — set a future datetime when creating a task. Task sits in "Scheduled" section until due, then auto-activates to "Planned" for the CEO. Datetime picker in the Add Task bar. CEO can also create scheduled tasks via MCP.
- **Message timestamps** — HH:MM timestamp in grey after each human prompt and CEO response (2-second debounce on CEO output).
- **Version display** — app version shown in header bar and Status tab, pulled from package.json via health endpoint.
- **Sleep screen with restart command** — shutdown screen shows the exact `npm run dev` command with the real project path in a selectable box for quick copy-paste.
- **Project name in header** — extracted from the project path, shown next to "Eunomia" in the header bar.
- **"Pulled" task status** — human-removed tasks go to a "Pulled" section instead of being marked Done, preserving the audit trail.

### Bug Fixes
- **Tasks tab not updating** — MCP tool calls (CEO creating tasks, spawning workers) now broadcast to the dashboard via WebSocket. Added 5-second polling fallback.
- **Worker terminals always blank** — output callback was routed by taskId instead of session.id. Fixed with post-spawn wiring via `setOutputCallback()`.
- **Cost double-counting** — `recordSpend` was adding cumulative SDK totals on every update instead of tracking deltas. Now uses a `lastKnownCost` map.
- **Terminal word-splitting** — double-padding on terminal container (CSS padding + absolute offset) caused xterm FitAddon to compute wrong column count. Fixed to 20px offset only.
- **CEO crash restart loop** — health loop now tracks crash count within a 5-minute window. After 3 crashes, pauses the system instead of retrying forever.
- **Crashed worker fast-path** — active tasks with no matching worker session are now detected every 30 seconds and marked failed immediately, instead of waiting for the 30-minute timeout.

### Security Hardening (risk score 75→16)
- **CEO file guard expanded** — CEO cannot write to PROJECT.md or TASKS.md (must use MCP tools). Prevents mission redefinition via prompt injection.
- **MEMORY.md size guard** — blocks single writes over 100 lines or 4KB. Prevents context stuffing.
- **Worker SOUL.md sanitisation** — task titles/descriptions stripped of markdown headings and length-capped before injection into worker SOUL templates.
- **Server-side rate limiting** — `express-rate-limit` on `/api/prompt` (1/5s) and `POST /api/tasks` (1/2s).
- **Prompt length cap** — 8000 character max on REST and WebSocket prompt inputs.
- **Task input validation** — title max 200 chars, description max 1000 chars on REST endpoint.
- **Config file validation** — `eunomia.config.json` safety fields now pass through same type + range validators as the PATCH endpoint.
- **Approval timeout** — 10-minute auto-reject if human doesn't respond to spawn approval. Heartbeat skips while approval is pending.
- **Audit log rotation** — audit.jsonl rotates at 1MB.
- **MCP import failure surfaced** — broadcasts safety alert to dashboard if CEO starts without MCP tools.

### Token Efficiency
- Leaner heartbeat prompt: gives CEO permission to no-op when nothing changed.
- SOUL.md merged: Rules + How You Work + Boundaries collapsed into one section (~250 tokens, down from ~400).
- Daily Review section moved from SOUL.md to the daily review prompt (saves ~4K tokens/day of dead weight).
- Zod v4 import (matching SDK) with v3 fallback.

### Dashboard Polish
- Prompt input: taller (48px), larger font (14px), more bottom padding.
- Terminal: tighter line spacing (1.2), proper margins (20px).
- Prompt echo in terminal: `> You:` in cyan with multi-line continuation markers.
- Sleep screen: disables header buttons, disposes all worker terminals, stops status polling.

### Red Team Review History
- **v4** (first code review): 3 showstoppers found, risk 75/125
- **v5** (code final): all blockers fixed, risk 16/125

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
