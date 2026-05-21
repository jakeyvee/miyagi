import type { AgeBand } from "./age-band";

/**
 * Single source of truth for parent-controlled settings.
 * v1 holds one active topic lock and one age band.
 * Stored local-first on the parent device; opt-in cloud sync (VOL-195).
 */
export interface ParentSettings {
  topicLock: string;
  ageBand: AgeBand;
}
