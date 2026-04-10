# Eunomia - Project Brief (v3)

> *Eunomia: Greek goddess of good order and lawful conduct.*
> v3: 2026-04-09. Incorporates two rounds of red team review.

## What This Is

A browser-based command centre for managing Claude Code agent sessions. One persistent CEO agent plans and delegates. Temporary workers are spawned for specific tasks and killed on completion. A shared `TASKS.md` file is the coordination layer. A dashboard gives the human visibility, cost tracking, and intervention controls.

## Why It Exists (The Gap)

Claude Code's native Agent Teams feature handles orchestration but has gaps no existing tool fills:

| Gap | Native Agent Teams | Eunomia |
|-----|-------------------|---------|
| Browser dashboard | No (terminal only) | Yes |
| Per-agent cost tracking | No (aggregate only) | Yes |
| Per-agent budget caps | No | Yes |
| Persistence across restarts | No (ephemeral) | Yes |
| Per-agent directory scoping | No (shared cwd) | Yes |
| Configurable heartbeat | No (fixed 5min) | Yes |
| Concurrency limits | No | Yes |
| Worker write isolation | No | Yes (SDK-enforced) |
| Token efficiency | 3-5x single agent | Target: 4-6x single (honest) |

Existing open-source alternatives (Claudeck, Companion, OctoAlly) provide partial coverage but none combine cost tracking + write isolation + agent lifecycle + safety guardrails in one tool.

## Core Principles

1. **Safety guardrails are V1, not V2**
2. **Cost transparency from minute one** - always-visible spend counter
3. **Adapter layer around the SDK** - V2 is unstable, isolate the dependency
4. **One-command start** - defaults for everything, customise later
5. **Tabbed layout** - don't cram everything on one viewport
6. **Honest cost estimates** - 4-7M tokens/day, $40-100/day
7. **TASKS.md over a kanban board** - AI tasks move too fast for drag-and-drop columns

## Architecture

```
Browser (localhost:4600)
    |
    | WebSocket + REST
    v
Eunomia Server (Node.js, single process)
    |
    |-- agent-adapter.ts ---- SDK abstraction layer (swappable)
    |   |                     Wraps Claude Agent SDK V2
    |   |-- CEO Session       (persistent, auto-compacting)
    |   |-- Worker Sessions   (temporary, task-scoped)
    |
    |-- tasks.ts ------------ TASKS.md read/write + in-memory cache
    |                         Atomic file writes
    |                         audit.jsonl append-only log (daily rotation)
    |
    |-- mcp-server.ts ------- In-process MCP (7 tools for CEO)
    |                         try/catch every handler
    |
    |-- ws-relay.ts ---------- WebSocket per terminal
    |                          Scrollback cap: 1000 lines
    |                          Lazy-render: only focused terminal renders
    |                          Worker terminal: replaces CEO view on expand, "Back" to return
    |
    |-- heartbeat.ts --------- Adaptive interval scheduler
    |                          Default: 10 minutes
    |                          Skips if no tasks changed since last heartbeat
    |                          Doubles interval after 3 consecutive no-ops (max: 60 min)
    |                          Resets to base on any task state change
    |
    |-- safety.ts ------------ Guardrails module (see Safety section)
    |
    |-- logger.ts ------------ Structured logging (pino, daily rotation)
    |
    v
Project Folder (e.g. /projects/apprintable/)
    |-- PROJECT.md         (mission, goals - auto-generated, human-editable)
    |-- TASKS.md           (shared task list - CEO writes, human edits)
    |-- ceo/
    |   |-- SOUL.md        (human-written or sensible default)
    |   |-- GOALS.md       (human-written or sensible default)
    |   |-- MEMORY.md      (CEO writes, max 50 lines - see Rotation)
    |   |-- MEMORY-archive.md  (older entries, CEO reads only when needed)
    |
    |-- workers/           (temporary, created per-task, cleaned up after review)
        |-- task-042/
            |-- SOUL.md    (from template, read-only context)
            |-- output/    (work product)
```

## Task Management: TASKS.md

No kanban board. No database. No drag-and-drop. A markdown file that both the CEO and the human can read and edit directly.

**Format:**
```markdown
# Tasks

## Planned
- [ ] `task-043` Build pricing engine admin UI [sonnet] [high] [$2.00]
- [ ] `task-044` Write integration tests for /quote endpoint [sonnet] [medium] [$1.00]

## Active
- [~] `task-042` Wire /quote, /catalogue, /rules endpoints [sonnet] [high] [$2.00] - Worker-7 running (4m, $0.28)

## Done
- [x] `task-041` Scaffold pricing engine project structure [sonnet] [medium] [$0.52 actual]

## Failed
- [!] `task-040` Generate test fixtures for catalogue [haiku] [low] - Retry limit reached (2/2). Needs human review.
```

