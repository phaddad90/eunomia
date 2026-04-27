#!/usr/bin/env node --import tsx
/**
 * drain-inbox.ts — return unprocessed CEO inbox entries as JSON,
 * mark them processed, and exit. Idempotent on delivery_id: a second
 * call with the same entries already drained returns an empty array.
 *
 * Usage:
 *   node --import tsx app/scripts/drain-inbox.ts             # drain & mark
 *   node --import tsx app/scripts/drain-inbox.ts --peek      # read-only
 *
 * Output (stdout, JSON):
 *   { count: N, drained: [InboxEntry, ...], unprocessed_remaining: 0 }
 */

import { InboxStore } from '../src/server/inbox.js';

const peek = process.argv.includes('--peek');

const inbox = new InboxStore();
inbox.init();

const all = inbox.list();
const unprocessed = all.filter((e) => !e.processed);

if (!peek) {
  inbox.markProcessed(unprocessed.map((e) => e.delivery_id));
}

const drained = unprocessed.map((e) => ({ ...e, processed: !peek }));

process.stdout.write(JSON.stringify({
  count: drained.length,
  drained,
  unprocessed_remaining: peek ? unprocessed.length : 0,
}, null, 2) + '\n');
