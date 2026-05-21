import "server-only";

import { cosine, embed } from "./embeddings";

/**
 * Phase 2 brute-force detector. Server-side semantic equivalent of the
 * client-side heuristic in `lib/kid/tree/hook.ts`.
 *
 * Concept: a kid who repeatedly asks the *same* critical question (e.g.
 * paraphrasing the same math problem three times in a row hoping for a
 * direct answer) is brute-forcing. We score that by embedding each critical
 * input and comparing it against earlier critical inputs from the same
 * session via cosine similarity. Identical questions also count even when
 * the embedding round-trip would catch them, via an exact (case-insensitive)
 * fallback that is free and synchronous.
 *
 * The classifier route calls `evaluateCriticalReask()` ONLY when the verdict
 * is `critical`. The function never throws on provider failure — it returns
 * `isReask: false` with a similarity of 0 — because the brute-force signal
 * is advisory and must never break the classifier path. The tree state
 * machine in `lib/kid/tree/state.ts` remains the visual source of truth.
 *
 * Known gap: the server has no way to observe `session_ended` events from
 * the kid client today. Sessions expire passively via the 30-minute sliding
 * TTL. A future ticket can add an explicit session-end signal — until then,
 * `resetSession()` is exported for that future caller.
 */

export const SEMANTIC_REASK_THRESHOLD = 0.86;
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Match the client-side tree state machine in `lib/kid/tree/state.ts`. */
const WILT_THRESHOLD = 2;
const DEAD_THRESHOLD = 3;

export type ReaskConsequence = "none" | "wilt" | "dead";

export interface ReaskEvaluation {
  isReask: boolean;
  reasksSoFar: number;
  consequence: ReaskConsequence;
  similarityToNearest: number;
  nearestId: string | null;
}

interface CriticalQuery {
  /** Stable id within the session window — used to identify the nearest neighbour. */
  id: string;
  input: string;
  normalized: string;
  embedding: number[];
  tMs: number;
  /** True if this query was counted as a re-ask when it was recorded. */
  counted: boolean;
}

interface SessionWindow {
  firstSeenMs: number;
  lastSeenMs: number;
  reaskCount: number;
  criticalQueries: CriticalQuery[];
}

const sessions = new Map<string, SessionWindow>();

function consequenceForReaskCount(count: number): ReaskConsequence {
  if (count >= DEAD_THRESHOLD) return "dead";
  if (count >= WILT_THRESHOLD) return "wilt";
  return "none";
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function sweepStale(now: number): void {
  for (const [id, window] of sessions) {
    if (now - window.lastSeenMs > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

/**
 * Test-friendly variant: caller provides an embedder. Pure logic — no
 * imports of `getOpenAI`. The production wrapper below is what the route
 * handler should use.
 */
export async function evaluateCriticalReaskWith(
  embedFn: (input: string) => Promise<number[]>,
  sessionId: string,
  input: string,
  nowMs: number = Date.now(),
): Promise<ReaskEvaluation> {
  sweepStale(nowMs);

  const normalized = normalize(input);

  let window = sessions.get(sessionId);
  if (window && nowMs - window.lastSeenMs > SESSION_TTL_MS) {
    // Sliding TTL: stale window — start fresh for this session id.
    sessions.delete(sessionId);
    window = undefined;
  }
  if (!window) {
    window = {
      firstSeenMs: nowMs,
      lastSeenMs: nowMs,
      reaskCount: 0,
      criticalQueries: [],
    };
    sessions.set(sessionId, window);
  }

  let embedding: number[];
  try {
    embedding = await embedFn(input);
  } catch {
    // Provider failed — record nothing (we can't compare without a vector)
    // and tell the caller this wasn't a re-ask. Classifier must still
    // succeed so the kid surface keeps moving.
    window.lastSeenMs = nowMs;
    return {
      isReask: false,
      reasksSoFar: window.reaskCount,
      consequence: consequenceForReaskCount(window.reaskCount),
      similarityToNearest: 0,
      nearestId: null,
    };
  }

  // Find the closest prior query in the window.
  let nearestId: string | null = null;
  let bestSim = 0;
  let exactHit = false;
  for (const prior of window.criticalQueries) {
    if (prior.normalized === normalized) {
      exactHit = true;
      bestSim = 1;
      nearestId = prior.id;
      break;
    }
    const sim = cosine(embedding, prior.embedding);
    if (sim > bestSim) {
      bestSim = sim;
      nearestId = prior.id;
    }
  }

  const isReask =
    window.criticalQueries.length > 0 &&
    (exactHit || bestSim >= SEMANTIC_REASK_THRESHOLD);

  if (isReask) {
    window.reaskCount += 1;
  }

  const id = `${sessionId}:${window.criticalQueries.length}`;
  window.criticalQueries.push({
    id,
    input,
    normalized,
    embedding,
    tMs: nowMs,
    counted: isReask,
  });
  window.lastSeenMs = nowMs;

  return {
    isReask,
    reasksSoFar: window.reaskCount,
    consequence: consequenceForReaskCount(window.reaskCount),
    similarityToNearest: bestSim,
    nearestId,
  };
}

/**
 * Production wrapper used by the classifier route. Uses the real OpenAI
 * embedder via `lib/server/embeddings.ts`.
 */
export function evaluateCriticalReask(
  sessionId: string,
  input: string,
): Promise<ReaskEvaluation> {
  return evaluateCriticalReaskWith(embed, sessionId, input);
}

/**
 * Drop a session window. Today no caller wires this up — the server cannot
 * observe `session_ended` events from the kid client. Sessions expire via
 * the 30-minute TTL instead. Kept exported so a future ticket that adds an
 * explicit end-of-session signal has a place to call.
 */
export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Test-only: nuke all in-memory sessions. */
export function __resetAllSessionsForTests(): void {
  sessions.clear();
}
