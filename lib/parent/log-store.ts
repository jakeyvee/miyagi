/**
 * Client-only IndexedDB wrapper for parent-facing classifier logs.
 *
 * Storage layout:
 *   Database:    kid-quest-logs (version 1)
 *   Store:       classifier_logs
 *   Key path:    id (string)
 *   Index:       by_timestamp on timestampMs (used to page newest-first)
 *
 * The server NEVER receives these rows in v1. Retention is manual — the
 * parent's "Clear local logs" button is the only eviction path. Future
 * opt-in sync (VOL-195) will read from this same store.
 */

import { isVerdict, type ClassifierLogRecord } from "@/lib/contracts";

const DB_NAME = "kid-quest-logs";
const DB_VERSION = 1;
const STORE_NAME = "classifier_logs";
const TIMESTAMP_INDEX = "by_timestamp";

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
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex(TIMESTAMP_INDEX, "timestampMs", { unique: false });
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

/**
 * Best-effort append. Never throws to the caller — failures are logged so
 * the kid flow stays uninterrupted when storage is full, denied, or absent.
 */
export async function appendLog(record: ClassifierLogRecord): Promise<void> {
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
          out.push(value);
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
