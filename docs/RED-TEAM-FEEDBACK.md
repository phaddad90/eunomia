# Red Team Feedback - Project Yunomia

> Five independent critics reviewed the brief on 2026-04-09.
> This document synthesises their findings into actionable themes.

---

## The Verdict Nobody Wanted to Hear

The Devil's Advocate was the most brutal: **"Yunomia is a procrastination project dressed up as productivity infrastructure."**

The argument: Peter has 26 weeks to build 20 microservices. Yunomia will take 3-4 weeks to build properly (not the 3 sessions the brief claims - there are 12 subsystems described). That's 2-3 fewer services shipped. The ROI only works if Yunomia makes the remaining work 2-3x faster, and nothing in the brief proves that.

The research Peter compiled himself argues against multi-agent: single agents match or beat multi-agent at equal token budgets. Claude Code's native Agent Teams feature already does CEO-to-worker delegation with `SendMessage`. The dashboard replaces things Peter already has (terminal, ClickUp, terminal prompt input).

**This is the most important question to answer before writing a single line of code: does Yunomia actually make Peter faster, or is it more fun to build a command centre than to grind through 20 microservices?**

---

## Theme 1: Cost Estimates Are 4-7x Too Low

The Token Economics critic stress-tested every number:

| Component | Brief Estimate | Realistic Estimate |
|-----------|---------------|-------------------|
| CEO heartbeats (input) | 240K tokens/day | 1,400K-2,400K |
| CEO strategic work | 200K tokens/day | 200K-500K |
| Workers (5 tasks) | 500K tokens/day | 2,000K-4,000K |
| **Daily total** | **~1M** | **3.6M-6.9M** |

**Why the brief is wrong:**
- System prompt overhead is ~3,500 tokens per turn (baked into the SDK, not controllable)
- Built-in Claude Code tools (Read, Write, Bash, etc.) add ~2,000-3,000 tokens on top of Yunomia's MCP tools
- Conversation history grows between compactions - by heartbeat 20, the CEO carries 100K+ tokens of history
- CEO output tokens on Opus ($75/MTok) are the single biggest cost driver - the brief doesn't separate input vs output
- Workers doing real work (15+ turns with file reads, code generation, testing) consume ~800K tokens each, not 100K

**26-week projection:** $5,200-$15,600 for the conservative case (5 tasks/day). Still cheaper than a junior dev, but not the "~1M tokens/day" the brief promises.

