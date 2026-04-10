# Eunomia Product Brief

## What We're Building

A subscription product that gives Claude Pro/Max users a visual command centre for AI agents. They download an app (or get a hosted URL), point it at their project, and watch agents build. No terminal. No CLI knowledge. One login.

Three tiers:
- **Free** - open-source repo, self-hosted, no support
- **Desktop ($5/mo)** - Tauri app (Mac + Windows), auto-updates, email support
- **Hosted ($15/mo)** - eunomia.app instance, zero installs, priority support
- **Team ($25/mo)** - hosted + multi-user + shared workers

## Target User

The 99% of Claude subscribers who've never opened a terminal. They know Claude is powerful. They've heard about Claude Code. They're intimidated by the command line. They want AI agents working for them but don't know where to start.

Our message: "You tell it what to build. It builds it. You watch."

## Build Sequence

| Phase | What | Time | Notes |
|-------|------|------|-------|
| 1 | Landing page + waitlist | 1 session | Static site, Vercel deploy, email capture |
| 2 | HN/Reddit launch of open-source repo | Same day | Free marketing, validate interest |
| 3 | Stripe integration | 30 min | Checkout + license key validation |
| 4 | Tauri desktop app (Mac + Windows) | 3-4 sessions | Bundles Node.js, auto-installs Claude Code CLI, user just auths |
| 5 | Server-hosted version | 4-5 sessions | Docker per user, reverse proxy, subdomain routing |
| 6 | CI/CD self-deploy pipeline | 1 session | GitHub Actions, auto-build Tauri + deploy server |
| 7 | Marketing automation | 1-2 sessions | Reddit keyword scanner, draft responses, human approves |

## Architecture

### Desktop App (Tauri)

```
Tauri App (Mac/Windows)
  |-- Native window (OS webview, ~5MB)
  |-- Bundled Node.js runtime
  |-- First launch:
  |     1. Installs Claude Code CLI (npm install -g @anthropic-ai/claude-code)
  |     2. Opens claude login in browser
  |     3. User authenticates with Anthropic
  |     4. Done - ready to use
  |
  |-- Eunomia server runs as sidecar process
  |-- Dashboard loads in the native webview
  |-- File picker for project selection (no terminal paths)
  |-- Auto-updater (Tauri built-in)
```

User experience: Download. Install. Login. Pick a folder. Go.

### Server-Hosted Version

```
eunomia.app
  |-- Landing page + auth (Stripe checkout)
  |-- User dashboard (manage instances)
  |
  v
Infrastructure
  |-- Instance Manager
  |     |-- Spins up Docker container per user
  |     |-- Assigns subdomain (peter.eunomia.app)
  |     |-- Manages lifecycle (start/stop/restart)
  |
  |-- Reverse Proxy (nginx/Caddy)
  |     |-- Routes subdomain to container
  |     |-- SSL termination
  |
  |-- User's Container
        |-- Eunomia server
        |-- Their project files (persistent volume)
        |-- Their Claude Code auth (user provides API key or OAuth)
```

User experience: Sign up. Pay. Get a URL. Login with Claude. Upload project (or connect GitHub). Go.

### Hosting Economics

| Resource | Cost/user/mo | Notes |
|----------|-------------|-------|
| Container (512MB RAM) | $2-3 | Hetzner CX22 fits 5-10 users |
| Storage (1GB) | $0.50 | Persistent volume |
| Bandwidth | ~$0 | Negligible |
| **Total** | **~$3-4** | |
| **Price** | **$15** | |
| **Margin** | **~75%** | |

### Stripe Integration

- Stripe Checkout for payment
- On success: generate license key (UUID), store in DB
- Desktop app: enter key on first launch, validate against API
- Hosted: Stripe webhook creates the container automatically
- Subscription management via Stripe Customer Portal (built-in)

## Landing Page

One page. Hero + 3 steps + pricing + FAQ + waitlist.

**Hero:** "Your AI team. One click."
**Subline:** "Point Eunomia at your project. Watch AI agents build, test, and deploy. No terminal. No CLI. Just results."

