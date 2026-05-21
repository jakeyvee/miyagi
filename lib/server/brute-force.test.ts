// Run via: npx tsx --test lib/server/brute-force.test.ts
//
// These tests use the injectable `evaluateCriticalReaskWith` variant so they
// never touch OpenAI. The production wrapper (`evaluateCriticalReask`) is
// trivially `evaluateCriticalReaskWith(embed, ...)` and shares all logic.
//
// `lib/server/brute-force.ts` does `import "server-only"`, which throws when
// loaded directly under node:test. We intercept the CommonJS resolver to
// redirect that specifier to a harmless built-in BEFORE the dynamic import
// loads the module under test.

import { Module, createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

interface ResolveHost {
  _resolveFilename: (
    request: string,
    parent: unknown,
    ...rest: unknown[]
  ) => string;
}
const host = Module as unknown as ResolveHost;
const originalResolve = host._resolveFilename;
host._resolveFilename = function patched(
  request: string,
  parent: unknown,
  ...rest: unknown[]
): string {
  if (request === "server-only") {
    return originalResolve.call(this, "node:util", parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};

// CJS require (post-shim) so that `import "server-only"` inside the module
// resolves to `node:util` instead of throwing.
const localRequire = createRequire(import.meta.url);
const mod = localRequire("./brute-force") as typeof import("./brute-force");
const {
  __resetAllSessionsForTests,
  evaluateCriticalReaskWith,
  SEMANTIC_REASK_THRESHOLD,
  SESSION_TTL_MS,
} = mod;

/**
 * Build a deterministic unit-length vector keyed by a seed string. Each
 * seed lights up a disjoint pair of slots so that distinct seeds are
 * close to orthogonal (cosine ≈ 0) and identical seeds collide perfectly
 * (cosine = 1). This keeps the test logic decoupled from any real
 * embedding distribution.
 */
const SEED_SLOTS = new Map<string, number>();
const VECTOR_LEN = 64;
function seedSlot(seed: string): number {
  let slot = SEED_SLOTS.get(seed);
  if (slot === undefined) {
    slot = SEED_SLOTS.size * 2;
    if (slot + 1 >= VECTOR_LEN) {
      throw new Error("ran out of seed slots in test embedder");
    }
    SEED_SLOTS.set(seed, slot);
  }
  return slot;
}
function fakeVector(seed: string): number[] {
  const out = new Array<number>(VECTOR_LEN).fill(0);
  const slot = seedSlot(seed);
  out[slot] = 1;
  out[slot + 1] = 1;
  // Normalise to unit length.
  const mag = Math.sqrt(2);
  return out.map((v) => v / mag);
}

/** Embedder factory: maps an input string to a chosen seed family. */
function makeEmbedder(
  map: Record<string, string>,
): (input: string) => Promise<number[]> {
  return async (input: string) => {
    const seed = map[input] ?? input;
    return fakeVector(seed);
  };
}

test("first critical query has no consequence", async () => {
  __resetAllSessionsForTests();
  const embed = makeEmbedder({ "what is 2+2": "math-a" });
  const result = await evaluateCriticalReaskWith(
    embed,
    "session-A",
    "what is 2+2",
    1_000,
  );
  assert.equal(result.isReask, false);
  assert.equal(result.reasksSoFar, 0);
  assert.equal(result.consequence, "none");
  assert.equal(result.nearestId, null);
});

test("near-duplicate critical wilts at the 2nd re-ask", async () => {
  __resetAllSessionsForTests();
  const embed = makeEmbedder({
    "what is 2+2": "math-a",
    "what's 2 + 2?": "math-a", // same seed = identical vector
    "compute 2+2 please": "math-a",
  });

  const r1 = await evaluateCriticalReaskWith(
    embed,
    "session-B",
    "what is 2+2",
    1_000,
  );
  assert.equal(r1.isReask, false);
  assert.equal(r1.consequence, "none");

  const r2 = await evaluateCriticalReaskWith(
    embed,
    "session-B",
    "what's 2 + 2?",
    2_000,
  );
  assert.equal(r2.isReask, true);
  assert.equal(r2.reasksSoFar, 1);
  assert.equal(r2.consequence, "none"); // 1 re-ask < WILT_THRESHOLD
  assert.ok(r2.similarityToNearest >= SEMANTIC_REASK_THRESHOLD);

  const r3 = await evaluateCriticalReaskWith(
    embed,
    "session-B",
    "compute 2+2 please",
    3_000,
  );
  assert.equal(r3.isReask, true);
  assert.equal(r3.reasksSoFar, 2);
  assert.equal(r3.consequence, "wilt"); // 2 re-asks → wilt
});

test("third re-ask kills the tree", async () => {
  __resetAllSessionsForTests();
  const embed = makeEmbedder({
    a: "topic-x",
    b: "topic-x",
    c: "topic-x",
    d: "topic-x",
  });

  const r1 = await evaluateCriticalReaskWith(embed, "session-C", "a", 1_000);
  const r2 = await evaluateCriticalReaskWith(embed, "session-C", "b", 2_000);
  const r3 = await evaluateCriticalReaskWith(embed, "session-C", "c", 3_000);
  const r4 = await evaluateCriticalReaskWith(embed, "session-C", "d", 4_000);

  assert.equal(r1.consequence, "none");
  assert.equal(r2.consequence, "none"); // 1 re-ask
  assert.equal(r3.consequence, "wilt"); // 2 re-asks
  assert.equal(r4.consequence, "dead"); // 3 re-asks
  assert.equal(r4.reasksSoFar, 3);
});

test("semantically distinct critical has no consequence", async () => {
  __resetAllSessionsForTests();
  const embed = makeEmbedder({
    "what is 2+2": "math-a",
    "name a planet": "planet-z",
  });

  const r1 = await evaluateCriticalReaskWith(
    embed,
    "session-D",
    "what is 2+2",
    1_000,
  );
  const r2 = await evaluateCriticalReaskWith(
    embed,
    "session-D",
    "name a planet",
    2_000,
  );
  assert.equal(r1.isReask, false);
  assert.equal(r2.isReask, false);
  assert.equal(r2.reasksSoFar, 0);
  assert.equal(r2.consequence, "none");
  assert.ok(r2.similarityToNearest < SEMANTIC_REASK_THRESHOLD);
});

test("exact case-insensitive match counts as a re-ask even without similarity", async () => {
  __resetAllSessionsForTests();
  // Different seeds for the two strings would normally give them low
  // similarity. The exact-match fallback should still flag them.
  const embed = makeEmbedder({
    "Solve 5x+3=18": "exact-seed-1",
    "  solve 5x+3=18 ": "exact-seed-2",
  });

  await evaluateCriticalReaskWith(
    embed,
    "session-E",
    "Solve 5x+3=18",
    1_000,
  );
  const r2 = await evaluateCriticalReaskWith(
    embed,
    "session-E",
    "  solve 5x+3=18 ",
    2_000,
  );
  assert.equal(r2.isReask, true);
  assert.equal(r2.similarityToNearest, 1);
});

test("session TTL expiry resets state", async () => {
  __resetAllSessionsForTests();
  const embed = makeEmbedder({ "what is 2+2": "math-a" });

  const r1 = await evaluateCriticalReaskWith(
    embed,
    "session-F",
    "what is 2+2",
    0,
  );
  assert.equal(r1.reasksSoFar, 0);

  // Walk past the TTL window; the next identical query should look like a
  // fresh session — no re-ask, count back to zero.
  const r2 = await evaluateCriticalReaskWith(
    embed,
    "session-F",
    "what is 2+2",
    SESSION_TTL_MS + 1,
  );
  assert.equal(r2.isReask, false);
  assert.equal(r2.reasksSoFar, 0);
  assert.equal(r2.consequence, "none");
  assert.equal(r2.nearestId, null);
});

test("embedder failure degrades gracefully without bumping the counter", async () => {
  __resetAllSessionsForTests();
  const failing: (input: string) => Promise<number[]> = async () => {
    throw new Error("provider down");
  };
  const result = await evaluateCriticalReaskWith(
    failing,
    "session-G",
    "anything",
    1_000,
  );
  assert.equal(result.isReask, false);
  assert.equal(result.reasksSoFar, 0);
  assert.equal(result.consequence, "none");
  assert.equal(result.similarityToNearest, 0);
});