**Key recommendations:**
- Restate cost as a range: "3-5M tokens/day, $40-100/day"
- Separate input/output in all tracking (output can't be cached, always full price)
- Consider Sonnet CEO for routine heartbeats, Opus only for strategic sessions
- Kill and restart CEO session daily to avoid stale compaction summaries
- Add MEMORY.md rotation (max 2 weeks active, archive older)
- Auto-archive "done" tasks from board after 7 days

---

## Theme 2: Three Critical Safety Gaps (Score 20/25)

The Chaos Engineer found three risks rated maximum severity:

### 2a. Worker spawn flood (Risk Score: 20)
The CEO can spawn unlimited workers simultaneously. Nothing in the brief caps concurrency. 10 workers = 10 Claude API sessions = potential OOM on 16GB MacBook + massive token burn.

**Fix:** Hard `maxConcurrentWorkers = 3` in the process manager. The `spawn_worker` MCP tool must check this before creating a process. Non-negotiable.

### 2b. Worker writes to production code (Risk Score: 20)
Workers get read access to the full project folder. But SOUL.md instructions are advisory - nothing physically prevents a worker from modifying files it shouldn't. If Worker A modifies source files directly instead of writing to its output folder, those changes are invisible to the review workflow and may break Worker B.

**Fix:** Enforce write scope at the SDK level via `canUseTool` permission handler. Workers must be physically unable to write outside `workers/{task-id}/`. This is the difference between "we asked it not to" and "it can't."

### 2c. Unattended cost accrual (Risk Score: 20)
Peter goes to lunch. The CEO keeps running heartbeats, spawning workers, burning tokens. No circuit breaker. Over 2 hours unattended: 12 CEO heartbeats + 10+ worker sessions = significant spend with no human oversight.

**Fix:** `autoStopAfter` timer - if no human interaction for 60 minutes, pause all heartbeats and refuse new worker spawns. Also: daily token budget with hard stop. Also: optional `workingHours` config.

---

## Theme 3: board.json Will Corrupt and Race

Both the Architecture and Chaos critics flagged this independently:

**Corruption:** A crash during `fs.writeFile` produces a truncated JSON file. Every component that reads the board dies. The system is bricked.

**Race condition:** The CEO reads board.json, plans an update. Meanwhile, a worker completes and the server updates the same file. The CEO's write clobbers the worker completion. Tasks get stuck.

**Fix (Architecture critic's recommendation):** Don't use the JSON file as the source of truth. Hold board state in memory, serialize all read-modify-write operations through an async queue, and periodically flush to disk with atomic writes (write to `.tmp`, then `fs.rename`). Keep `.bak` as fallback. This eliminates both corruption and races in a single-process architecture.

---

## Theme 4: The Kanban Is the Wrong Abstraction

The UX critic made the strongest argument here:

> "AI agents don't work in kanban cadence. Tasks fly between columns in minutes. The 'In Progress' and 'Review' columns are transient - they reflect a state that lasts minutes, not hours. 3 of 5 columns will be empty most of the time."

**The granularity mismatch problem:** Peter thinks in features ("Build pricing engine"). The CEO thinks in tasks ("Wire /quote endpoint"). The board becomes the CEO's scratchpad, not Peter's overview. AI-generated micro-tasks drown human-created goals.

**Alternative proposed:** Two-level view:
- **Level 1 (Peter's view):** Goal tracker with progress bars. "Build pricing engine API: 3/8 tasks done."
- **Level 2 (Detail view):** Activity feed. Chronological log of what happened, expandable per-entry.

Or if keeping kanban: collapse to 3 columns (Planned, Active, Done), add filtering to hide CEO micro-tasks, add hierarchical tasks (goals → tasks).

---

## Theme 5: Onboarding Kills Momentum

The UX critic flagged that Peter must write 3 markdown files (PROJECT.md + CEO SOUL.md + CEO GOALS.md) with non-trivial content before seeing anything work. SOUL.md alone has 7 sections. This is 45-60 minutes of config before first proof-of-life.

**Fix:** One-command start with sensible defaults.
```
yunomia init /path/to/project
```
- Scans directory for README, package.json, existing docs
- Generates default PROJECT.md, SOUL.md, GOALS.md
- Launches dashboard immediately
- Banner: "Using defaults. Customise files to improve results."

Templates remain on disk for later customisation. The ~4% improvement from human-written context is an optimisation, not a prerequisite.

---

## Theme 6: Dashboard Will Be Unusable on a Laptop

On a 14" MacBook (1440x900 usable), stacking terminals + kanban + status cards + prompt input gives each section ~166px of height. A terminal with 8 visible lines is useless. A kanban with one visible card per column is useless.

**Fix:** Tabbed layout:
- **Tab 1 (Terminal):** CEO terminal full-width + prompt input. Worker terminals as sub-tabs when active.
- **Tab 2 (Board):** Full kanban/goal tracker. Takes the whole viewport.
- **Tab 3 (Status):** Agent cards, token usage, cost tracking.
- **Status bar (always visible, 32px):** CEO state, active worker count, today's token spend.

---

## Theme 7: SDK V2 Is Unstable - Need an Adapter

The Architecture critic rated this as high-risk:

> "The V2 API is marked 'unstable preview.' If it changes - and it will - you face a rewrite of process-manager.ts and mcp-server.ts at minimum."

**Fix:** Wrap the SDK in a thin `agent-adapter.ts` that exposes `spawnAgent`, `killAgent`, `resumeAgent`, `streamOutput`. When the SDK changes, update one file. Consider building Phase 1 against the CLI (`claude --model opus --add-dir ...`) and migrating to the SDK once it stabilises.

---

## Theme 8: Missing Components

Both Architecture and Chaos critics flagged these as absent but necessary:

| Missing | Severity | Effort |
|---------|----------|--------|
| `failed` task status in schema | High | Trivial |
| Structured logging (pino) | High | Low |
| Graceful shutdown (SIGTERM handler) | High | Medium |
| Health endpoint (`GET /health`) | Medium | Low |
| Orphan worker cleanup on restart | High | Medium |
| Worker timeout / watchdog | High | Low |
| Retry count per task (max 2 retries) | High | Low |
| Audit trail (`audit.jsonl`) | Medium | Low |
| Cost tracking per session/model/day | Medium | Medium |
| Git-backed project folder | Low | Low |

---

## Theme 9: The Existential Question

The Devil's Advocate's alternative recommendation:

> **Kill Yunomia. Do this instead:**
> 1. One service at a time, sequentially. One CLAUDE.md per service, human-written.
> 2. Use ClickUp as your kanban (you already pay for it).
> 3. Use Claude Code natively, with Agent Teams for genuinely parallel sub-tasks.
> 4. Model routing via CLAUDE.md instruction, not via orchestrator.
> 5. Session discipline via SESSION-LOG.md (you already do this).
> 6. If you must automate worker spawning, write a 50-line shell script.

The counter-argument: Yunomia could become a product itself. A lightweight, token-efficient alternative to Paperclip that other solo founders would use. But that's a different business case than "help Peter build Apprintable faster."

---

## Consensus Recommendations (All 5 Critics Agree)

1. **Validate the ROI before building.** Try running the Apprintable pricing engine Week 2 work with just Claude Code + ClickUp + a good CLAUDE.md. Measure tokens. Then estimate what Yunomia would save. If the answer is < 2x, don't build it.

2. **If building, cut scope ruthlessly.** The brief describes 12 subsystems. V1 needs: process manager, board API, terminal relay, prompt input. That's 4. Everything else is Phase 2+.

3. **Safety guardrails are not optional.** Concurrency cap, write scope enforcement, auto-pause on inactivity, daily budget cap. These must ship in V1.

4. **Board state in memory, not on disk.** Serialize operations, flush atomically. This one decision prevents the top concurrency and corruption risks.

5. **Cost transparency from day one.** Always-visible running cost counter in the dashboard. Per-session and per-model breakdown. Without this, Peter is flying blind.

---

## What Would Make This Worth Building

If Yunomia can demonstrate:
- **< 2x token cost** vs Paperclip for equivalent work output
- **3x throughput** vs single Claude Code session (measured in tasks completed/day)
- **Zero unattended damage** (safety guardrails hold under adversarial conditions)
- **< 2 week build time** (not 3-4 weeks)

Then it earns its place. But those numbers need to be proven, not assumed.
