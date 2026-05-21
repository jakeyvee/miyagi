/**
 * Client-only localStorage helpers for the parent surface.
 *
 * Storage layout (single namespaced key):
 *   kid-quest:parent:v1 -> {
 *     pin: { saltHex, hashHex } | null,
 *     settings: ParentSettings | null,
 *   }
 *
 * Plaintext PIN is never persisted; only SHA-256(salt + pin) is stored.
 */

import { isAgeBand, type ParentSettings } from "@/lib/contracts";

const STORAGE_KEY = "kid-quest:parent:v1";

export interface StoredPin {
  saltHex: string;
  hashHex: string;
}

export interface ParentLocalState {
  pin: StoredPin | null;
  settings: ParentSettings | null;
}

const EMPTY_STATE: ParentLocalState = { pin: null, settings: null };

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isStoredPin(value: unknown): value is StoredPin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.saltHex === "string" &&
    candidate.saltHex.length > 0 &&
    typeof candidate.hashHex === "string" &&
    candidate.hashHex.length > 0
  );
}

function isParentSettings(value: unknown): value is ParentSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.topicLock !== "string") return false;
  if (!isAgeBand(candidate.ageBand)) return false;
  return true;
}

export function readParentLocalState(): ParentLocalState {
  if (!hasWindow()) return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      pin: isStoredPin(parsed.pin) ? parsed.pin : null,
      settings: isParentSettings(parsed.settings) ? parsed.settings : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeParentLocalState(next: ParentLocalState): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function writeStoredPin(pin: StoredPin): void {
  const current = readParentLocalState();
  writeParentLocalState({ ...current, pin });
}

export function writeParentSettings(settings: ParentSettings): void {
  const current = readParentLocalState();
  writeParentLocalState({ ...current, settings });
}

/** Test/debug only: wipe the entire namespaced blob. Not wired to UI. */
export function clearParentLocalState(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
