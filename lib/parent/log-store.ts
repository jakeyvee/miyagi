/**
 * Client-only IndexedDB wrapper for parent-facing classifier logs.
 *
 * Storage layout:
 *   Database:    kid-quest-logs (version 2)
 *   Store:       classifier_logs
 *   Key path:    id (string)
 *   Indexes:
 *     by_timestamp on timestampMs (used to page newest-first)
 *     by_sync_consent on syncConsent (v2+; consented-records query)
 *
 * v1 records (no `syncConsent`) remain readable; they are treated as
 * `syncConsent: false` (i.e. NOT eligible for cloud sync) per VOL-195.
 * Per the PDPA review §7.1, logs created before opt-in must not be
 * backfilled — keeping the default false is the load-bearing guarantee.
 *
 * VOL-195 added an OPT-IN sync engine that reads from this store via
 * `listUnsyncedConsentedLogs`. The kid flow never blocks on storage
 * failures here.
 */

import { isVerdict, type ClassifierLogRecord } from "@/lib/contracts";
import type { ClassifierLogRecordWithConsent } from "@/lib/contracts/sync";

const DB_NAME = "kid-quest-logs";
const DB_VERSION = 2;
const STORE_NAME = "classifier_logs";
const TIMESTAMP_INDEX = "by_timestamp";
const SYNC_CONSENT_INDEX = "by_sync_consent";

const DEFAULT_PAGE_SIZE = 50;

function hasIndexedDB(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      const oldVersion = event.oldVersion;

      // v1: create the store + by_timestamp index.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex(TIMESTAMP_INDEX, "timestampMs", { unique: false });
      }

      // v2 migration: add the by_sync_consent index. We do NOT add or change
      // any fields on existing rows — they keep their original shape and are
      // treated as syncConsent === false by readers. Per VOL-195 we must not
      // backfill consent on rows that pre-date the opt-in.
      if (oldVersion < 2 && tx) {
        const store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains(SYNC_CONSENT_INDEX)) {
          // multiEntry off; sparse index — only rows that carry the field
          // appear, which is exactly what we want.
          store.createIndex(SYNC_CONSENT_INDEX, "syncConsent", {
            unique: false,
          });
        }
      }
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open log database."));
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onblocked = () => {
      reject(new Error("Log database upgrade blocked by another tab."));
    };
  });
}

function isClassifierLogRecord(value: unknown): value is ClassifierLogRecord {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || c.id.length === 0) return false;
  if (typeof c.sessionId !== "string" || c.sessionId.length === 0) return false;
  if (typeof c.timestampMs !== "number" || !Number.isFinite(c.timestampMs)) return false;
  if (typeof c.input !== "string") return false;
  if (!isVerdict(c.verdict)) return false;
  if (typeof c.confidence !== "number" || !Number.isFinite(c.confidence)) return false;
  if (c.confidence < 0 || c.confidence > 1) return false;
  return true;
}

function readConsentFields(
  value: unknown,
): { syncConsent: boolean; syncedAtMs: number | undefined } {
  if (!value || typeof value !== "object") {
    return { syncConsent: false, syncedAtMs: undefined };
  }
  const c = value as Record<string, unknown>;
  const consent = c.syncConsent === true;
  const synced =
    typeof c.syncedAtMs === "number" && Number.isFinite(c.syncedAtMs)
      ? (c.syncedAtMs as number)
      : undefined;
  return { syncConsent: consent, syncedAtMs: synced };
}

function withConsent(record: ClassifierLogRecord, raw: unknown): ClassifierLogRecordWithConsent {
  const { syncConsent, syncedAtMs } = readConsentFields(raw);
  const out: ClassifierLogRecordWithConsent = { ...record };
  if (syncConsent) out.syncConsent = true;
  if (typeof syncedAtMs === "number") out.syncedAtMs = syncedAtMs;
  return out;
}

/**
 * Best-effort append. Never throws to the caller — failures are logged so
 * the kid flow stays uninterrupted when storage is full, denied, or absent.
 *
 * Accepts either a plain `ClassifierLogRecord` (the historical signature,
 * unchanged) or a record with optional consent fields. Default is
 * `syncConsent: false`.
 */
