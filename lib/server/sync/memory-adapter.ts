import "server-only";

import type { ClassifierLogRecord } from "@/lib/contracts/log";
import type { ParentSettings } from "@/lib/contracts";
import type { SyncAdapter } from "./adapter";

/**
 * In-memory implementation of `SyncAdapter`.
 *
 * STUB. Not durable. Resets on every cold start (Next.js dev server, Vercel
 * function cold boot, etc.). Suitable for local smoke-testing the round-trip
 * with `SYNC_BACKEND=memory` (the default). DO NOT use in production.
 *
 * The maps are module-scoped so multiple route handlers in the same process
 * see the same store. Memory growth is bounded by retention enforcement on
 * each `upsertLogs` call.
 */

interface StoredLog {
  record: ClassifierLogRecord;
  storedAtMs: number;
}

const settingsByParent = new Map<string, ParentSettings>();
const logsByParent = new Map<string, Map<string, StoredLog>>();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pruneExpired(parentId: string, retentionDays: number): void {
  const bucket = logsByParent.get(parentId);
  if (!bucket) return;
  const cutoff = Date.now() - retentionDays * MS_PER_DAY;
  for (const [id, entry] of bucket) {
    if (entry.storedAtMs < cutoff) {
      bucket.delete(id);
    }
  }
  if (bucket.size === 0) {
    logsByParent.delete(parentId);
  }
}

export const memoryAdapter: SyncAdapter = {
  async putSettings(parentId, settings, _retentionDays) {
    settingsByParent.set(parentId, { ...settings });
  },

  async getSettings(parentId) {
    const found = settingsByParent.get(parentId);
    return found ? { ...found } : null;
  },

  async deleteSettings(parentId) {
    settingsByParent.delete(parentId);
  },

  async upsertLogs(parentId, records, retentionDays) {
    if (!logsByParent.has(parentId)) {
      logsByParent.set(parentId, new Map<string, StoredLog>());
    }
    const bucket = logsByParent.get(parentId)!;
    const now = Date.now();
    const accepted: string[] = [];
    for (const record of records) {
      bucket.set(record.id, { record: { ...record }, storedAtMs: now });
      accepted.push(record.id);
    }
    pruneExpired(parentId, retentionDays);
    return { acceptedIds: accepted };
  },

  async deleteLog(parentId, id) {
    const bucket = logsByParent.get(parentId);
    if (!bucket) return;
    bucket.delete(id);
    if (bucket.size === 0) {
      logsByParent.delete(parentId);
    }
  },

  async bulkClearLogs(parentId) {
    const bucket = logsByParent.get(parentId);
    const count = bucket ? bucket.size : 0;
    logsByParent.delete(parentId);
    return { deletedCount: count };
  },

  async exportAll(parentId) {
    const settings = settingsByParent.get(parentId) ?? null;
    const bucket = logsByParent.get(parentId);
    const logs: ClassifierLogRecord[] = bucket
      ? Array.from(bucket.values())
          .map((entry) => ({ ...entry.record }))
          .sort((a, b) => b.timestampMs - a.timestampMs)
      : [];
    return { settings: settings ? { ...settings } : null, logs };
  },
};

/** Test/debug helper. Not wired to UI. */
export function _resetMemoryAdapterForTesting(): void {
  settingsByParent.clear();
  logsByParent.clear();
}
