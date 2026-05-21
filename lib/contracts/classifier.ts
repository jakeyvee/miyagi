import type { AgeBand } from "./age-band";
import type { Verdict } from "./verdict";

/**
 * Body sent to POST /api/classifier. Kid input is typed text only —
 * no audio or microphone payloads in v1.
 */
export interface ClassifierRequest {
  input: string;
  topicLock: string;
  ageBand: AgeBand;
}

/** Response from POST /api/classifier. `confidence` is a 0..1 float. */
export interface ClassifierResponse {
  verdict: Verdict;
  confidence: number;
}
