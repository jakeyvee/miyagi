/**
 * Client-only opt-in store for cloud sync (VOL-195).
 *
 * Storage layout (single namespaced key, distinct from the parent state
 * blob so the existing `local-store.ts` reader does not need to change):
 *   kid-quest:parent:sync:v1 -> SyncOptIn
 *
 * Default state: both features OFF, 30-day retention. The cloud-sync
 * engine only acts when the parent has explicitly toggled a feature on.
 */

import type { SyncOptIn } from "@/lib/contracts/sync";
import { useEffect, useState } from "react";

const SYNC_PREFS_KEY = "kid-quest:parent:sync:v1";

export const DEFAULT_SYNC_OPT_IN: SyncOptIn = Object.freeze({
  settings: false,
  logs: false,
  retentionDays: 30,
});

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function clampRetention(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SYNC_OPT_IN.retentionDays;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (rounded > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return rounded;
}

function normalizeSyncOptIn(input: unknown): SyncOptIn {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SYNC_OPT_IN };
  }
  const c = input as Record<string, unknown>;
  return {
    settings: c.settings === true,
    logs: c.logs === true,
    retentionDays: clampRetention(c.retentionDays),
  };
}

export function readSyncOptIn(): SyncOptIn {
  if (!hasWindow()) return { ...DEFAULT_SYNC_OPT_IN };
  try {
    const raw = window.localStorage.getItem(SYNC_PREFS_KEY);
    if (!raw) return { ...DEFAULT_SYNC_OPT_IN };
    return normalizeSyncOptIn(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SYNC_OPT_IN };
  }
}

export function writeSyncOptIn(opts: SyncOptIn): void {
  if (!hasWindow()) return;
  const normalized = normalizeSyncOptIn(opts);
  try {
    window.localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage may be disabled (private mode quota, etc.) — ignore.
  }
}

/**
 * Test/debug only: wipe sync opt-in back to defaults. Not wired to UI.
 */
export function clearSyncOptIn(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(SYNC_PREFS_KEY);
  } catch {
    // ignore
  }
}

/**
 * React hook with cross-tab `storage` event support. Renders the live
 * opt-in value and returns a setter. Setter writes through to localStorage
 * and dispatches a synthetic event so other components in the same tab
 * also rerender.
 */
const SYNC_PREFS_EVENT = "kid-quest:sync-prefs-updated";

export function useSyncOptIn(): readonly [SyncOptIn, (next: SyncOptIn) => void] {
  const [state, setState] = useState<SyncOptIn>(() => ({
    ...DEFAULT_SYNC_OPT_IN,
  }));

  useEffect(() => {
    setState(readSyncOptIn());
    function onStorage(event: StorageEvent) {
      if (event.key !== SYNC_PREFS_KEY) return;
      setState(readSyncOptIn());
    }
    function onLocal() {
      setState(readSyncOptIn());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_PREFS_EVENT, onLocal as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_PREFS_EVENT, onLocal as EventListener);
    };
  }, []);

  function update(next: SyncOptIn): void {
    writeSyncOptIn(next);
    setState(normalizeSyncOptIn(next));
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new Event(SYNC_PREFS_EVENT));
      } catch {
        // ignore
      }
    }
  }

  return [state, update] as const;
}

export const SYNC_PREFS_STORAGE_KEY = SYNC_PREFS_KEY;
export const SYNC_RETENTION_BOUNDS = Object.freeze({
  min: MIN_RETENTION_DAYS,
  max: MAX_RETENTION_DAYS,
});
