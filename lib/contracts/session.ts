import type { Verdict } from "./verdict";

/** Coarse state of the kid's on-screen tree. Refined by later tickets. */
export type TreeState = "seed" | "sprout" | "sapling" | "tree" | "blooming";

interface BaseSessionEvent {
  sessionId: string;
  timestampMs: number;
}

export type SessionEvent =
  | (BaseSessionEvent & {
      type: "session_started";
      topicLock: string;
    })
  | (BaseSessionEvent & {
      type: "kid_input_submitted";
      input: string;
    })
  | (BaseSessionEvent & {
      type: "classifier_verdict";
      verdict: Verdict;
      confidence: number;
    })
  | (BaseSessionEvent & {
      type: "tree_state_changed";
      state: TreeState;
    })
  | (BaseSessionEvent & {
      type: "session_ended";
      reason: "time_window_closed" | "kid_exited" | "parent_exited";
    });

export type SessionEventType = SessionEvent["type"];
