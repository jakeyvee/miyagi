import type { AgeBand } from "./age-band";
import type { Verdict } from "./verdict";

/**
 * Body sent to POST /api/classifier. Kid input is typed text only —
 * no audio or microphone payloads in v1.
 *
 * `sessionId` is optional and additive (VOL-190). When provided, the server
 * runs the Phase 2 semantic brute-force detector for `critical` verdicts and
 * attaches a `reask` field to the response. Older clients that omit it keep
 * working with no behavioural change.
 */
export interface ClassifierRequest {
  input: string;
  topicLock: string;
  ageBand: AgeBand;
  sessionId?: string;
}

/**
 * Server-derived brute-force re-ask signal (VOL-190). Advisory for now —
 * the kid client's tree state machine remains the visual source of truth.
 * Only attached to responses where `verdict === "critical"` AND the request
 * carried a `sessionId`.
 */
export interface ReaskResult {
  isReask: boolean;
  consequence: "none" | "wilt" | "dead";
  reasksSoFar: number;
}

/** Response from POST /api/classifier. `confidence` is a 0..1 float. */
export interface ClassifierResponse {
  verdict: Verdict;
  confidence: number;
  reask?: ReaskResult;
}
