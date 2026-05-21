/**
 * Study-window time math.
 *
 * v1 simplification: we only support same-day windows. If `startHHMM` is
 * lexicographically greater than `endHHMM` we treat the window as invalid
 * (always closed) rather than wrapping past midnight. Overnight windows
 * land in a later ticket.
 */

import type { StudyTimeWindow } from "@/lib/contracts";

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface ParsedHHMM {
  hours: number;
  minutes: number;
}

function parseHHMM(value: string): ParsedHHMM | null {
  if (!HHMM_RE.test(value)) return null;
  const parts = value.split(":");
  const hoursStr = parts[0];
  const minutesStr = parts[1];
  if (hoursStr === undefined || minutesStr === undefined) return null;
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function totalMinutes({ hours, minutes }: ParsedHHMM): number {
  return hours * 60 + minutes;
}

/**
 * Returns true if `now` falls within `[start, end)` using the device's
 * local wall-clock time. Half-open at the end so a 16:00-18:00 window
 * closes the second the clock ticks over to 18:00.
 *
 * Returns false if either endpoint is malformed, or if `start >= end`
 * (no overnight wrap in v1).
 */
export function isInsideWindow(now: Date, w: StudyTimeWindow): boolean {
  const start = parseHHMM(w.startHHMM);
  const end = parseHHMM(w.endHHMM);
  if (!start || !end) return false;

  const startMins = totalMinutes(start);
  const endMins = totalMinutes(end);
  if (startMins >= endMins) return false;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= startMins && nowMins < endMins;
}
