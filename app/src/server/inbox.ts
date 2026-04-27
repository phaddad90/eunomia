import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Logger } from 'pino';
import type { AgentCode } from './types.js';

export interface InboxEntry {
  delivery_id: string;
  source: 'webhook' | 'audit';
  event: string;            // e.g. ticket.created
  ticket_id: string | null;
  ticket_human_id: string | null;
  actor: string | null;
  ts: string;               // ISO
  summary: string;
  processed: boolean;
}

export interface NormalizedEvent {
  delivery_id: string;
  source: 'webhook' | 'audit';
  action: string;           // ticket.created / .assigned / .commented / .status_changed
  ticket_id: string | null;
  ticket_human_id: string | null;
  actor: string | null;
  ts: string;
  // Optional pre-known fields from the source row, used to skip the round-trip
  hint_assignee_agent?: string | null;
  hint_audience?: string | null;
  hint_status?: string | null;
  hint_title?: string | null;
}

const FILTER_ACTIONS = new Set([
  'ticket.created',
  'ticket.assigned',
  'ticket.commented',
  'ticket.status_changed',
]);

export class InboxStore {
  private dir: string;
  private eventsPath: string;
  private processedPath: string;
  private seenDeliveryIds = new Set<string>();
  private processedIds = new Set<string>();

  constructor(rootDir = join(homedir(), '.printpepper'), private logger?: Logger) {
    this.dir = rootDir;
    this.eventsPath = join(rootDir, 'ceo-inbox.jsonl');
    this.processedPath = join(rootDir, 'ceo-inbox-processed.txt');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
    if (existsSync(this.eventsPath)) {
      const raw = readFileSync(this.eventsPath, 'utf-8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try { this.seenDeliveryIds.add(JSON.parse(line).delivery_id); } catch { /* skip bad line */ }
      }
    }
    if (existsSync(this.processedPath)) {
      const raw = readFileSync(this.processedPath, 'utf-8');
      for (const line of raw.split('\n')) {
        const id = line.trim();
        if (id) this.processedIds.add(id);
      }
    }
    this.logger?.info({ events: this.seenDeliveryIds.size, processed: this.processedIds.size }, 'inbox loaded');
  }

  /** Append a fully-resolved entry. Idempotent on delivery_id. Returns true if newly written. */
  append(entry: InboxEntry): boolean {
    if (this.seenDeliveryIds.has(entry.delivery_id)) return false;
    appendFileSync(this.eventsPath, JSON.stringify(entry) + '\n');
    this.seenDeliveryIds.add(entry.delivery_id);
    return true;
  }

  /** Mark one or more delivery_ids processed. Idempotent. */
  markProcessed(deliveryIds: string[]): number {
    let added = 0;
    const lines: string[] = [];
    for (const id of deliveryIds) {
      if (!this.processedIds.has(id)) {
        this.processedIds.add(id);
        lines.push(id);
        added++;
      }
    }
    if (lines.length) appendFileSync(this.processedPath, lines.join('\n') + '\n');
    return added;
  }

  /** Read all entries with the live processed flag computed. Newest-first. */
  list(): InboxEntry[] {
    if (!existsSync(this.eventsPath)) return [];
    const out: InboxEntry[] = [];
    const raw = readFileSync(this.eventsPath, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as InboxEntry;
        e.processed = this.processedIds.has(e.delivery_id);
        out.push(e);
      } catch { /* skip */ }
    }
    return out.sort((a, b) => b.ts.localeCompare(a.ts));
  }

  unprocessedCount(): number {
    let n = 0;
    for (const id of this.seenDeliveryIds) if (!this.processedIds.has(id)) n++;
    return n;
  }

  has(deliveryId: string): boolean { return this.seenDeliveryIds.has(deliveryId); }
}

/**
 * Decide if an event should hit CEO's inbox per the spec:
 *   - ticket.created AND (assignee_agent = CEO OR (audience = admin AND status = triage))
 *   - ticket.assigned AND assignee_agent = CEO
 *   - ticket.commented AND ticket.assignee_agent = CEO
 *   - ticket.status_changed AND ticket.assignee_agent = CEO
 *
 * Some audit rows lack the fields needed (commented/status_changed), so we fetch the
 * ticket as a fallback. Webhooks may include the full ticket.
 */
export async function shouldNotifyCeo(
  evt: NormalizedEvent,
  fetchTicket: (id: string) => Promise<{ assignee_agent: AgentCode | null; audience: string; status: string; title: string } | null>,
): Promise<{ relevant: boolean; reason?: string; ticket?: { assignee_agent: AgentCode | null; audience: string; status: string; title: string } }> {
  if (!FILTER_ACTIONS.has(evt.action)) return { relevant: false };

  // Try hint fields first
  const hintAssignee = evt.hint_assignee_agent ?? null;
  const hintAudience = evt.hint_audience ?? null;
  const hintStatus = evt.hint_status ?? null;

  if (evt.action === 'ticket.created') {
    if (hintAssignee === 'CEO') return { relevant: true, reason: 'created → CEO' };
    if (hintAssignee && hintAudience && hintStatus) {
      if (hintAudience === 'admin' && hintStatus === 'triage') return { relevant: true, reason: 'created admin/triage' };
    }
    // Need ticket lookup if we couldn't decide
    if (!evt.ticket_id) return { relevant: false };
    const t = await fetchTicket(evt.ticket_id);
    if (!t) return { relevant: false };
    if (t.assignee_agent === 'CEO') return { relevant: true, reason: 'created → CEO', ticket: t };
    if (t.audience === 'admin' && t.status === 'triage') return { relevant: true, reason: 'created admin/triage', ticket: t };
    return { relevant: false, ticket: t };
  }

  if (evt.action === 'ticket.assigned') {
    // For assigned events, audit details.assignee_agent (or details.to) is the new assignee.
    if (hintAssignee === 'CEO') return { relevant: true, reason: 'assigned → CEO' };
    if (!evt.ticket_id) return { relevant: false };
    const t = await fetchTicket(evt.ticket_id);
    if (t && t.assignee_agent === 'CEO') return { relevant: true, reason: 'assigned → CEO', ticket: t };
    return { relevant: false };
  }

  // commented / status_changed — depend on the ticket's current assignee
  if (!evt.ticket_id) return { relevant: false };
  const t = await fetchTicket(evt.ticket_id);
  if (t && t.assignee_agent === 'CEO') {
    return { relevant: true, reason: `${evt.action.replace('ticket.', '')} on CEO ticket`, ticket: t };
  }
  return { relevant: false };
}

export function summaryFor(evt: NormalizedEvent, ticket?: { title: string; assignee_agent: AgentCode | null }): string {
  const base = evt.ticket_human_id || evt.ticket_id || 'ticket';
  const verb = ({
    'ticket.created': 'new',
    'ticket.assigned': 'assigned',
    'ticket.commented': 'comment',
    'ticket.status_changed': 'status',
  } as Record<string, string>)[evt.action] || evt.action;
  const title = ticket?.title || evt.hint_title || '';
  const actor = evt.actor ? ` (${evt.actor})` : '';
  const trimmed = title.length > 70 ? title.slice(0, 67) + '…' : title;
  return `${base} · ${verb}${actor}${trimmed ? ' — ' + trimmed : ''}`;
}
