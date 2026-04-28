import type { Logger } from 'pino';
import type { PrintPepperBoardClient } from './board-client.js';
import type { AuditRow, Ticket, TicketComment, WsMessage } from './types.js';

/**
 * Translate raw audit rows + write-endpoint side-effects into typed
 * WebSocket events the dashboard can apply incrementally without a full
 * board re-fetch.
 *
 * Each emitted message carries an `event_id` so the client can dedupe
 * between the local-write fast path and the audit-poll catch-up path
 * (the same mutation appears in both within 0–8s of each other).
 */
export class EventEmitter {
  // Bounded LRU of recently emitted event_ids — prevents the client from
  // applying the same change twice when local-write and audit-poll race.
  private readonly recent = new Set<string>();
  private readonly MAX = 256;

  constructor(
    private client: PrintPepperBoardClient,
    private logger: Logger,
    private broadcast: (m: WsMessage) => void,
  ) {}

  private emit(msg: WsMessage, eventId: string): void {
    if (this.recent.has(eventId)) return;
    this.recent.add(eventId);
    if (this.recent.size > this.MAX) {
      // Trim the oldest insertions (Set preserves insertion order)
      const overflow = this.recent.size - this.MAX;
      let i = 0;
      for (const id of this.recent) {
        if (i++ >= overflow) break;
        this.recent.delete(id);
      }
    }
    this.broadcast(msg);
  }

  /** Fast path: a local write produced a fresh ticket — emit immediately. */
  emitLocalTicketCreated(ticket: Ticket): void {
    const id = `local:created:${ticket.id}:${ticket.created_at}`;
    this.emit({ type: 'ticket.created', data: { event_id: id, ticket } }, id);
  }

  emitLocalTicketChanged(ticket_id: string, ticket_human_id: string, after: Partial<Ticket>, fields_changed: string[]): void {
    const id = `local:changed:${ticket_id}:${Date.now()}`;
    this.emit({
      type: 'ticket.changed',
      data: { event_id: id, ticket_id, ticket_human_id, after, fields_changed },
    }, id);
  }

  emitLocalCommentAdded(ticket_id: string, ticket_human_id: string, comment: TicketComment): void {
    const id = `local:comment:${comment.id}`;
    this.emit({ type: 'comment.added', data: { event_id: id, ticket_id, ticket_human_id, comment } }, id);
  }

  /**
   * Audit-poll path: derive granular events from a ticket.* audit row.
   * For ticket.created we fetch the full body once; for changes we use
   * the audit details directly to avoid a roundtrip when possible.
   */
  async emitFromAudit(row: AuditRow): Promise<void> {
    const d = row.details || {};
    const ticket_id = (d.id as string | undefined) ?? (d.ticket_id as string | undefined);
    const ticket_human_id = row.target ?? '';
    if (!ticket_id) return;

    const eventId = `audit:${row.id}`;
    if (this.recent.has(eventId)) return;

    switch (row.action) {
      case 'ticket.created': {
        try {
          const full = await this.client.getTicket(ticket_id);
          this.emit({ type: 'ticket.created', data: { event_id: eventId, ticket: full.ticket } }, eventId);
        } catch (err) {
          this.logger.warn({ err: errMsg(err), ticket_id }, 'audit ticket.created: ticket fetch failed');
        }
        return;
      }
      case 'ticket.status_changed': {
        const after: Partial<Ticket> = {};
        if (d.to) after.status = d.to as Ticket['status'];
        this.emit({
          type: 'ticket.changed',
          data: { event_id: eventId, ticket_id, ticket_human_id, after, fields_changed: ['status'] },
        }, eventId);
        return;
      }
      case 'ticket.assigned': {
        const after: Partial<Ticket> = {};
        if (d.assignee_agent !== undefined) after.assignee_agent = d.assignee_agent as Ticket['assignee_agent'];
        else if (d.to !== undefined) after.assignee_agent = d.to as Ticket['assignee_agent'];
        this.emit({
          type: 'ticket.changed',
          data: { event_id: eventId, ticket_id, ticket_human_id, after, fields_changed: ['assignee_agent'] },
        }, eventId);
        return;
      }
      case 'ticket.updated': {
        // Generic edit: audit lacks the new field set, so refetch.
        try {
          const full = await this.client.getTicket(ticket_id);
          this.emit({
            type: 'ticket.changed',
            data: {
              event_id: eventId,
              ticket_id,
              ticket_human_id,
              after: full.ticket,
              fields_changed: Array.isArray(d.fields_changed) ? d.fields_changed as string[] : ['*'],
            },
          }, eventId);
        } catch (err) {
          this.logger.warn({ err: errMsg(err), ticket_id }, 'audit ticket.updated: ticket fetch failed');
        }
        return;
      }
      case 'ticket.commented': {
        // Audit only carries the comment_id; fetch the comments list and
        // emit the matching one. Falls back silently if list-fetch fails.
        const comment_id = d.comment_id as string | undefined;
        if (!comment_id) return;
        try {
          const list = await this.client.listComments(ticket_id);
          const comment = list.find((c) => c.id === comment_id);
          if (comment) {
            this.emit({
              type: 'comment.added',
              data: { event_id: eventId, ticket_id, ticket_human_id, comment },
            }, eventId);
          }
        } catch (err) {
          this.logger.warn({ err: errMsg(err), ticket_id }, 'audit ticket.commented: comment fetch failed');
        }
        return;
      }
      case 'ticket.comment.deleted': {
        const comment_id = (d.comment_id as string | undefined) ?? (d.id as string | undefined);
        if (!comment_id) return;
        this.emit({ type: 'comment.deleted', data: { event_id: eventId, ticket_id, comment_id } }, eventId);
        return;
      }
      default:
        return;
    }
  }

  noteLocalEventId(id: string): void { this.recent.add(id); }
}

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
