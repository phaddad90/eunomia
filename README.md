# Eunomia

```
 ███████╗██╗   ██╗███╗   ██╗ ██████╗ ███╗   ███╗██╗ █████╗
 ██╔════╝██║   ██║████╗  ██║██╔═══██╗████╗ ████║██║██╔══██╗
 █████╗  ██║   ██║██╔██╗ ██║██║   ██║██╔████╔██║██║███████║
 ██╔══╝  ██║   ██║██║╚██╗██║██║   ██║██║╚██╔╝██║██║██╔══██║
 ███████╗╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚═╝ ██║██║██║  ██║
 ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝
```

> *One brain. Many hands. No waste.*

A lean, browser-based command centre that runs a team of Claude Code agents from your terminal. One CEO thinks. Temporary workers execute. Everything streams live to `localhost:4600`. You stay in control.

Built because existing multi-agent tools burn 10x the tokens for the same output. Eunomia was designed from the ground up around token efficiency — three rounds of adversarial red-team review, 15 critics, stress-tested to a risk score of 15/125 before a single line of code was written.

---

## The idea

We started with a question: *why does multi-agent AI orchestration burn through token limits in minutes?*

We dug in. Studied Paperclip AI (36K GitHub stars, the leading orchestrator). Read the GitHub issues. Read the Reddit complaints. Read the source code. Found three root causes:

1. **Session accumulation.** Every heartbeat resumes the full conversation history. By heartbeat 10, you're carrying millions of tokens of stale context. One user reported 11.6M input tokens on a single heartbeat.
2. **Skill file bloat.** 38KB of instruction files loaded on every cycle, even when the agent needs 10% of them. Plus 240 MCP tool definitions adding 24K tokens per turn.
3. **No memory, just re-briefing.** Agents don't learn. They get told everything, every time. The "briefing" isn't the prompt — it's the architectural assumption that agents are stateless.

So we hypothesised: *what if agents were employees, not contractors?*

Contractors need a full brief every engagement. Employees build institutional knowledge. They have a role (SOUL.md), targets (GOALS.md), and working memory (MEMORY.md). They read files when they need context instead of being force-fed everything on every turn.

We stress-tested this through three rounds of adversarial red-team review — 15 critics across token economics, architecture, UX, chaos engineering, and strategic viability. The first round failed hard (5/5 FAIL). We revised. Failed again with conditions. Revised again. Third round: 5/5 unconditional PASS with an aggregate risk score of 15/125.

Then we built it. Then we ran a fourth round against the actual code — found the implementation had introduced new risks the brief couldn't have predicted (worker write isolation was silently broken, CEO could rewrite its own rules, server was network-accessible). Fixed all of them.

The result:

- **CEO persists.** One long-running session with auto-compaction. Context lives in files, not in bloated conversation history.
- **Workers are disposable.** Spawned for one task, scoped to one directory, killed on completion. Clean context every time.
- **7 tools, not 240.** ~600 tokens of tool overhead per turn.
- **TASKS.md is the board.** No database. A markdown file both human and AI read natively.
- **Safety is not optional.** 13 guardrails enforced at the SDK level, not by polite instructions in a prompt. Four rounds of red-team review to get here.

---

## Get running

### You need

- Node.js 22+
- Claude Code CLI, authenticated (`claude --version`)

### Install

```bash
git clone https://github.com/phaddad90/eunomia.git
cd eunomia/app
npm install
```

### Start

```bash
npm run dev -- --project /path/to/your/code
```

Open **http://localhost:4600**. That's it.

Eunomia scans your project, auto-generates context files, launches the CEO, and opens the dashboard. You'll see the CEO terminal streaming live within seconds.

```
Options:
  --project <path>    Target project directory (required)
  --port <number>     Dashboard port (default: 4600)
  --model <name>      CEO model (default: claude-sonnet-4-6)
```

---

## How it works

You point Eunomia at a project folder. It scans for context, generates a mission brief, and spins up a CEO agent in your browser. The CEO reads its soul and goals, checks the task board, and starts planning.

When it decides something needs building, it spawns a temporary worker — a separate Claude Code session scoped to its own directory, sandboxed from the rest of the codebase. The worker does the job and dies. The CEO reviews the output, updates the board, and moves on.

You watch the whole thing live in the dashboard. Prompt the CEO when you want to steer. Pause when you walk away. Kill workers that go sideways. The system tracks every token spent and writes a daily lessons-learned report.

