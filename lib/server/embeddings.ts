import "server-only";

import { createHash } from "node:crypto";

import { getOpenAI } from "./openai";

/**
 * Server-only embedding helpers used by the Phase 2 brute-force detector
 * (`lib/server/brute-force.ts`). The OpenAI SDK is only ever reached via
 * `getOpenAI()` so API keys cannot leak into the client bundle.
 *
 * Cache strategy: in-process Map keyed by SHA-256 of the raw input string.
 * The same kid input embedded twice within a single Node process (e.g. the
 * kid re-submits an identical question in the same session) reuses the cached
 * vector and saves a paid round-trip. The cache is intentionally bounded by
 * process lifetime — there is no eviction policy because the brute-force
 * window itself drops stale entries every 30 minutes, so the working set
 * stays small.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";

const cache = new Map<string, number[]>();

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function embed(text: string): Promise<number[]> {
  const key = hash(text);
  const cached = cache.get(key);
  if (cached) return cached;

  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vector = response.data[0]?.embedding;
  if (!vector || vector.length === 0) {
    throw new Error("embedding_failed: empty vector from provider");
  }
  cache.set(key, vector);
  return vector;
}

/**
 * Cosine similarity between two equal-length numeric vectors. Returns 0 if
 * either input is empty or has mismatched length — callers treat 0 as
 * "definitely not similar", which is safe in the brute-force path.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Test-only: clear the in-process embedding cache. */
export function __clearEmbeddingCacheForTests(): void {
  cache.clear();
}