export async function appendLog(
  record: ClassifierLogRecord | ClassifierLogRecordWithConsent,
): Promise<void> {
  if (!hasIndexedDB()) {
    // Silently no-op outside the browser (e.g. SSR). The bridge guards on
    // this too, but defending here keeps the API safe for any caller.
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Log write transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Log write transaction aborted."));
      tx.objectStore(STORE_NAME).put(record);
    });
    db.close();
  } catch (cause) {
    console.warn("[kid-quest] appendLog failed", cause);
  }
}

interface ListLogsOpts {
  limit?: number;
  beforeTimestampMs?: number;
}

/**
 * Returns logs newest-first. Walks the `by_timestamp` index in reverse and
 * stops at `limit` rows. If `beforeTimestampMs` is set, only rows with a
 * timestamp strictly less than that bound are returned (used to paginate).
 *
 * Signature unchanged from v1. Callers receive `ClassifierLogRecord[]`;
 * consent fields are stripped at this boundary so legacy callers see no
 * shape change. Use `listConsentedLogs` / `listUnsyncedConsentedLogs` when
 * you actually need the consent metadata.
 */
export async function listLogs(opts: ListLogsOpts = {}): Promise<ClassifierLogRecord[]> {
  const limit = Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE);
  const before = opts.beforeTimestampMs;

  const db = await openDb();
  try {
    return await new Promise<ClassifierLogRecord[]>((resolve, reject) => {
      const out: ClassifierLogRecord[] = [];
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index(TIMESTAMP_INDEX);
      const range = typeof before === "number"
        ? IDBKeyRange.upperBound(before, true)
        : null;
      const request = index.openCursor(range, "prev");

      request.onerror = () => reject(request.error ?? new Error("Log read cursor failed."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        const value = cursor.value;
        if (isClassifierLogRecord(value)) {
          // Strip any consent fields before yielding to legacy callers.
          const { id, sessionId, timestampMs, input, verdict, confidence } = value;
          out.push({ id, sessionId, timestampMs, input, verdict, confidence });
        }
        cursor.continue();
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Same paging shape as `listLogs`, but returns rows along with their
 * consent metadata. Used by the cloud-sync engine and by the per-row
 * consent toggle UI.
 */
export async function listLogsWithConsent(
  opts: ListLogsOpts = {},
): Promise<ClassifierLogRecordWithConsent[]> {
  const limit = Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE);
  const before = opts.beforeTimestampMs;

  const db = await openDb();
  try {
    return await new Promise<ClassifierLogRecordWithConsent[]>((resolve, reject) => {
      const out: ClassifierLogRecordWithConsent[] = [];
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index(TIMESTAMP_INDEX);
      const range = typeof before === "number"
        ? IDBKeyRange.upperBound(before, true)
        : null;
      const request = index.openCursor(range, "prev");

      request.onerror = () => reject(request.error ?? new Error("Log read cursor failed."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        const value = cursor.value;
        if (isClassifierLogRecord(value)) {
          out.push(withConsent(value, value));
        }
        cursor.continue();
      };
    });
  } finally {
    db.close();
  }
}

export async function clearLogs(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Log clear transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Log clear transaction aborted."));
      tx.objectStore(STORE_NAME).clear();
    });
  } finally {
    db.close();
  }
}

export async function countLogs(): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).count();
      request.onerror = () => reject(request.error ?? new Error("Log count failed."));
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

/**
 * Set / unset the per-record sync consent flag. NEVER throws to the kid
 * flow — failure is logged. If the record id doesn't exist, this is a
 * no-op (callers shouldn't have a stale UI handle).
 */
export async function setLogSyncConsent(id: string, consent: boolean): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onerror = () =>
          reject(getReq.error ?? new Error("Log consent read failed."));
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (!existing || !isClassifierLogRecord(existing)) {
            // Record missing — silently complete the transaction.
            resolve();
            return;
          }
          const next: ClassifierLogRecordWithConsent = {
            ...(existing as ClassifierLogRecord),
            syncConsent: consent,
          };
          // If consent is being revoked, drop any prior `syncedAtMs` mark
          // so the row no longer counts as "already synced." Server-side
          // deletion of the row itself is a separate explicit action.
          if (!consent) {
            delete next.syncedAtMs;
          } else if (
            typeof (existing as ClassifierLogRecordWithConsent).syncedAtMs ===
            "number"
          ) {
            next.syncedAtMs = (existing as ClassifierLogRecordWithConsent).syncedAtMs;
          }
          const putReq = store.put(next);
          putReq.onerror = () =>
            reject(putReq.error ?? new Error("Log consent write failed."));
          putReq.onsuccess = () => resolve();
        };
        tx.onerror = () =>
          reject(tx.error ?? new Error("Log consent transaction failed."));
        tx.onabort = () =>
          reject(tx.error ?? new Error("Log consent transaction aborted."));
      });
    } finally {
      db.close();
    }
  } catch (cause) {
    console.warn("[kid-quest] setLogSyncConsent failed", cause);
  }
}