```
                    ┌─────────────────────────────────┐
                    │     localhost:4600 (browser)     │
                    │                                  │
                    │  Terminals │ Tasks │ Status       │
                    │  ┌──────────────────────────┐   │
                    │  │  > You: build the API     │   │
                    │  │  CEO: On it. Spawning...  │   │
                    │  └──────────────────────────┘   │
                    │  [$4.20 today]  [Pause]  [Stop]  │
                    └──────────────┬──────────────────┘
                                   │ WebSocket + REST
                    ┌──────────────┴──────────────────┐
                    │        Eunomia Server            │
                    │                                  │
                    │  agent-adapter ── SDK wrapper     │
                    │    ├── CEO (persistent session)   │
                    │    └── Workers (spawn & kill)     │
                    │                                  │
                    │  tasks ────── TASKS.md cache      │
                    │  mcp-server ─ 7 tools for CEO    │
                    │  heartbeat ── adaptive (10m-60m)  │
                    │  safety ───── 13 SDK guardrails   │
                    │  metrics ──── analytics + reports │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────────┐
                    │         Your Project             │
                    │                                  │
                    │  PROJECT.md ── the mission        │
                    │  TASKS.md ──── the board          │
                    │  ceo/                             │
                    │    ├── SOUL.md ── who it is       │
                    │    ├── GOALS.md ─ what it targets │
                    │    └── MEMORY.md  what it learned │
                    │  workers/                         │
                    │    └── task-042/                  │
                    │         └── output/ ── the work   │
                    └─────────────────────────────────┘
```

**The CEO loop:** Read soul and goals. Check the board. Plan. Delegate. Review. Write lessons. Repeat. The heartbeat starts at 10 minutes and backs off when nothing's happening — doubles after 3 idle cycles, caps at 60 minutes, resets instantly when work arrives.

**The human loop:** Watch the terminal. Prompt when needed. Drag tasks around. Kill bad workers. Walk away — the inactivity pause stops spending after 60 minutes of silence. Come back, hit resume, pick up where you left off.

---

## The dashboard

Three tabs. Always-visible status bar. Always-visible prompt input.

**Terminals** — Full-width xterm.js CEO terminal with proper text wrapping. Worker terminals as expandable pills below — click to swap view, Back button to return. Your prompts echo in cyan (`> You: message`) so it reads like a conversation, not a black box.

**Tasks** — Live-rendered TASKS.md. Planned / Active / Done / Failed sections. Add tasks, retry failed ones, kill active workers — all inline.

**Status** — Per-agent cost breakdown, heartbeat info, safety guard status, today's metrics (tasks completed, success rate, spend, heartbeat skip rate, human interactions, CEO restarts).

**Prompt input** — Always visible, works from any tab. Multi-line supported — Shift+Enter for line breaks, Enter to send. Auto-resizes as you type.

**Status bar** — CEO state, worker count, today's spend. Goes amber at 80% budget, red at 100%.

---

## Configuration

Drop an `eunomia.config.json` in your project directory. Everything is optional — defaults are sane.

```json
{
  "safety": {
    "maxConcurrentWorkers": 3,
    "maxDailyBudgetUsd": 50,
    "maxWorkerRuntimeMinutes": 30,
    "maxRetries": 2,
    "inactivityPauseMinutes": 60,
    "heartbeatIntervalMinutes": 10,
    "maxCeoSessionHours": 8,
    "maxPlannedTasks": 20,
    "requireApprovalForSpawn": false,
    "workingHours": {
      "start": "09:00",
      "end": "22:00",
      "timezone": "Europe/London"
    }
  },
  "port": 4600,
  "ceoModel": "claude-sonnet-4-6"
}
```

---

## Safety

Thirteen guardrails. All ship in V1. Not negotiable.

| Guard | What happens | Default |
|-------|-------------|---------|
| Concurrency cap | Rejects spawn if at limit | 3 workers |
| Daily budget | Warns at 80%, hard stops at 100% | $50/day |
| Worker timeout | Kills worker, marks task failed | 30 min |
| Retry limit | Marks task failed, needs human | 2 retries |
| Inactivity pause | Pauses heartbeat when you're away | 60 min |
| Working hours | Pauses outside hours, auto-resumes | Off |
| Write isolation | Blocks Write/Edit outside worker dir | Always on |
| Bash blocked | Workers cannot use Bash. Period. | Always on |
| CEO session age | Saves memory, restarts fresh | 8 hours |
| CEO crash recovery | Auto-restarts, notifies dashboard | Always on |
| Spawn approval | Optional human approve/reject gate | Off |
| Orphan cleanup | Marks stale tasks failed on restart | Always on |
| Human kill | Dashboard kill button, preserves output | Always on |

