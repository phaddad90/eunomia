import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Logger } from 'pino';
import type { PrintPepperBoardClient } from './board-client.js';

/**
 * 30s presence heartbeat ticker (PH-078). While Mission Control is up and
 * an identity is set, POSTs to /api/admin/agents/heartbeat so the prod
 * platform_agent_presence row's `last_seen_at` advances. Captures the
 * pause back-channel from the response and surfaces it via callback so
 * the dashboard can flip the agent's pause UI state.
 *
 * Also records each post to ~/.printpepper/heartbeat-ticker-<AGENT>.jsonl —
 * empirical fire counts that cost.ts can fold in alongside the simulator
 * model (no Claude Code session needed; the ticker is its own measurable
 * fact).
 */

interface HeartbeatTickerOpts {
  cadenceMs?: number;
  logDir?: string;
  enabled?: boolean;
}

export interface HeartbeatResponse {
  paused: boolean;
  pause_reason: string | null;
}

export class PresenceHeartbeat {
  private timer: NodeJS.Timeout | null = null;
  private cadenceMs: number;
  private logDir: string;
  private enabled: boolean;
  private lastPaused: boolean | null = null;
  private lastReason: string | null = null;

  constructor(
    private client: PrintPepperBoardClient,
    private getIdentity: () => string,
    private logger: Logger,
    private onPauseChange: (paused: boolean, reason: string | null) => void,
    opts: HeartbeatTickerOpts = {},
  ) {
    this.cadenceMs = opts.cadenceMs ?? 30_000;
    this.logDir = opts.logDir ?? join(homedir(), '.printpepper');
    this.enabled = opts.enabled ?? true;
    if (!existsSync(this.logDir)) mkdirSync(this.logDir, { recursive: true });
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    // Fire one immediately so prod sees us within the first second of MC boot.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cadenceMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const code = this.getIdentity();
    if (!code) return;
    const ts = new Date().toISOString();
    try {
      const res = await this.client.heartbeat({});
      this.appendLog(code, ts, true);
      // Surface pause-state changes (back-channel from the heartbeat response).
      const paused = !!res?.paused;
      const reason = res?.pause_reason ?? null;
      if (paused !== this.lastPaused || reason !== this.lastReason) {
        this.lastPaused = paused;
        this.lastReason = reason;
        this.onPauseChange(paused, reason);
      }
    } catch (err) {
      this.appendLog(code, ts, false, err instanceof Error ? err.message : String(err));
      // Quiet log — heartbeat failures are noisy if the prod endpoint is
      // bundled-but-not-yet-deployed (PH-072); log at debug not warn.
      this.logger.debug({ code, err: err instanceof Error ? err.message : err }, 'heartbeat tick failed');
    }
  }

  private appendLog(code: string, ts: string, success: boolean, err?: string): void {
    try {
      const line = JSON.stringify({ ts, agent: code, source: 'mc-ticker', success, err }) + '\n';
      appendFileSync(join(this.logDir, `heartbeat-ticker-${code}.jsonl`), line);
    } catch { /* best-effort */ }
  }
}
