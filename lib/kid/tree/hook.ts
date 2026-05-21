"use client";

/**
 * React hook that wires the kid surface's session event bus into the pure
 * tree reducer (`./state.ts`). Owns one runtime piece of business: turning
 * the raw `SessionEvent` stream into a `TreeReducerEvent` stream.
 *
 * Heuristics (Phase 1, refined by VOL-190):
 *  - `tree_state_changed` (the kid surface emits this at the end of every
 *    assistive answer stream as an advisory) is treated as the canonical
 *    "assistive stream finished" signal. The advisory `state` value is
 *    ignored — this hook owns the computed state via the reducer.
 *  - A brute-force critical attempt is detected as: two consecutive
 *    `classifier_verdict` events with `verdict === "critical"` where between
 *    them there was a `kid_input_submitted` but NO `tree_state_changed` and
 *    NO `session_ended`. When detected, dispatch one `kid_submitted_critical`
 *    to the reducer (the reducer counts and applies wilt/death thresholds).
 *  - The first critical submission is treated as engagement (the kid is
 *    entering the Socratic loop) and does NOT increment brute-force.
 *
 * This is the single place to swap the assistive-completion signal source
 * when VOL-186 refines it.
 */

import { useEffect, useReducer, useRef } from "react";
import type { SessionEvent, TreeState } from "@/lib/contracts";
import { subscribe } from "@/lib/kid/session-events";
import {
  initialTreeState,
  reduceTree,
  type TreeReducerEvent,
  type TreeStateModel,
} from "./state";

export interface UseTreeStateResult {
  state: TreeState;
  isWilted: boolean;
  isDead: boolean;
}

function reducer(
  prev: TreeStateModel,
  event: TreeReducerEvent,
): TreeStateModel {
  return reduceTree(prev, event);
}

export function useTreeState(): UseTreeStateResult {
  const [model, dispatch] = useReducer(reducer, undefined, initialTreeState);

  // Inter-event context tracked across the event stream. Kept in a ref so
  // updates inside the subscriber don't trigger re-subscribes; the hook
  // subscribes exactly once on mount.
  const ctxRef = useRef<{
    /** Did we just see a `classifier_verdict` with verdict === "critical"? */
    pendingCritical: boolean;
    /** Was there a `kid_input_submitted` since the last critical verdict? */
    submittedSincePending: boolean;
    /** Was the streak interrupted by assistive completion / session end? */
    engagedSincePending: boolean;
  }>({
    pendingCritical: false,
    submittedSincePending: false,
    engagedSincePending: false,
  });

  useEffect(() => {
    const unsub = subscribe((event: SessionEvent) => {
      const ctx = ctxRef.current;

      switch (event.type) {
        case "kid_input_submitted": {
          if (ctx.pendingCritical) {
            ctx.submittedSincePending = true;
          }
          return;
        }

        case "classifier_verdict": {
          if (event.verdict === "critical") {
            // Detect brute-force: two consecutive critical verdicts with a
            // kid submission between them and no engagement signal.
            if (
              ctx.pendingCritical &&
              ctx.submittedSincePending &&
              !ctx.engagedSincePending
            ) {
              dispatch({ type: "kid_submitted_critical" });
            }
            // Either way, the latest verdict is critical — start (or extend)
            // a critical streak. Don't clear the prior streak on first hit;
            // dispatch order above already handled it.
            ctx.pendingCritical = true;
            ctx.submittedSincePending = false;
            ctx.engagedSincePending = false;
          } else {
            // assistive / off_topic / unsafe — non-critical input resets
            // the brute-force counter on the reducer side too.
            if (event.verdict === "assistive") {
              dispatch({ type: "kid_submitted_assistive" });
            } else {
              // off_topic / unsafe: also clears the streak. Use the same
              // event as assistive — the reducer treats it as a reset.
              dispatch({ type: "kid_submitted_assistive" });
            }
            ctx.pendingCritical = false;
            ctx.submittedSincePending = false;
            ctx.engagedSincePending = false;
          }
          return;
        }

        case "tree_state_changed": {
          // The advisory `state` payload from the kid surface is ignored —
          // the reducer owns the canonical state. Treat as the "assistive
          // stream completed successfully" trigger. This is the seam VOL-186
          // will replace with a dedicated event.
          dispatch({ type: "assistive_completed" });
          ctx.pendingCritical = false;
          ctx.submittedSincePending = false;
          ctx.engagedSincePending = true;
          return;
        }

        case "session_ended": {
          dispatch({ type: "session_ended" });
          ctx.pendingCritical = false;
          ctx.submittedSincePending = false;
          ctx.engagedSincePending = true;
          return;
        }

        case "kid_demanded_answer": {
          // The "Give me answer now" bypass — shrink the tree and count it
          // as a brute-force attempt. Clear the streak tracking; the next
          // critical verdict will start a fresh detection window.
          dispatch({ type: "kid_demanded_answer" });
          ctx.pendingCritical = false;
          ctx.submittedSincePending = false;
          ctx.engagedSincePending = true;
          return;
        }

        // session_started or future-added event types: harmless no-op.
        default:
          return;
      }
    });
    return unsub;
  }, []);

  return {
    state: model.state,
    isWilted: model.isWilted,
    isDead: model.isDead,
  };
}
