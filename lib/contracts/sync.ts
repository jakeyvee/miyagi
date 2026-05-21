import type { ClassifierLogRecord } from "./log";

/**
 * Cloud-sync contract additions (VOL-195).
 *
 * Sync is OFF by default everywhere. These types describe the opt-in
 * surface and the per-record consent flag mandated by the PDPA readiness
 * review (see `docs/pdpa-readiness-review.md` §7).
 *
 * Vendor-neutral: the adapter layer in `lib/server/sync/` decides where
 * the rows are persisted. A `memory` adapter is the default and is the
 * only adapter implemented in this PR. A `supabase` adapter is stubbed
 * for future wiring.
 */

export type SyncFeature = "settings" | "logs";

export interface SyncOptIn {
  /** Per-feature opt-in flags. Default both false. */
  settings: boolean;
  logs: boolean;
  /** Server-side retention window, days. Default 30. Bounded [1, 365]. */
  retentionDays: number;
}

/**
 * A log record extended with a per-record sync consent flag. Local default
 * `false`. The cloud-sync engine only uploads records that have BOTH the
 * global logs opt-in AND `syncConsent === true`. `syncedAtMs` is written
 * back locally once the server has acknowledged the record.
 */
export interface ClassifierLogRecordWithConsent extends ClassifierLogRecord {
  syncConsent?: boolean;
  syncedAtMs?: number;
}

export interface SyncStatus {
  lastSyncMs: number | null;
  lastErrorMessage: string | null;
  pendingUploads: number;
  featureFlags: SyncOptIn;
}
