import type { Logger } from 'pino';
import type { PrintPepperBoardClient } from './board-client.js';
import type { AgentCode } from './types.js';

/**
 * Thin client + cache for SA's PH-090 agents knowledge-base endpoints.
 *
 *   GET /api/admin/agents/[code]/kickoff — latest kickoff_md
 *   GET /api/admin/agents/[code]/soul    — latest soul_md
 *
 * Until SA's bundle deploys, every fetch returns null; callers fall back
 * to today's hardcoded / file-based source. Once the deploy lands, the
 * next cache miss starts returning live data and the fallback path
 * quietly stops firing — no MC restart required.
 */

interface CacheSlot<T> {
  value: T | null;
  expiresAt: number;
}

const POSITIVE_TTL_MS = 60_000;   // PH-090 spec: 60s positive cache
const NEGATIVE_TTL_MS = 30_000;   // shorter negative cache while deploy is in flight

export class AgentsKbClient {
  private kickoffCache = new Map<string, CacheSlot<string>>();
  private soulCache = new Map<string, CacheSlot<string>>();
  private consecutiveFailures = 0;
  private quietAfter = 3;

  constructor(
    private board: PrintPepperBoardClient,
    private logger: Logger,
  ) {}

  /** Returns the kickoff_md from prod, or null if upstream is unavailable. */
  async getKickoff(code: AgentCode): Promise<string | null> {
    return this.cached(this.kickoffCache, code, async () => {
      const r = await this.board.kbGetKickoff(code);
      // Tolerate three plausible response shapes until the contract crystallises.
      return (r.kickoff_md ?? r.agent?.kickoff_md ?? r.row?.kickoff_md) || null;
    });
  }

  /** Returns the soul_md from prod, or null if upstream is unavailable. */
  async getSoul(code: AgentCode): Promise<string | null> {
    return this.cached(this.soulCache, code, async () => {
      const r = await this.board.kbGetSoul(code);
      return (r.soul_md ?? r.agent?.soul_md ?? r.row?.soul_md) || null;
    });
  }

  /** Drop the cache (used after a PATCH or on identity_changed). */
  invalidate(): void {
    this.kickoffCache.clear();
    this.soulCache.clear();
  }

  private async cached(
    cache: Map<string, CacheSlot<string>>,
    key: string,
    fetcher: () => Promise<string | null>,
  ): Promise<string | null> {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
    try {
      const value = await fetcher();
      cache.set(key, { value, expiresAt: now + POSITIVE_TTL_MS });
      this.consecutiveFailures = 0;
      return value;
    } catch (err) {
      cache.set(key, { value: null, expiresAt: now + NEGATIVE_TTL_MS });
      this.consecutiveFailures++;
      if (this.consecutiveFailures <= this.quietAfter) {
        this.logger.debug({ key, err: err instanceof Error ? err.message : err }, 'agents KB fetch failed (likely PH-090 not yet deployed)');
      }
      return null;
    }
  }
}
