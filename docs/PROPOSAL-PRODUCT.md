# Eunomia Product Proposal

## The Vision

Turn Eunomia from a developer tool into a subscription product for the 99% of Claude users who have a Pro subscription but have never opened a terminal. They want AI agents working for them but don't know where to start.

## Difficulty Assessment

### 1. Tauri Desktop App (Mac + Windows)

**Difficulty: Medium (2-3 weeks)**

What Tauri does: wraps your web UI in a native window. No Electron bloat (Tauri uses the OS webview - ~5MB vs Electron's ~150MB). Rust backend for system operations.

What's needed:
- `cargo install create-tauri-app` and scaffold around the existing dashboard
- The Express server runs as a sidecar process (Tauri launches it on app start)
- The dashboard connects to localhost like it does now
- Auto-updater built into Tauri (Tauri has this natively)
- Code signing for Mac (Apple Developer account, $99/year) and Windows (code signing cert, ~$200/year)
- DMG installer for Mac, MSI/NSIS for Windows

Challenges:
- Claude Code CLI must be installed separately - Tauri can check for it on startup and guide installation, but can't bundle it (it's Anthropic's binary)
- Node.js must be installed - or we bundle it with the app
- On Windows, node-pty (terminal emulation) has native compilation issues - may need prebuilt binaries

**The hard part isn't Tauri. It's the dependencies.** Your target user "doesn't know terminal" but needs Node.js + Claude Code CLI installed. Either:
- **(A) Bundle everything** - include Node.js runtime in the app, auto-install Claude Code CLI on first launch. App size ~100MB but zero user setup.
- **(B) Guided setup wizard** - on first launch, check for Node.js and Claude Code, walk the user through installing them with screenshots. Lighter app but more friction.
- **(C) Server-only model** - skip the desktop app entirely. Users just get a URL. No installs. (See section 4.)

**Recommendation:** Start with (C) server-only. Build the desktop app once you have paying users who demand it.

### 2. Subscription Model ($5/month)

**Difficulty: Low (1 week for the billing, ongoing for the business)**

Tech:
- Stripe Checkout for payments (~20 lines of integration)
- License key system: user pays, gets a key, enters it in the app/dashboard
- Server validates the key on startup (simple API call)
- For server-hosted version: Stripe manages the subscription, your server checks subscription status

The $5 price point:
- This is a tool that helps people use their EXISTING Claude subscription more effectively
- You're not providing AI - Anthropic is. You're providing the orchestration layer
- $5/mo is impulse-buy territory - good for adoption
- But your costs are near-zero (no AI API costs on your side), so margins are excellent
- Consider: $5/mo for the desktop app, $15-25/mo for the server-hosted version (you're paying for compute)

### 3. Targeting Non-Technical Users

**Difficulty: High (this is the real challenge)**

The product gap: Eunomia currently requires a terminal to start (`npm run dev`). Non-technical users need:

- **One-click install** - download DMG/EXE, drag to Applications, launch
- **Zero terminal** - the app handles everything internally. No `npm install`, no CLI commands
- **Claude Code setup wizard** - "Sign in with your Claude account" button that handles authentication
- **Project selector** - file picker instead of `--project /path/to/code`. But wait - what "code"? Your target user might not have a codebase
- **Use case templates** - "What do you want to build?" with options like "A website", "A business plan", "Marketing content", "Analyse my data"

The fundamental tension: Eunomia is built for developers managing codebases. Non-technical users don't have codebases. You're essentially building a different product - an AI task manager with a pretty UI, not a code orchestrator.

**Two paths:**
- **(A) Developer tool** - keep the current positioning. Target the ~5-10% of Claude users who code but find Claude Code intimidating. They have projects but don't want to manage agents manually. Price: $5-10/mo.
- **(B) General AI assistant** - strip out the code-specific features. Replace TASKS.md with a general task board. Workers do research, writing, analysis - not just code. Price: $5/mo. Much larger market but much more competition (you're competing with ChatGPT, Claude.ai itself, and every AI wrapper).

**Recommendation:** Path (A). The developer-but-scared-of-terminal niche is underserved and specific enough to market to. Path (B) is a different product entirely.

### 4. Server-Deployed Version (Hosted)

**Difficulty: Medium-High (3-4 weeks)**

This is actually the better business model. Users don't install anything - they get a URL.

Architecture:
```
Your Server (VPS/cloud)
  |-- User Management (accounts, subscriptions)
  |-- Instance Manager (spins up Eunomia per user)
  |-- Reverse Proxy (nginx, routes user.eunomia.app to their instance)
  |
  v
User's Eunomia Instance (containerised)
  |-- Their project files (persistent volume)
  |-- Their CEO agent session
  |-- Their dashboard at user.eunomia.app
```

Tech stack:
- Docker containers per user (isolate instances)
- Kubernetes or Docker Swarm for orchestration
- PostgreSQL for user accounts
- Stripe for billing
- Cloudflare for DNS + SSL
- Each user gets their own subdomain: `peter.eunomia.app`

Costs per user:
- Container: ~$3-5/mo for a small VPS slice (512MB RAM is enough for Eunomia)
- Storage: ~$0.50/mo for 1GB persistent volume
- Bandwidth: negligible
- At $15-25/mo per user, you're profitable at ~50% margin after hosting

The big advantage: users bring their OWN Claude API key or Claude Pro subscription. You never touch Anthropic's API. Your server just runs the orchestration layer.

Hosting options:
- **HostNinja / 20i** - shared hosting won't work for Docker containers. You need VPS.
- **Hetzner** - cheapest VPS in Europe. CX22 ($4.50/mo) handles 5-10 users per box.
- **DigitalOcean / Linode** - more expensive but easier to manage.
- **Railway / Fly.io** - container-native, auto-scaling, ~$5/container/mo.

### 5. Self-Developing / Self-Deploying

**Difficulty: Medium (it's mostly CI/CD)**

What you're describing is:
- Eunomia runs itself as a project
- It develops new features (the CEO creates tasks, workers write code)
- It deploys itself (CI/CD pipeline pushes to production)

This is doable with:
- GitHub Actions for CI/CD (build, test, deploy on push)
- Eunomia running against its own repo (`--project /path/to/eunomia`)
- The CEO creates feature branches, workers implement, CEO reviews
- Human (you) approves PRs before merge
- On merge, GitHub Actions builds Tauri apps + deploys server version

The self-developing part is more aspiration than architecture - it's Claude Code doing what it does, just managed by Eunomia. The self-deploying part is standard CI/CD.

### 6. Marketing Automation

**Difficulty: Low-Medium**

Reddit monitoring:
- Reddit API (free tier) - search for keywords like "claude code", "ai agents", "multi agent"
- Run a daily/hourly scan, surface relevant threads
- Draft responses (Eunomia CEO can do this)
- Human approves before posting (Reddit bans obvious bot accounts)
- Tools: PRAW (Python Reddit API Wrapper) or Snoowrap (Node.js)

Auto-posting is risky:
- Reddit's terms prohibit automated posting for marketing
- Better approach: Eunomia finds threads, drafts genuine helpful responses, you post them
- Focus on being helpful first, marketing second - "I built a tool that solves this exact problem, here's the repo"

Other channels:
- Hacker News (Show HN post when ready)
- Twitter/X (automated posting is fine here)
- Dev.to / Hashnode blog posts
- YouTube demo video (most impactful - show the dashboard, 3 minutes)

### 7. Website

**Difficulty: Low (1-2 days)**

Landing page needs:
- Hero: "Your AI team. One click." with a dashboard screenshot/GIF
- 3-step: Install > Point at your project > Watch it build
- Pricing: $5/mo desktop, $15/mo hosted
- Demo video (30-60 seconds)
- FAQ: "Do I need to know code?" "What's Claude Code?" "How is this different from ChatGPT?"

Tech: Static site (Next.js or even plain HTML). Deploy to Vercel/Netlify.

The messaging challenge: explaining to non-technical users what "AI agents" means without using jargon. Frame it as: "You tell it what to build. It builds it. You watch."

## Build Sequence

| Phase | What | Time | Revenue |
|-------|------|------|---------|
| 1 | Landing page + waitlist | 2 days | $0 (validation) |
| 2 | Server-hosted version (MVP) | 3-4 weeks | $15/mo per user |
| 3 | Stripe billing + user accounts | 1 week | Enables payments |
| 4 | Marketing (Reddit, HN, Twitter) | Ongoing | User acquisition |
| 5 | Tauri desktop app | 2-3 weeks | $5/mo per user |
| 6 | Self-development pipeline (CI/CD) | 1 week | Dev velocity |
| 7 | Marketing automation (Reddit scanner) | 1 week | Lead gen |

## Revenue Model

| Tier | Price | What they get |
|------|-------|---------------|
| Free | $0 | Open-source repo, run it yourself, no support |
| Desktop | $5/mo | Tauri app, auto-updates, email support |
| Hosted | $15/mo | eunomia.app hosted instance, no installs, priority support |
| Team | $25/mo | Hosted + multi-user + shared worker pool |

At 100 hosted users: $1,500/mo revenue, ~$500/mo hosting costs = $1,000/mo profit.
At 500 hosted users: $7,500/mo revenue, ~$2,000/mo hosting = $5,500/mo profit.
At 1000 desktop users: $5,000/mo revenue, ~$0 hosting = $5,000/mo profit.

## What to Do First

1. **Don't build the app yet.** Build the landing page. See if anyone signs up for the waitlist. If 100 people sign up in 2 weeks, you have a product. If 10 sign up, you have a hobby.

2. **Post on Hacker News and Reddit first.** The open-source repo is your marketing. Let people try it for free. Collect feedback. The paid product is the hosted convenience layer.

3. **Server-hosted before desktop.** Easier to deploy, easier to support, higher margin, no dependency hell. Desktop comes after you have revenue.

## Open Questions

1. **Naming** - "Eunomia" is great for a dev tool. For a consumer product targeting non-technical users, is it too obscure? "AgentDesk"? "AI Crew"? Or does the mythology add mystique?

2. **Claude dependency** - your entire product depends on Anthropic's Claude Code CLI. If they change the SDK, raise prices, or build their own hosted orchestrator, you're at risk. Mitigation: support multiple AI providers (OpenAI Codex, Gemini CLI).

3. **Competition** - Paperclip has 36K stars but no hosted version. If they launch one, they have brand recognition. Your advantage: token efficiency, safety guardrails, and UX focus. Ship fast.

4. **Legal** - using Claude's SDK in a commercial product. Check Anthropic's terms of service. The Agent SDK is MIT-licensed, so commercial use should be fine, but verify.
