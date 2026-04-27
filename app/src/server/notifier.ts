import { execFile } from 'child_process';
import type { Logger } from 'pino';

/**
 * macOS osascript notifier with a 30s throttle.
 *
 * Behaviour:
 *   - First notification fires immediately.
 *   - Inside the 30s window, additional notifications are coalesced into a "sticky"
 *     summary fired once the window closes.
 *   - Summary uses the most recent event's text, prefixed with "(+N more)".
 */
export class Notifier {
  private lastFiredAt = 0;
  private pending: { summary: string; count: number } | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly windowMs: number;
  private enabled: boolean;

  constructor(
    private logger: Logger,
    opts: { windowMs?: number; enabled?: boolean } = {},
  ) {
    this.windowMs = opts.windowMs ?? 30_000;
    this.enabled = opts.enabled ?? (process.platform === 'darwin');
  }

  notify(summary: string): void {
    if (!this.enabled) return;
    const now = Date.now();
    const elapsed = now - this.lastFiredAt;
    if (elapsed >= this.windowMs) {
      this.fire(summary);
      this.lastFiredAt = now;
      return;
    }
    // Inside throttle window: keep the latest, count the burst
    this.pending = {
      summary,
      count: (this.pending?.count ?? 0) + 1,
    };
    if (!this.flushTimer) {
      const wait = this.windowMs - elapsed + 50;
      this.flushTimer = setTimeout(() => this.flush(), wait);
    }
  }

  private flush(): void {
    this.flushTimer = null;
    if (!this.pending) return;
    const text = this.pending.count > 1
      ? `(+${this.pending.count - 1} more) ${this.pending.summary}`
      : this.pending.summary;
    this.fire(text);
    this.lastFiredAt = Date.now();
    this.pending = null;
  }

  private fire(text: string): void {
    // osascript is shell-safe via execFile (no shell interpolation). We still
    // escape double-quotes and backslashes inside the AppleScript literal.
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `display notification "${escaped}" with title "PrintPepper CEO" sound name "Glass"`;
    execFile('osascript', ['-e', script], (err) => {
      if (err) this.logger.warn({ err: err.message }, 'osascript notify failed');
    });
  }
}