**Why TASKS.md over a board:**
- CEO reads/writes it natively - no MCP tool overhead for basic task tracking
- Human edits it in any text editor - no UI needed
- Git-trackable - full history for free
- Zero build cost - no board.ts, no SortableJS, no async queue
- The dashboard renders it as a formatted task list (read-only display, not interactive)

**In-memory cache:** The server reads TASKS.md on startup and caches it. MCP tool mutations update the cache and write back atomically. The dashboard polls the cache via REST (every 2 seconds) or receives WebSocket push on change.

**Task metadata** is encoded inline: `[model]` `[priority]` `[$budget]`. The server parses this. The CEO writes it naturally. The human can edit it by hand.

**Audit:** Every mutation appends to `audit.jsonl` with timestamp, actor (ceo/human/system), and the change description. Daily rotation (keep 7 days).

## Core Modules (V1 Scope)

### 1. Agent Adapter (`agent-adapter.ts`)

Thin wrapper around the Claude Agent SDK. Exposes:
```typescript
interface AgentAdapter {
  spawnSession(config: SessionConfig): AgentSession
  sendMessage(session: AgentSession, message: string): AsyncGenerator<StreamEvent>
  killSession(session: AgentSession): void
  resumeSession(sessionId: string, config: SessionConfig): AgentSession
  getSessionInfo(session: AgentSession): SessionInfo  // tokens, cost, status
}
```

If the SDK V2 API changes, only this file changes. If V2 is dropped entirely, this can be reimplemented against the CLI with `node-pty`.

**Session config includes:**
- `model`: string (e.g. `"claude-opus-4-6"`, `"claude-sonnet-4-6"`)
- `cwd`: working directory
- `additionalDirectories`: read access paths
- `mcpServers`: Eunomia MCP for CEO, none for workers
- `permissionMode`: CEO `auto`, workers use custom `canUseTool`
- `maxTurns`, `maxBudgetUsd`: per-session caps
- `persistSession`: true for CEO, false for workers
- `allowedTools` / `disallowedTools`: workers get Bash blocked (see Safety)

### 2. MCP Server (`mcp-server.ts`)

In-process SDK MCP server. Exposed to the CEO agent only. Every handler wrapped in try/catch - returns structured error to CEO on failure, never crashes the server.

**7 tools:**

| Tool | Purpose | ~Tokens |
|------|---------|---------|
| `tasks_list` | Read current TASKS.md (filtered by status) | 150 |
| `tasks_create` | Add a task to Planned section | 200 |
| `tasks_update` | Update status, notes, priority of a task | 200 |
| `spawn_worker` | Create a temporary worker for a specific task | 250 |
| `worker_status` | Check if a worker is still running + token spend | 150 |
| `kill_worker` | Force-stop a worker | 100 |
| `list_workers` | See all active workers with runtime + cost | 150 |

**Total tool definition overhead: ~1,200 tokens.** Plus Claude Code's built-in tools (~3,000 tokens). Total per-turn system overhead: ~4,200 tokens.

**`spawn_worker` enforces:**
- Checks `safety.canSpawnWorker()` (concurrency, budget, retry limit)
- Re-reads task status immediately before spawning (prevents race with human edits)
- If task status has changed since CEO last read, aborts and notifies CEO

**MCP tool calls are atomic:** if the CEO crashes mid-call, the queue either completes or discards the operation. No partial mutations.

### 3. Dashboard (`index.html` + `dashboard.js` + `styles.css`)

Single HTML page. No build step. No framework. Dark theme.

**Layout:**

```
+----------------------------------------------------+
|  Eunomia - [Project]  [$4.20 today]  [Pause] [Stop] |
+----------------------------------------------------+
|  [Terminals]  [Tasks]  [Status]                      |
+----------------------------------------------------+
|                                                      |
|  Tab 1 (Terminals) - DEFAULT VIEW                    |
|  +----------------------------------------------+   |
|  |  CEO Terminal (xterm.js, full width)           |   |
|  |  (or expanded Worker terminal with [Back] btn) |   |
|  +----------------------------------------------+   |
|  |  Workers: [W-1 ▸] [W-2 ▸] [W-3 ▸]            |   |
|  |  (click to expand, replaces CEO view)          |   |
|  +----------------------------------------------+   |
|                                                      |
|  Tab 2 (Tasks)                                       |
|  Rendered TASKS.md - formatted, read-only display    |
|  + [Add Task] button for human to create tasks       |
|  + Inline [Edit] per task for quick status changes   |
|  Tasks show: title, model, priority, budget,         |
|    cost (if done), retry count (if failed)           |
|                                                      |
|  Tab 3 (Status)                                      |
|  CEO: Opus, last heartbeat 2m ago, 142K tok today    |
|  W-1: Sonnet, task-042, 3m elapsed, $0.12 spent     |
|  W-2: Sonnet, task-043, 7m elapsed, $0.28 spent     |
|  Cost breakdown: CEO $2.40, Workers $1.80            |
|  Safety: All guards green / [Budget 62%] amber       |
|                                                      |
+----------------------------------------------------+
|  Status bar: CEO [Thinking] | 2 workers | $4.20 today|
|  (amber/red when safety warnings active)             |
+----------------------------------------------------+
|  > Prompt CEO: [____________________________] [Send] |
|  (always visible, works from any tab)                |
+----------------------------------------------------+
```