**3 steps:**
1. Install (or sign up for hosted)
2. Point at your project
3. Watch it build

**GIF/video:** 30-second dashboard demo - CEO spawning workers, terminal streaming, tasks completing.

**Pricing:** Simple 3-tier cards.

**FAQ:**
- "Do I need to know code?" - No. The CEO agent plans and delegates.
- "What's Claude Code?" - Anthropic's AI coding tool. Eunomia makes it visual.
- "How is this different from ChatGPT?" - ChatGPT chats. Eunomia builds.
- "Can I use my existing Claude subscription?" - Yes. Pro, Max, or API key.

Tech: Next.js static export or plain HTML. Deploy to Vercel.

## Marketing Strategy

### Launch Day
1. Post open-source repo to Hacker News (Show HN)
2. Post to r/ClaudeAI, r/ChatGPTPro, r/artificial, r/SideProject
3. Post to Twitter/X with dashboard GIF
4. Dev.to article: "I built a visual orchestrator for Claude Code agents"

### Ongoing
- Reddit keyword scanner: monitor "claude code", "ai agents", "multi agent", "claude pro", "claude max"
- Draft helpful responses (not spam) when people ask about Claude Code
- Human reviews and posts (no auto-posting - Reddit bans bots)
- Weekly blog post / changelog
- YouTube: 3-minute demo video
- ProductHunt launch when desktop app is ready

### Content Angle
Don't sell the product. Sell the transformation: "I went from typing prompts to running an AI company." Share the journey, the red team process, the token efficiency research. Developers respect transparency.

## Revenue Projections

| Milestone | Users | MRR | Profit/mo | Timeline |
|-----------|-------|-----|-----------|----------|
| Launch | 50 free, 10 paid | $150 | $100 | Month 1 |
| Traction | 200 free, 50 paid | $750 | $500 | Month 3 |
| Growth | 500 free, 150 paid | $2,250 | $1,500 | Month 6 |
| Scale | 2000 free, 500 paid | $7,500 | $5,500 | Month 12 |

Conservative. Assumes average $15/user (mix of desktop + hosted).

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Anthropic builds their own hosted orchestrator | High | Ship fast, build community, add multi-provider support |
| Claude Code CLI changes break Eunomia | Medium | Agent adapter layer already isolates SDK dependency |
| Low conversion from free to paid | Medium | Hosted version is the conversion engine - convenience sells |
| Support burden at scale | Medium | Self-service docs, community Discord, hosted version reduces "works on my machine" issues |
| Paperclip launches hosted version | Medium | Token efficiency + UX + safety are differentiators. They have tech debt, we don't. |

## Future Features

### Channels (Remote Access)
Connect Slack, Telegram, Discord, WhatsApp into Eunomia. Prompt the CEO from your phone. Get notifications when workers complete. Review task output on the go.

- Telegram Bot API (simplest - no approval process, instant setup)
- Slack App (workspace install, richer UI with blocks/buttons)
- Discord Bot (community-friendly)
- WhatsApp Business API (harder to get approved)

MVP: Telegram bot. User links their Telegram to their Eunomia instance. Messages to the bot go to the CEO. CEO responses come back. Task completions trigger notifications. All from your pocket.

### Self-Developing Pipeline
Eunomia runs against its own repo. CEO creates feature branches, workers implement, CEO reviews. Human approves PRs. GitHub Actions builds and deploys on merge. The product improves itself.

## Open Decisions

1. **Domain** - eunomia.app? eunomia.dev? eunomia.ai?
2. **Naming** - keep "Eunomia" or rebrand for consumer market?
3. **GitHub repo** - keep public (marketing) or go private (protect IP)?
4. **First hosted provider** - Hetzner (cheapest), DigitalOcean (easiest), Railway (container-native)?
5. **Desktop first or hosted first?** - Recommendation: both in parallel. Landing page validates demand, desktop app is the simpler product, hosted is the better business.
