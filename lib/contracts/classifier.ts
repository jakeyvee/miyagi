import type { AgeBand } from "./age-band";
import type { Verdict } from "./verdict";

/**
 * Body sent to POST /api/classifier. Kid input is typed text only —
 * no audio or microphone payloads in v1.
 *
 * `sessionId` is optional. It is preserved across the kid surface for log
 * grouping (see `ClassifierLogRecord`) but the classifier route itself does
 * not act on it. (VOL-190's server-side semantic detector was rolled back
 * when the provider was migrated to Anthropic — see docs/brute-force.md.)
 */
export interface ClassifierRequest {
  input: string;
  topicLock: string;
  ageBand: AgeBand;
  sessionId?: string;
}

/** Response from POST /api/classifier. `confidence` is a 0..1 float. */
export interface ClassifierResponse {
  verdict: Verdict;
  confidence: number;
}
