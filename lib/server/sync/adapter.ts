import "server-only";

import type { ClassifierLogRecord } from "@/lib/contracts/log";
import type { ParentSettings } from "@/lib/contracts";

/**
 * Vendor-neutral cloud-sync adapter interface (VOL-195).
 *
 * The route handlers under `app/api/sync/**` depend only on this contract.
 * Swapping the backend (memory dev stub → Supabase → anything else) is a
 * single-file change in `lib/server/sync/index.ts` plus the new adapter
 * implementation.
 *
 * Each method is keyed on a `parentId` derived server-side from the
 * parent's local PIN hash + salt (see `app/api/sync/identity/route.ts`).
 * The id is opaque and not reversible to the PIN.
 */
export interface SyncAdapter {
  /** Upsert parent settings for `parentId`. Retention is enforced server-side. */
  putSettings(
    parentId: string,
    settings: ParentSettings,
    retentionDays: number,
  ): Promise<void>;

  /** Fetch parent settings, or null if none have been synced. */
  getSettings(parentId: string): Promise<ParentSettings | null>;

  /** Hard-delete parent settings. */
  deleteSettings(parentId: string): Promise<void>;

  /**
   * Upsert classifier-log records. The adapter is expected to enforce
   * retention by either evicting on read or sweeping on write. The
   * `acceptedIds` return lets the client confirm which rows were stored
   * and can be marked `syncedAtMs` locally.
   */
  upsertLogs(
    parentId: string,
    records: ClassifierLogRecord[],
    retentionDays: number,
  ): Promise<{ acceptedIds: string[] }>;

  /** Hard-delete a single classifier log record. */
  deleteLog(parentId: string, id: string): Promise<void>;

  /** Hard-delete every classifier log record for `parentId`. */
  bulkClearLogs(parentId: string): Promise<{ deletedCount: number }>;

  /** Export everything currently held server-side for `parentId`. */
  exportAll(
    parentId: string,
  ): Promise<{ settings: ParentSettings | null; logs: ClassifierLogRecord[] }>;
}

/** Thrown by adapter implementations when their env is not configured. */
export class MissingSyncEnvError extends Error {
  readonly code = "missing_sync_env" as const;
  constructor(message: string) {
    super(message);
    this.name = "MissingSyncEnvError";
  }
}