interface ConsentedListOpts {
  limit?: number;
}

/**
 * Returns records that currently have `syncConsent: true`. Newest-first.
 * Used by the cloud-sync engine to enumerate uploads.
 */
export async function listConsentedLogs(
  opts: ConsentedListOpts = {},
): Promise<ClassifierLogRecordWithConsent[]> {
  const limit = Math.max(1, opts.limit ?? 1000);
  if (!hasIndexedDB()) return [];

  const db = await openDb();
  try {
    return await new Promise<ClassifierLogRecordWithConsent[]>((resolve, reject) => {
      const out: ClassifierLogRecordWithConsent[] = [];
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      // Sparse index — only rows with a true syncConsent appear.
      const index = store.index(SYNC_CONSENT_INDEX);
      // Boolean keys are odd in IndexedDB; key range over [1, 1] catches
      // truthy stored values for browsers that accept booleans (most do
      // not). We fall back to a full scan if the index range yields zero
      // rows. The fall-back is the load-bearing path here.
      const request = store.openCursor(null, "prev");
      // Use store-level scan to be portable across browsers' boolean-key
      // behaviour. We still keep the index defined so future readers can
      // optimise without a schema bump.
      void index; // silence unused-warning in builds that lint it
      request.onerror = () =>
        reject(request.error ?? new Error("Consent scan cursor failed."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        const value = cursor.value;
        if (isClassifierLogRecord(value)) {
          const { syncConsent } = readConsentFields(value);
          if (syncConsent) {
            out.push(withConsent(value, value));
          }
        }
        cursor.continue();
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Returns consented records that have not yet been acknowledged by the
 * server (`syncedAtMs` absent). The cloud-sync engine batches these on
 * each `runSync()` call.
 */
export async function listUnsyncedConsentedLogs(
  opts: ConsentedListOpts = {},
): Promise<ClassifierLogRecordWithConsent[]> {
  const rows = await listConsentedLogs(opts);
  return rows.filter((r) => typeof r.syncedAtMs !== "number");
}

/**
 * Marks a set of record ids as synced (writes `syncedAtMs`). Best-effort.
 * Per-id failures are swallowed so a partial success still records what
 * succeeded. Used by the cloud-sync engine on successful upload ACKs.
 */
export async function markLogsSynced(ids: string[], syncedAtMs: number): Promise<void> {
  if (!hasIndexedDB() || ids.length === 0) return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error ?? new Error("markLogsSynced transaction failed."));
        tx.onabort = () =>
          reject(tx.error ?? new Error("markLogsSynced transaction aborted."));
        for (const id of ids) {
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const existing = getReq.result;
            if (!existing || !isClassifierLogRecord(existing)) return;
            const next: ClassifierLogRecordWithConsent = {
              ...(existing as ClassifierLogRecord),
              syncConsent:
                (existing as ClassifierLogRecordWithConsent).syncConsent === true,
              syncedAtMs,
            };
            store.put(next);
          };
        }
      });
    } finally {
      db.close();
    }
  } catch (cause) {
    console.warn("[kid-quest] markLogsSynced failed", cause);
  }
}
