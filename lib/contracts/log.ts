import type { Verdict } from "./verdict";

/**
 * One row of the parent-facing classifier log. Persisted local-first on the
 * parent device; the server never stores these in v1.
 */
export interface ClassifierLogRecord {
  id: string;
  sessionId: string;
  timestampMs: number;
  input: string;
  verdict: Verdict;
  confidence: number;
}