**Status bar (always visible, 32px):**
- CEO state: `Thinking` / `Waiting (next: 8m)` / `Paused` / `Stalled`
- Active worker count
- Today's total spend
- Changes colour: green (normal), amber (budget 80%+), red (safety triggered)

**Prompt input (always visible, tab-independent):**
- Sends message to CEO session
- Minimum 5-second interval between prompts (prevents spam)

**Worker terminal behaviour:**
- Expanding a worker replaces the CEO terminal view temporarily
- [Back to CEO] button returns to CEO terminal
- Worker terminals show: elapsed time, token spend, task name in header
- When worker completes/killed: terminal content preserved as static log, xterm instance freed

### 4. Safety Module (`safety.ts`)

**Non-negotiable. Ships in V1. Not optional.**

```typescript
interface SafetyConfig {
  maxConcurrentWorkers: number         // default: 3
  maxDailyBudgetUsd: number            // default: 50
  maxWorkerRuntimeMinutes: number      // default: 30
  maxRetries: number                   // default: 2
  inactivityPauseMinutes: number       // default: 60
  heartbeatIntervalMinutes: number     // default: 10
  maxCeoSessionHours: number           // default: 8
  requireApprovalForSpawn: boolean     // default: false
  workingHours?: {
    start: string                      // "09:00"
    end: string                        // "22:00"
    timezone: string                   // "Europe/London"
  }
}
```

**What it enforces:**

| Guard | Trigger | Action |
|-------|---------|--------|
| Concurrency cap | `spawn_worker` called | Reject if active workers >= max |
| Daily budget | Any token spend | Pause all at 100%. Warn at 80% (status bar amber). |
| Worker timeout | Worker running > max minutes | Kill worker, mark task `failed`, notify CEO |
| Retry limit | Task `retryCount` >= `maxRetries` | Mark task `failed`, require human |
| Inactivity pause | No human interaction for N min | Pause CEO heartbeat, show banner |
| Working hours | Outside configured hours | Pause everything, auto-resume |
| Worker write scope | Worker attempts Write/Edit outside folder | Block via `canUseTool` |
| Worker Bash blocked | Worker attempts Bash tool | Block entirely via `disallowedTools: ['Bash']` |
| CEO session age | CEO session > maxCeoSessionHours | Send "write to MEMORY.md", wait 30s, kill, cold-restart |
| CEO crash | CEO session dies unexpectedly | Auto-restart with cold-start prompt, notify dashboard |
| Spawn approval | `requireApprovalForSpawn` is true | Dashboard shows [Approve]/[Reject] before spawn |
| Orphan cleanup | Server restart with active tasks | Mark all `active` tasks as `failed` on startup |
| Human kills worker | Kill button pressed in dashboard | Kill process, mark task `failed`, preserve partial output |

**Worker isolation (the most critical guardrail):**

Workers are spawned with:
```typescript
{
  cwd: workerDir,                           // workers/{task-id}/
  additionalDirectories: [projectDir],      // read access to project
  disallowedTools: ['Bash'],                // NO shell access
  canUseTool: (tool, input) => {
    if (tool === 'Write' || tool === 'Edit') {
      if (!resolve(input.file_path).startsWith(resolve(workerDir))) {
        return { allowed: false, reason: 'Write restricted to worker directory' };
      }
    }
    return { allowed: true };
  },
  persistSession: false,
  maxBudgetUsd: task.maxBudgetUsd
}
```

Workers **cannot** write outside their folder (Write/Edit blocked by path check) **and cannot** use Bash (blocked entirely). This eliminates the Bash bypass vulnerability identified by the red team.

## MEMORY.md Rotation

CEO's MEMORY.md is capped at 50 lines. Rotation mechanism:

