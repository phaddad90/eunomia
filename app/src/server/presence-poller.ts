import type { Logger } from 'pino';
import type { PrintPepperBoardClient } from './board-client.js';
import type { AgentPresence } from './types.js';

/**
 * 15s presence poller (PH-078). Mirrors the audit-poller pattern: server-
 * side polling, browser sees a single typed `presence_changed` WS event so
 * the dashboard's pulse-blink animation is data-driven, not a JS timer.
 *
 * Tolerates the prereq endpoint not being live yet (PH-072 bundled-but-not-
 * deployed) — first failure is logged at debug, suppressed thereafter so
 * MC startup logs stay quiet.
 */
export class PresencePoller {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private last: AgentPresence[] | null = null;
  private failureCount = 0;
  private quietAfter = 3;     // log only the first 3 failures, then go silent

  constructor(
    private client: PrintPepperBoardClient,
    intervalMs: number,
    private logger: Logger,
    private onPresence: (rows: AgentPresence[]) => void,
  ) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Snapshot of the most recent presence read; null until the first success. */
  snapshot(): AgentPresence[] | null { return this.last; }

  private async tick(): Promise<void> {
    try {
      const rows = await this.client.getPresence();
      // Mark alive client-side too so the UI doesn't depend on the server
      // having computed `is_alive` (defensive — SA's contract says they do,
      // but the field is optional in our type to tolerate version drift).
      const now = Date.now();
      const alive = (r: AgentPresence) => {
        if (typeof r.is_alive === 'boolean') return r.is_alive;
        try { return now - new Date(r.last_seen_at).getTime() < 60_000; } catch { return false; }
      };
      const annotated = rows.map((r) => ({ ...r, is_alive: alive(r) }));
      this.failureCount = 0;
      const changed = !this.last || JSON.stringify(annotated) !== JSON.stringify(this.last);
      this.last = annotated;
      if (changed) this.onPresence(annotated);
    } catch (err) {
      this.failureCount++;
      if (this.failureCount <= this.quietAfter) {
        this.logger.debug({ err: err instanceof Error ? err.message : err }, 'presence poll failed (likely PH-072 not yet deployed)');
      }
    }
  }
}
