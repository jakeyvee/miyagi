/**
 * Tiny in-memory pub/sub bus for kid-surface session events.
 *
 * Typed over the shared `SessionEvent` union so VOL-184 (tree visuals),
 * VOL-185 (IndexedDB logging) and VOL-186 (fixture/timeout overrides) can
 * subscribe without coupling to component internals. Client-only — never
 * imported from server code.
 */

import type { SessionEvent, SessionEventType } from "@/lib/contracts";

export type SessionEventListener = (event: SessionEvent) => void;

const listeners = new Set<SessionEventListener>();

/** Broadcast a session event. Listener errors are isolated per-listener. */
export function emit(event: SessionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A noisy subscriber must never break the kid surface or other
      // subscribers — swallow and continue.
    }
  }
}

/** Subscribe to every session event. Returns an unsubscribe function. */
export function subscribe(listener: SessionEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test/debug helper. Not wired to UI. */
export function _resetListenersForTesting(): void {
  listeners.clear();
}

export type { SessionEvent, SessionEventType };
