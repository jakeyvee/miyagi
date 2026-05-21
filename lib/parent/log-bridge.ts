/**
 * Bridges the kid-surface session event bus into the parent's IndexedDB log
 * store. Subscribes to `kid_input_submitted` + `classifier_verdict` and
 * pairs them per-session into a `ClassifierLogRecord`.
 *
 * Idempotent — calling `startLogBridge()` multiple times reuses the single
 * registered subscription so we never double-write a row. Failure to write
 * NEVER throws back into the kid flow (see `appendLog`).
 */

import type { ClassifierLogRecord, SessionEvent } from "@/lib/contracts";
import { subscribe } from "@/lib/kid/session-events";
import { appendLog } from "./log-store";

interface BufferedInput {
  input: string;
  timestampMs: number;
}

let activeUnsubscribe: (() => void) | null = null;
let activeRefCount = 0;

// Module-scoped buffer: at most one pending kid input per session. Verdicts
// arrive shortly after a submission, so we keep only the most recent input
// for a sessionId and drop it once a verdict is paired with it.
const pendingInputs = new Map<string, BufferedInput>();

function makeId(sessionId: string, timestampMs: number): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fall through to the deterministic id.
    }
  }
  return `${sessionId}:${timestampMs}`;
}

function handleEvent(event: SessionEvent): void {
  if (event.type === "kid_input_submitted") {
    pendingInputs.set(event.sessionId, {
      input: event.input,
      timestampMs: event.timestampMs,
    });
    return;
  }

  if (event.type === "classifier_verdict") {
    const pending = pendingInputs.get(event.sessionId);
    pendingInputs.delete(event.sessionId);

    const record: ClassifierLogRecord = {
      id: makeId(event.sessionId, event.timestampMs),
      sessionId: event.sessionId,
      timestampMs: event.timestampMs,
      input: pending?.input ?? "",
      verdict: event.verdict,
      confidence: event.confidence,
    };

    // appendLog is best-effort and swallows its own errors. We still wrap
    // in case the synchronous prelude throws — the kid flow must not break.
    try {
      void appendLog(record);
    } catch (cause) {
      console.warn("[kid-quest] log bridge dispatch failed", cause);
    }
    return;
  }

  if (event.type === "session_ended") {
    pendingInputs.delete(event.sessionId);
  }
}

/**
 * Mount the bridge. Returns an unsubscribe function. Safe to call multiple
 * times — extra calls bump a ref count instead of registering duplicate
 * listeners. The bus listener is only torn down when every caller has
 * released its subscription.
 */
export function startLogBridge(): () => void {
  if (activeUnsubscribe === null) {
    activeUnsubscribe = subscribe(handleEvent);
  }
  activeRefCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRefCount = Math.max(0, activeRefCount - 1);
    if (activeRefCount === 0 && activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
      pendingInputs.clear();
    }
  };
}

/** Test/debug helper. Not wired to UI. */
export function _resetLogBridgeForTesting(): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
  }
  activeUnsubscribe = null;
  activeRefCount = 0;
  pendingInputs.clear();
}
