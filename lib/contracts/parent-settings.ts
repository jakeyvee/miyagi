import type { AgeBand } from "./age-band";

/** Wall-clock time of day, "HH:MM" 24-hour. v1 has one daily window. */
export interface StudyTimeWindow {
  startHHMM: string;
  endHHMM: string;
}

/**
 * Single source of truth for parent-controlled settings.
 * v1 holds one active topic lock, one age band, one daily window.
 * Stored local-first on the parent device; no cloud sync yet.
 */
export interface ParentSettings {
  topicLock: string;
  ageBand: AgeBand;
  studyTimeWindow: StudyTimeWindow;
}
