/**
 * Client-only cloud-sync engine (VOL-195).
 *
 * Opt-in only. `runSync()` is a no-op unless the parent has flipped at
 * least one feature toggle in `sync-prefs.ts`. Even with sync on, only
 * the toggled features run, and only consented log records are uploaded.
 *
 * Failure NEVER breaks the kid or parent flow — every code path either
 * returns silently or surfaces the error through `SyncStatus`.
 */

import { useEffect, useState } from "react";
import type {
  ClassifierLogRecord,
  ClassifierLogRecordWithConsent,
  ParentSettings,
  SyncOptIn,
  SyncStatus,
} from "@/lib/contracts";
import { readParentLocalState } from "./local-store";
import {
  listUnsyncedConsentedLogs,
  markLogsSynced,
} from "./log-store";
import { readSyncOptIn } from "./sync-prefs";

const STATUS_KEY = "kid-quest:parent:sync-status:v1";
const SYNC_STATUS_EVENT = "kid-quest:sync-status-updated";
const BATCH_SIZE = 200;

const EMPTY_STATUS: SyncStatus = Object.freeze({
  lastSyncMs: null,
  lastErrorMessage: null,
  pendingUploads: 0,
  featureFlags: { settings: false, logs: false, retentionDays: 30 },
});

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readStatus(): SyncStatus {
  if (!hasWindow()) return { ...EMPTY_STATUS };
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    if (!raw) return { ...EMPTY_STATUS, featureFlags: readSyncOptIn() };
    const parsed = JSON.parse(raw) as Partial<SyncStatus>;
    return {
      lastSyncMs:
        typeof parsed.lastSyncMs === "number" && Number.isFinite(parsed.lastSyncMs)
          ? parsed.lastSyncMs
          : null,
      lastErrorMessage:
        typeof parsed.lastErrorMessage === "string" ? parsed.lastErrorMessage : null,
      pendingUploads:
        typeof parsed.pendingUploads === "number" && Number.isFinite(parsed.pendingUploads)
          ? parsed.pendingUploads
          : 0,
      featureFlags: readSyncOptIn(),
    };
  } catch {
    return { ...EMPTY_STATUS, featureFlags: readSyncOptIn() };
  }
}

function writeStatus(next: SyncStatus): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STATUS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SYNC_STATUS_EVENT));
  } catch {
    // ignore
  }
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "network error";
    return { ok: false, status: 0, error: message };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const errVal =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `http_${res.status}`;
    return { ok: false, status: res.status, error: errVal };
  }
  return { ok: true, data: json as T };
}

async function deriveParentIdFromServer(): Promise<string | null> {
  const state = readParentLocalState();
  if (!state.pin) return null;
  const result = await fetchJson<{ parentId: string }>(
    "/api/sync/identity",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pinHashHex: state.pin.hashHex,
        saltHex: state.pin.saltHex,
      }),
    },
  );
  if (!result.ok) return null;
  return typeof result.data.parentId === "string" ? result.data.parentId : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return items.length === 0 ? [] : [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function stripConsent(record: ClassifierLogRecordWithConsent): ClassifierLogRecord {
  const { id, sessionId, timestampMs, input, verdict, confidence } = record;
  return { id, sessionId, timestampMs, input, verdict, confidence };
}

export interface RunSyncResult {
  ok: boolean;
  uploadedLogIds: string[];
  settingsSynced: boolean;
  error?: string;
}

/**
 * Idempotent: safe to call repeatedly. Walks the opt-in toggles, calls
 * the appropriate endpoints, and updates `SyncStatus`. Never throws.
 */
export async function runSync(): Promise<RunSyncResult> {
  const opts = readSyncOptIn();
  const baseStatus = readStatus();
  const featureFlags = { ...opts };

  if (!opts.settings && !opts.logs) {
    const status: SyncStatus = {
      ...baseStatus,
      featureFlags,
      pendingUploads: 0,
    };
    writeStatus(status);
    return { ok: true, uploadedLogIds: [], settingsSynced: false };
  }

  const parentId = await deriveParentIdFromServer();
  if (!parentId) {
    const message = "Could not derive parent id — is the parent PIN set up?";
    writeStatus({
      ...baseStatus,
      featureFlags,
      lastErrorMessage: message,
    });
    return { ok: false, uploadedLogIds: [], settingsSynced: false, error: message };
  }

  let settingsSynced = false;
  let lastError: string | null = null;

  if (opts.settings) {
    const local = readParentLocalState();
    if (local.settings) {
      const res = await fetchJson<{ ok: true }>("/api/sync/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parentId,
          settings: local.settings,
          retentionDays: opts.retentionDays,
        }),
      });
      if (res.ok) {
        settingsSynced = true;
      } else {
        lastError = `settings: ${res.error}`;
      }
    }
  }

  const uploadedIds: string[] = [];
  let pendingAfter = 0;

  if (opts.logs) {
    let consented: ClassifierLogRecordWithConsent[] = [];
    try {
      consented = await listUnsyncedConsentedLogs({ limit: 1000 });
    } catch (cause) {
      const m = cause instanceof Error ? cause.message : "log scan failed";
      lastError = lastError ?? `logs: ${m}`;
    }
    pendingAfter = consented.length;
    if (consented.length > 0) {
      const batches = chunk(consented, BATCH_SIZE);
      for (const batch of batches) {
        const payload = batch.map(stripConsent);
        const res = await fetchJson<{ acceptedIds: string[] }>("/api/sync/logs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parentId,
            records: payload,
            retentionDays: opts.retentionDays,
          }),
        });
        if (!res.ok) {
          lastError = lastError ?? `logs: ${res.error}`;
          break;
        }
        const accepted = Array.isArray(res.data.acceptedIds)
          ? res.data.acceptedIds.filter((x): x is string => typeof x === "string")
          : [];
        uploadedIds.push(...accepted);
        if (accepted.length > 0) {
          await markLogsSynced(accepted, Date.now());
        }
        pendingAfter = Math.max(0, pendingAfter - accepted.length);
      }
    }
  }

  const now = Date.now();
  const status: SyncStatus = {
    lastSyncMs: lastError ? baseStatus.lastSyncMs : now,
    lastErrorMessage: lastError,
    pendingUploads: pendingAfter,
    featureFlags,
  };
  writeStatus(status);

  if (lastError) {
    console.warn("[kid-quest] runSync completed with errors:", lastError);
    return {
      ok: false,
      uploadedLogIds: uploadedIds,
      settingsSynced,
      error: lastError,
    };
  }
  return { ok: true, uploadedLogIds: uploadedIds, settingsSynced };
}