1. **Before each write:** Server checks MEMORY.md line count
2. **If > 50 lines:** Move all content to `MEMORY-archive.md` (append, not overwrite)
3. **CEO writes new entry** to a fresh MEMORY.md
4. **CEO's SOUL.md instructs:** "MEMORY.md is your active memory. MEMORY-archive.md exists for older context - read it only if you need historical decisions. Do not rewrite existing entries. Only write NEW decisions, blockers, or discoveries."
5. **Archive rotation:** MEMORY-archive.md is capped at 200 lines. Oldest entries are deleted when exceeded.

## Server Lifecycle

### Startup
1. Load `eunomia.config.json` (or create with defaults)
2. Load TASKS.md into memory cache (or create empty)
3. Scan for orphaned `active` tasks → mark `failed`
4. Resume CEO session (via stored session ID) or cold-start
5. Start heartbeat scheduler
6. Start Express server + WebSocket
7. Log: "Eunomia started. Project: {name}. CEO: {model}. Port: 4600."

### Shutdown (SIGTERM / SIGINT / Ctrl+C)
1. Stop heartbeat scheduler
2. Stop accepting new WebSocket connections
3. Send CEO: "Server shutting down. Write critical context to MEMORY.md."
4. Wait up to 30 seconds for CEO response
5. Kill all worker processes → mark their tasks `failed`
6. Flush TASKS.md cache to disk
7. Close all WebSocket connections (code 1001 Going Away)
8. Log: "Eunomia stopped. Session: {id}. Total spend: ${amount}."
9. Exit

### Health endpoint
`GET /health` returns:
```json
{
  "status": "ok",
  "uptime": 3600,
  "ceo": { "status": "running", "model": "opus", "sessionAge": "2h14m", "tokensToday": 142000 },
  "workers": { "active": 2, "max": 3 },
  "budget": { "spent": 4.20, "limit": 50, "percent": 8.4 },
  "tasks": { "planned": 3, "active": 2, "done": 5, "failed": 1 },
  "memory": { "rss": "245MB", "heapUsed": "128MB" }
}
```

### Structured logging
Using `pino` with daily rotation (keep 7 days). Log levels:
- `info`: heartbeat fired, worker spawned/killed, task status changes, cost milestones
- `warn`: budget 80%, worker timeout approaching, CEO session age 75%+, retry triggered
- `error`: SDK errors, session crashes, API failures, file write failures
- Separate log file per day: `logs/eunomia-2026-04-09.log`

## Onboarding

One command → dashboard in 30 seconds:

```bash
cd /path/to/eunomia/app
npm run start -- --project /path/to/my/code
```

The server:
1. Scans target directory for README, package.json, existing docs
2. Auto-generates `PROJECT.md` with discovered context
3. Creates `ceo/` folder with default SOUL.md and GOALS.md
4. Creates empty `TASKS.md`
5. Launches dashboard at localhost:4600
6. CEO starts, reads its defaults, introduces itself

Banner: "Using default configuration. Edit PROJECT.md, ceo/SOUL.md, or ceo/GOALS.md to improve results."

Templates remain in `/templates/` for reference. Human customisation is an optimisation (+4% from research), not a gate.

## Cost Estimate (Honest)

Based on two rounds of red team stress-testing. Input/output separated for accuracy.

| Component | Input Tokens/Day | Output Tokens/Day | Notes |
|-----------|-----------------|-------------------|-------|
| CEO heartbeats | 1.4M-2.4M | 200K-500K | ~34 effective beats (adaptive skip), ~30K avg input |
| CEO strategic work | 200K-500K | 100K-200K | Human-prompted planning sessions |
| Workers (5 tasks, Sonnet) | 1.5M-3M | 500K-1M | ~400-800K total per worker, ~60% input |
| CEO cold restart (1/day) | 20K | 5K | Re-ingest SOUL + GOALS + MEMORY + TASKS |
| **Daily total** | **3.1M-5.9M** | **0.8M-1.7M** | |

**Daily cost (mixed models):**

| Scenario | CEO Model | Worker Model | Est. Daily Cost |
|----------|-----------|-------------|-----------------|
| Full Opus CEO | Opus | Sonnet | $60-120/day |
| Sonnet CEO heartbeats | Sonnet (routine) + Opus (strategy) | Sonnet | $30-70/day |
| Budget mode | Sonnet | Sonnet + Haiku | $20-50/day |

**26-week projection:** $2,600-$15,600 depending on model mix and daily throughput.

**Comparison:**
- Paperclip: 10M+ tokens/day for equivalent output
- Single Claude Code session: ~500K-1M/day
- Eunomia: 4-6x single agent (honest; 3x is not achievable with heartbeat overhead)

