/**
 * Pure tree state machine for the kid surface.
 *
 * No React, no DOM, no I/O — just `initialTreeState()` and `reduceTree()`.
 * Owned by VOL-184. Consumed by `lib/kid/tree/hook.ts` (subscribes to the
 * session event bus and translates raw `SessionEvent`s into the local
 * `TreeReducerEvent` flavour this reducer understands).
 *
 * Phase 1 semantics (will be refined by VOL-190):
 *  - Five thriving stages map 1:1 to the `TreeState` union from
 *    `@/lib/contracts`: 0=seed, 1=sprout, 2=sapling, 3=tree, 4=blooming.
 *  - `assistive_completed` (synthesized from the assistive answer stream
 *    finishing) advances the thriving stage by one, capped at 4. The tree
 *    can only grow while it is alive AND not wilted; once wilted, the kid
 *    must start a fresh session to recover (handled by the host surface, not
 *    here — the reducer just refuses to advance).
 *  - Repeated brute-force critical submissions wilt and then kill the tree:
 *      * 2 consecutive brute-force critical attempts → `isWilted = true`
 *      * 3 consecutive brute-force critical attempts → `isDead = true`
 *    "Brute-force" = the kid re-submitted a critical request without
 *    engaging the Socratic loop in between (see hook.ts for the runtime
 *    heuristic that derives this from the existing event bus).
 *  - Any assistive submission OR any engaged Socratic kid reply resets the
 *    brute-force counter back to 0. Wilt and death are NOT cleared by reset
 *    — those are session-level outcomes.
 */

import type { TreeState } from "@/lib/contracts";

export type ThrivingStage = 0 | 1 | 2 | 3 | 4;

export interface TreeStateModel {
  /** Public-facing tree silhouette (one of the five thriving stages). */
  readonly state: TreeState;
  /** Index into the thriving ladder, 0..4 inclusive. */
  readonly thrivingStage: ThrivingStage;
  /** Count of back-to-back brute-force critical attempts in the session. */
  readonly bruteForceCount: number;
  /** Tree is dead — game-over silhouette, no further growth. */
  readonly isDead: boolean;
  /** Tree is wilted but not dead — current stage shown washed out. */
  readonly isWilted: boolean;
}

/**
 * Events the reducer accepts. Subset of `SessionEvent` plus an internal-only
 * `assistive_completed` that the hook synthesizes from the existing
 * `tree_state_changed` advisory the kid surface emits at assistive
 * stream-end. Keep this surface tiny and explicit so unit tests are easy.
 */
export type TreeReducerEvent =
  | { type: "assistive_completed" }
  | { type: "kid_submitted_assistive" }
  | { type: "kid_submitted_critical" }
  | { type: "kid_demanded_answer" }
  | { type: "kid_engaged_socratic" }
  | { type: "session_ended" };

const STAGE_TO_STATE: Record<ThrivingStage, TreeState> = {
  0: "seed",
  1: "sprout",
  2: "sapling",
  3: "tree",
  4: "blooming",
};

const MAX_STAGE: ThrivingStage = 4;

/** Wilt threshold — set at two consecutive brute-force critical attempts. */
export const WILT_THRESHOLD = 2;
/** Death threshold — three consecutive brute-force critical attempts. */
export const DEAD_THRESHOLD = 3;

/**
 * Demo starts with a real-looking tree so the wilt/grow contrast lands on
 * stage instead of starting from a barely-visible seed. The kid can still
 * grow one stage to "blooming" via assistive completions.
 */
const INITIAL_STAGE: ThrivingStage = 3;

export function initialTreeState(): TreeStateModel {
  return {
    state: STAGE_TO_STATE[INITIAL_STAGE],
    thrivingStage: INITIAL_STAGE,
    bruteForceCount: 0,
    isDead: false,
    isWilted: false,
  };
}

/**
 * Deterministic reducer. Always returns a new object (never mutates input).
 * Unknown event shapes are no-ops so callers can pass through a wider union
 * without an exhaustive switch.
 */
export function reduceTree(
  prev: TreeStateModel,
  event: TreeReducerEvent,
): TreeStateModel {
  // Dead is absorbing — nothing further can change the tree.
  if (prev.isDead) {
    return prev;
  }

  switch (event.type) {
    case "assistive_completed": {
      // The tree only grows when it is alive and not wilted. While wilted,
      // the kid must reset the session to recover — growth is gated here.
      if (prev.isWilted) {
        // Still reset brute-force counter on a successful assist so the
        // wilted tree doesn't immediately die from a stale streak.
        return prev.bruteForceCount === 0
          ? prev
          : { ...prev, bruteForceCount: 0 };
      }
      const nextStage = capStage(prev.thrivingStage + 1);
      return {
        ...prev,
        state: STAGE_TO_STATE[nextStage],
        thrivingStage: nextStage,
        bruteForceCount: 0,
      };
    }

    case "kid_submitted_assistive": {
      // An assistive submission clears the brute-force streak even before
      // the answer finishes streaming — the kid has visibly changed tack.
      if (prev.bruteForceCount === 0) return prev;
      return { ...prev, bruteForceCount: 0 };
    }

    case "kid_submitted_critical": {
      const nextCount = prev.bruteForceCount + 1;
      const nextWilted = prev.isWilted || nextCount >= WILT_THRESHOLD;
      const nextDead = nextCount >= DEAD_THRESHOLD;
      if (
        nextCount === prev.bruteForceCount &&
        nextWilted === prev.isWilted &&
        nextDead === prev.isDead
      ) {
        return prev;
      }
      return {
        ...prev,
        bruteForceCount: nextCount,
        isWilted: nextWilted,
        isDead: nextDead,
      };
    }

    case "kid_demanded_answer": {
      // "Give me answer now" press — shrinks the tree by one stage AND counts
      // as a brute-force attempt against the same thresholds. The visible
      // shrink is the immediate punishment; wilt/death cascade on repeat.
      const nextStage = capStage(prev.thrivingStage - 1);
      const nextCount = prev.bruteForceCount + 1;
      const nextWilted = prev.isWilted || nextCount >= WILT_THRESHOLD;
      const nextDead = nextCount >= DEAD_THRESHOLD;
      return {
        ...prev,
        state: STAGE_TO_STATE[nextStage],
        thrivingStage: nextStage,
        bruteForceCount: nextCount,
        isWilted: nextWilted,
        isDead: nextDead,
      };
    }

    case "kid_engaged_socratic": {
      // The kid re-engaged the Socratic loop with a follow-up turn — the
      // prior critical submission counts as engagement, not brute force.
      if (prev.bruteForceCount === 0) return prev;
      return { ...prev, bruteForceCount: 0 };
    }

    case "session_ended": {
      // No state change here. Resetting (clearing wilt/death, rewinding
      // thriving stage) is the host's decision when a fresh session opens.
      return prev;
    }

    default: {
      // Exhaustiveness check at compile time without throwing at runtime,
      // so a future event added to the union won't crash live sessions.
      const _exhaustive: never = event;
      void _exhaustive;
      return prev;
    }
  }
}

function capStage(value: number): ThrivingStage {
  if (value <= 0) return 0;
  if (value >= MAX_STAGE) return MAX_STAGE;
  return value as ThrivingStage;
}

export { STAGE_TO_STATE };