/**
 * React hook with cross-tab + same-tab change detection. Returns the
 * live `SyncStatus`. Listens for `storage` events (cross-tab) and a
 * custom event dispatched by `writeStatus` (same-tab).
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => ({ ...EMPTY_STATUS }));
  useEffect(() => {
    setStatus(readStatus());
    function onStorage(event: StorageEvent) {
      if (event.key !== STATUS_KEY && event.key !== "kid-quest:parent:sync:v1") {
        return;
      }
      setStatus(readStatus());
    }
    function onLocal() {
      setStatus(readStatus());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_STATUS_EVENT, onLocal as EventListener);
    window.addEventListener("kid-quest:sync-prefs-updated", onLocal as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_STATUS_EVENT, onLocal as EventListener);
      window.removeEventListener("kid-quest:sync-prefs-updated", onLocal as EventListener);
    };
  }, []);
  return status;
}

export interface ExportPayload {
  settings: ParentSettings | null;
  logs: ClassifierLogRecord[];
}

/**
 * Calls the export endpoint and returns the JSON payload. Returns null
 * when sync is not configured or the parent has no PIN yet. Never throws.
 */
export async function triggerExport(): Promise<ExportPayload | null> {
  const parentId = await deriveParentIdFromServer();
  if (!parentId) return null;
  const url = `/api/sync/export?parentId=${encodeURIComponent(parentId)}`;
  const res = await fetchJson<ExportPayload>(url);
  if (!res.ok) {
    const base = readStatus();
    writeStatus({ ...base, lastErrorMessage: `export: ${res.error}` });
    return null;
  }
  return {
    settings: res.data.settings ?? null,
    logs: Array.isArray(res.data.logs) ? res.data.logs : [],
  };
}

/**
 * Initiates a server-side deletion of cloud copies (settings + all logs).
 * Local data is not touched. Returns true on success.
 */
export async function triggerDeleteServerSide(): Promise<boolean> {
  const parentId = await deriveParentIdFromServer();
  if (!parentId) return false;
  let ok = true;
  const base = readStatus();
  const settingsRes = await fetchJson<{ ok: true }>(
    `/api/sync/settings?parentId=${encodeURIComponent(parentId)}`,
    { method: "DELETE" },
  );
  if (!settingsRes.ok) ok = false;
  const logsRes = await fetchJson<{ ok: true; deletedCount: number }>(
    `/api/sync/logs?parentId=${encodeURIComponent(parentId)}&all=true`,
    { method: "DELETE" },
  );
  if (!logsRes.ok) ok = false;
  writeStatus({
    ...base,
    lastErrorMessage: ok
      ? null
      : `delete: ${!settingsRes.ok ? settingsRes.error : ""} ${!logsRes.ok ? logsRes.error : ""}`.trim(),
    pendingUploads: ok ? 0 : base.pendingUploads,
  });
  return ok;
}

export const SYNC_STATUS_STORAGE_KEY = STATUS_KEY;
