"use client";

/**
 * Demo / fixture-mode plumbing for the kid surface.
 *
 * Demo mode is enabled when either of the following is true:
 *   1. The build was started with `NEXT_PUBLIC_KID_QUEST_DEMO_MODE=1` (or
 *      `"true"`). This is the stage default — set on the demo machine.
 *   2. localStorage has key `kid-quest:demo-mode` set to a truthy boolean.
 *      This is the parent-side override surfaced through a small button on
 *      the Parent dashboard's Settings tab.
 *
 * When demo mode is on, the kid surface bypasses the live OpenAI routes
 * entirely and replays canned fixtures from `lib/fixtures.ts`. Outside
 * demo mode, everything in this module is inert — SSR-safe, no localStorage
 * touched, behavior unchanged.
 *
 * Cursor advancement (`advanceFixtureCursor`) is kept in-memory because the
 * demo always wants to start at fixture #0 on a page reload — there is no
 * persisted "where the operator left off" state.
 */

import { useEffect, useState } from "react";
import {
  FIXTURES,
  getNextFixture,
  type DemoFixture,
} from "@/lib/fixtures";

const LS_KEY = "kid-quest:demo-mode";
const ENV_KEY = "NEXT_PUBLIC_KID_QUEST_DEMO_MODE";

/** True iff `value` looks like a "yes / on / 1 / true" string. */
function isTruthyFlag(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function readEnvFlag(): boolean {
  // Next.js inlines NEXT_PUBLIC_* at build time. Access via process.env so
  // the constant is statically replaced and the bundler keeps the check.
  // Reference both raw forms so tooling can verify either is honored.
  const raw =
    typeof process !== "undefined" && process.env
      ? (process.env[ENV_KEY] as string | undefined)
      : undefined;
  return isTruthyFlag(raw);
}

function readLocalStorageFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isTruthyFlag(window.localStorage.getItem(LS_KEY));
  } catch {
    // localStorage may throw in private mode / quota etc. — treat as off.
    return false;
  }
}

/**
 * Client-only. Safe to call from useEffect / event handlers; returns false
 * during SSR. Either the env flag OR the localStorage override flips this on.
 */
export function isDemoModeEnabled(): boolean {
  return readEnvFlag() || readLocalStorageFlag();
}

/**
 * Write the localStorage override and broadcast a `storage` event so any
 * `useDemoMode` hook on the page (e.g. KidStudy) refreshes immediately.
 * Native browser `storage` events fire for *other* tabs only, so we
 * synthesise one for the current tab.
 */
export function setDemoMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(LS_KEY, "1");
    } else {
      window.localStorage.removeItem(LS_KEY);
    }
  } catch {
    // Can't persist — still notify in-tab listeners with a synthetic event
    // so the UI at least reflects the intent until reload.
  }
  try {
    const ev = new StorageEvent("storage", {
      key: LS_KEY,
      newValue: enabled ? "1" : null,
      storageArea:
        typeof window.localStorage !== "undefined"
          ? window.localStorage
          : undefined,
    });
    window.dispatchEvent(ev);
  } catch {
    // Some older browsers / test envs disallow constructing StorageEvent.
    // Fall back to a CustomEvent listeners can watch for.
    try {
      window.dispatchEvent(new CustomEvent("kid-quest:demo-mode-change"));
    } catch {
      /* nothing more we can do */
    }
  }
}

/**
 * React hook that returns the current demo-mode flag and re-renders the
 * caller when it flips via `setDemoMode` or via a cross-tab `storage` event.
 * SSR-safe: returns `false` until the first effect runs on the client.
 */
export function useDemoMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    const recompute = () => setEnabled(isDemoModeEnabled());
    recompute();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === LS_KEY) recompute();
    };
    const onCustom = () => recompute();
    window.addEventListener("storage", onStorage);
    window.addEventListener("kid-quest:demo-mode-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kid-quest:demo-mode-change", onCustom);
    };
  }, []);

  return enabled;
}

// ---------------------------------------------------------------------------
// Fixture cursor (in-memory)
// ---------------------------------------------------------------------------

let cursor: number | null = null;

/**
 * Advance the in-memory fixture cursor by one and return the next fixture
 * in stable demo order. Wraps at the end of `FIXTURES`. The first call
 * (when cursor is null) returns `FIXTURES[0]`.
 */
export function advanceFixtureCursor(): DemoFixture {
  const next = getNextFixture(cursor);
  cursor = cursor === null ? 0 : (cursor + 1) % FIXTURES.length;
  return next;
}

/** Debug helper. Returns -1 before the first call. */
export function peekFixtureCursor(): number {
  return cursor === null ? -1 : cursor;
}

/** Test helper — reset the cursor between tests / demo runs. */
export function _resetFixtureCursorForTesting(): void {
  cursor = null;
}