Workers are sandboxed at the SDK level. `disallowedTools: ['Bash']` plus a `canUseTool` path guard on every Write/Edit/MultiEdit. The guard returns the SDK's `PermissionResult` type (`{ behavior: 'deny' }`) — not a polite suggestion, a hard block in the runtime.

The CEO is also guarded: it cannot modify its own SOUL.md or GOALS.md, preventing autonomous self-modification of its own rules. Server binds to `127.0.0.1` only — not network-accessible. Safety config PATCH validates all fields with type and range bounds (e.g., max 10 workers, max $500/day budget).

---

## Tuning your agents

Edit these in your project's `ceo/` folder:

**SOUL.md** — Who the CEO is. Personality, rules, decision-making style. Keep under 50 lines. Human-written context outperforms AI-generated by ~7% in controlled studies. Worth your time.

**GOALS.md** — KPIs and sprint targets. Update as your project evolves. The CEO reads this every session.

**PROJECT.md** — Auto-generated on first run from your README and package.json. Edit it to add what the scanner missed. This is the mission brief every agent sees.

Templates in `templates/` if you want a starting point.

---

## Metrics + analytics

Every event is tracked to `metrics.jsonl`:

- Heartbeat fired/skipped (with interval and token counts)
- Worker spawned/completed/killed (with model, duration, cost, success)
- Human interactions (prompts, pauses, kills, task edits)
- Cost milestones (25%, 50%, 80%, 100% of budget)
- CEO restarts (age limit, crash)

Daily reports auto-generate to `reports/YYYY-MM-DD.md` on shutdown. The CEO also writes a "Lessons Learned" entry to MEMORY.md on shutdown — what worked, what didn't, what to change tomorrow.

Trigger a daily review without shutting down:

```
POST /api/daily-review      CEO reviews metrics and writes lessons learned
GET  /api/metrics/summary   JSON summary of today's session
GET  /api/metrics/report    Markdown daily report
```

---

## Cost reality

No hand-waving. These are stress-tested estimates.

| Setup | Daily cost |
|-------|-----------|
| Opus CEO + Sonnet workers | $60 - $120 |
| Sonnet CEO + Sonnet workers | $30 - $70 |
| Sonnet CEO + Haiku workers | $20 - $50 |

For comparison: a single Claude Code session runs $5-15/day. Eunomia runs 4-6x that for multi-agent throughput. The alternative tools run 10x+.

---

## Tech

5 runtime deps. 0 client deps. No React. No database. No build step for the dashboard.

| | |
|---|---|
| Agent runtime | `@anthropic-ai/claude-agent-sdk` |
| Server | Express 5 + ws |
| Terminals | xterm.js via CDN |
| Logs | pino |
| CSS | Vanilla, dark theme |
| Build | tsx (dev), tsup (prod) |

---

## Roadmap

**v1.1 — Sharper CEO**
- Model routing per-heartbeat (Sonnet for routine checks, Opus for strategic planning)
- Configurable cold-start prompt templates
- Worker output summarisation (CEO writes 200-word digest, raw output archived)

**v1.2 — Better visibility**
- Historical cost graph on Status tab (last 7 days)
- Worker success rate trend line
- Sound/browser notifications on worker completion and safety alerts
- Command palette in prompt input (`/pause`, `/status`, `/spawn`)

**v1.3 — Smarter workers**
- Sandboxed Bash for workers (restricted to output dir only)
- Worker-to-worker file handoff (output of task A becomes input for task B)
- Task dependency chains (task B blocked until task A completes)
- Git auto-commit on worker completion

**v2.0 — Multi-project**
- Project switching in dashboard
- Cross-project CEO memory
- Shared worker pool
- Team mode (multiple humans, role-based access)

**Future**
- Goal hierarchy (goals break into tasks, progress bars roll up)
- Confirmation mode (CEO proposes, human approves before execution)
- Plugin system for custom MCP tools
- Remote deployment (run Eunomia on a server, access from anywhere)

---

## License

MIT

---

Built by [Peter Haddad](https://github.com/phaddad90). Designed with Claude Opus 4.6 through four rounds of red-team review (20 specialist critics) — because if you're going to let AI manage AI, you'd better stress-test it first.
