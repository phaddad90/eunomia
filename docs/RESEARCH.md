# Research Summary - Token Efficiency in Multi-Agent Systems

> Compiled 2026-04-09. Sources: GitHub issues, academic papers, Anthropic docs, community reports.

## Key Finding: Multi-Agent is 3-10x More Expensive

- Anthropic: "Multi-agent systems typically use 3-10x more tokens than single-agent approaches."
- Academic (April 2026): Single agents match or beat multi-agent at equal token budgets.
- Real-world: Multi-agent systems consume 4-220x more input tokens across seven datasets.

## Paperclip AI: What Actually Went Wrong

Paperclip's prompt to agents is ~100 chars. The bloat comes from:

1. **Session accumulation (~70%):** `--resume` carries full conversation history. Over 10+ heartbeats, sessions balloon to 11M+ input tokens.
2. **Skill file overhead:** 38KB of SKILL.md files loaded every heartbeat via `--add-dir`.
3. **MCP tool definitions:** 12 servers, 240 tools = 24,000 tokens per turn.
4. **Low session reuse:** Timer wakes reuse sessions only 14.6% of the time.

**User reports:**
- Same task: 1M tokens bare Claude Code vs 10M in Paperclip (GitHub #544)
- Max plan exhausted in 10 min with 5 agents (Discussion #2451)
- $300/day per agent on API (All-In Podcast)

## What the Research Says About Our Design Choices

### Memory Files (MEMORY.md Pattern)
- **Human-written context files improve success by ~4%** (ETH Zurich)
- **AI-generated context files reduce success by ~3% and increase costs by 20%+**
- Implication: SOUL.md and GOALS.md should be human-written. Agent MEMORY.md should be structured and reviewed.

### Persistent Sessions vs Spin-Up-Per-Task
- Persistent: Benefits from 90% prompt cache hit rate. Risks context accumulation.
- Per-task: Clean context, no accumulation. Loses caching benefit.
- Eunomia approach: CEO persistent (benefits from caching), workers per-task (clean context).

### CLAUDE.md Size
- Community consensus: under 50 lines / 2K tokens
- One developer's 42K-token CLAUDE.md was costing massive overhead
- Fix: 3-layer architecture reduced baseline consumption by 94%

### Auto-Compaction
- Triggers at ~75-83% context utilisation
- Achieves 60-80% reduction
- Lossy - critical details can be lost
- Mitigated by: keeping critical context in files (SOUL.md, GOALS.md), not conversation

### Model Routing
- Biggest single lever for cost reduction
- Opus for strategy/complex reasoning, Sonnet for 80% of coding, Haiku for lookups
- Thinking token cap (`MAX_THINKING_TOKENS`) is "the single biggest lever"

## Sources

- GitHub: paperclipai/paperclip Issues #544, #748, #906, #1183, #1348
- GitHub: paperclipai/paperclip Discussions #449, #2451, #2744
- Anthropic: "When to use multi-agent systems" (claude.com/blog)
- ArXiv: "Single-Agent LLMs Outperform Multi-Agent Systems" (2604.02460)
- ArXiv: "Stop Wasting Your Tokens" (2510.26585)
- Addy Osmani: "The Code Agent Orchestra" (addyosmani.com)
- systemprompt.io: "Claude Code Cost Optimisation Guide"
- sabrina.dev: "6 Ways I Cut My Claude Token Usage"
- Medium: "My CLAUDE.md Was Eating 42,000 Tokens Per Conversation"
- Iterathon: "Multi-Agent Orchestration Economics"