## Tech Stack

| Component | Choice | Fallback |
|-----------|--------|----------|
| Agent runtime | `@anthropic-ai/claude-agent-sdk` V2 | CLI via `node-pty` |
| Server | Express + ws | - |
| Terminal UI | xterm.js (CDN) | - |
| Task display | Rendered markdown (server-parsed) | - |
| Logging | pino (daily rotation) | - |
| Styling | Vanilla CSS (dark theme) | - |
| Server build | tsup | - |

**Runtime dependencies:** 5 (express, ws, claude-agent-sdk, node-pty, pino)
**Dev dependencies:** 1 (tsup)
**Client dependencies:** 0 (CDN: xterm.js only - SortableJS removed)

## Project Structure

```
Project Eunomia/
|-- app/
|   |-- package.json
|   |-- tsconfig.json
|   |-- src/
|   |   |-- server/
|   |   |   |-- index.ts              # Express + WS + lifecycle
|   |   |   |-- agent-adapter.ts      # SDK wrapper
|   |   |   |-- tasks.ts             # TASKS.md read/write/cache
|   |   |   |-- mcp-server.ts        # 7 MCP tools for CEO
|   |   |   |-- heartbeat.ts         # Adaptive scheduler
|   |   |   |-- safety.ts            # All guardrails
|   |   |   |-- logger.ts            # Pino setup
|   |   |   |-- types.ts             # Shared types
|   |   |-- dashboard/
|   |       |-- index.html            # Single page, 3 tabs
|   |       |-- dashboard.js          # Vanilla JS
|   |       |-- styles.css            # Dark theme
|   |-- dist/
|
|-- templates/
|   |-- SOUL.md
|   |-- GOALS.md
|   |-- PROJECT.md
|
|-- docs/
|   |-- BRIEF.md                      # This document
|   |-- RESEARCH.md
|   |-- RED-TEAM-FEEDBACK.md
|   |-- RED-TEAM-v2-FEEDBACK.md
|
|-- projects/                          # Runtime (gitignored)
|   |-- apprintable/
|       |-- PROJECT.md
|       |-- TASKS.md
|       |-- ceo/
|       |-- workers/
|
|-- PROJECT-STATUS.md
```

## Build Sequence

### Phase 1: Server + Terminal (Session 1-2)
1. Package scaffold
2. `logger.ts` - pino with daily rotation
3. `agent-adapter.ts` - SDK wrapper with spawn/kill/stream/resume
4. `safety.ts` - full guardrails module
5. Express server + SIGTERM handler + health endpoint
6. WebSocket relay for terminal streaming
7. Dashboard: xterm.js CEO terminal + prompt input + status bar

**Deliverable:** Browser shows live CEO terminal. Human can prompt it. Safety guardrails active. Structured logging. Graceful shutdown.

### Phase 2: Tasks + MCP (Session 3)
8. `tasks.ts` - TASKS.md read/write/cache with atomic writes
9. `mcp-server.ts` - 7 tools wired to tasks + process manager
10. Dashboard: tasks tab (rendered TASKS.md, add/edit controls)
11. Wire CEO to MCP server

**Deliverable:** CEO can create/manage tasks. Human can see and edit task list.

### Phase 3: Workers + Polish (Session 4-5)
12. Worker lifecycle in process manager (spawn → work → report → kill)
13. Worker write isolation (`disallowedTools` + `canUseTool`)
14. Dashboard: worker terminal sub-tabs, status tab with cost breakdown
15. Heartbeat scheduler (adaptive interval)
16. CEO session age rotation (max 8 hours → restart)
17. MEMORY.md rotation mechanism
18. One-command project init with auto-generated defaults
19. Spawn approval mode (optional, `requireApprovalForSpawn`)
20. Orphan task cleanup on startup

**Deliverable:** Full system operational.

## What's NOT in V1

- Multi-project switching
- Kanban board / drag-and-drop
- Sound/notification system
- Command palette in prompt input
- Goal hierarchy (goals → tasks)
- Git auto-commit
- Board undo/history UI
- Worker Bash access (blocked for safety - may revisit with sandboxing in V2)

## Success Criteria

1. CEO + 3 workers running stably for 2+ hours without intervention
2. Daily token cost under $100 for meaningful work output
3. Zero cases of workers writing outside their output directory
4. Dashboard usable on a 14" laptop
5. Server restart recovers CEO session without data loss
6. Human can pause, intervene, and resume without breaking state
7. Task state never corrupts, even under concurrent mutations
8. Graceful shutdown completes in under 60 seconds
9. All safety guards testable and functional before first real project use
