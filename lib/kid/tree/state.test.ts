/**
 * Unit tests for the pure tree reducer (`./state.ts`).
 *
 * Runner: `node --test` via `tsx` (e.g. `npx tsx --test lib/kid/tree/state.test.ts`).
 * VOL-189 is adding `tsx` to devDependencies; once that lands, see
 * `docs/tree-state.md` for the one-liner.
 *
 * Until then, this file is plain ESM-compatible Node test code — no
 * package.json change needed from this ticket.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEAD_THRESHOLD,
  WILT_THRESHOLD,
  initialTreeState,
  reduceTree,
  type TreeReducerEvent,
  type TreeStateModel,
} from "./state";

function run(events: TreeReducerEvent[]): TreeStateModel {
  return events.reduce<TreeStateModel>(reduceTree, initialTreeState());
}

describe("initialTreeState", () => {
  it("starts at the seed with zero brute-force and alive", () => {
    const s = initialTreeState();
    assert.equal(s.state, "seed");
    assert.equal(s.thrivingStage, 0);
    assert.equal(s.bruteForceCount, 0);
    assert.equal(s.isWilted, false);
    assert.equal(s.isDead, false);
  });
});

describe("assistive growth", () => {
  it("advances one stage per assistive completion", () => {
    const s = run([{ type: "assistive_completed" }]);
    assert.equal(s.state, "sprout");
    assert.equal(s.thrivingStage, 1);
  });

  it("reaches blooming after four assistive completions", () => {
    const s = run([
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
    ]);
    assert.equal(s.state, "blooming");
    assert.equal(s.thrivingStage, 4);
  });

  it("caps at blooming — additional assistive completions do not overflow", () => {
    const s = run([
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "assistive_completed" },
    ]);
    assert.equal(s.state, "blooming");
    assert.equal(s.thrivingStage, 4);
  });
});

describe("brute-force critical consequences", () => {
  it("first critical submission does not wilt or kill", () => {
    const s = run([{ type: "kid_submitted_critical" }]);
    assert.equal(s.bruteForceCount, 1);
    assert.equal(s.isWilted, false);
    assert.equal(s.isDead, false);
  });

  it(`wilts at ${WILT_THRESHOLD} consecutive brute-force critical attempts`, () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
    ]);
    assert.equal(s.bruteForceCount, WILT_THRESHOLD);
    assert.equal(s.isWilted, true);
    assert.equal(s.isDead, false);
  });

  it(`dies at ${DEAD_THRESHOLD} consecutive brute-force critical attempts`, () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
    ]);
    assert.equal(s.bruteForceCount, DEAD_THRESHOLD);
    assert.equal(s.isWilted, true);
    assert.equal(s.isDead, true);
  });

  it("dead is absorbing — further events do not mutate", () => {
    const dead = run([
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
    ]);
    const after = reduceTree(dead, { type: "assistive_completed" });
    assert.equal(after, dead, "reducer should return the same reference");
    assert.equal(after.thrivingStage, 0);
    assert.equal(after.isDead, true);
  });

  it("wilt prevents growth — assistive_completed does not advance a wilted tree", () => {
    const s = run([
      { type: "assistive_completed" }, // sprout
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" }, // wilt
      { type: "assistive_completed" }, // gated
    ]);
    assert.equal(s.isWilted, true);
    assert.equal(s.state, "sprout");
    assert.equal(s.thrivingStage, 1);
    assert.equal(s.bruteForceCount, 0, "assistive resets the streak even when wilted");
  });
});

describe("brute-force counter resets", () => {
  it("kid_engaged_socratic resets the brute-force counter", () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "kid_engaged_socratic" },
      { type: "kid_submitted_critical" }, // back to 1, not 2 -> no wilt
    ]);
    assert.equal(s.bruteForceCount, 1);
    assert.equal(s.isWilted, false);
    assert.equal(s.isDead, false);
  });

  it("kid_submitted_assistive resets the brute-force counter", () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_assistive" },
      { type: "kid_submitted_critical" },
    ]);
    assert.equal(s.bruteForceCount, 1);
    assert.equal(s.isWilted, false);
  });

  it("assistive completion clears the streak", () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "assistive_completed" },
    ]);
    assert.equal(s.bruteForceCount, 0);
    assert.equal(s.thrivingStage, 1);
  });

  it("wilt and death do NOT clear on engagement — modifiers persist", () => {
    const s = run([
      { type: "kid_submitted_critical" },
      { type: "kid_submitted_critical" },
      { type: "kid_engaged_socratic" },
    ]);
    assert.equal(s.isWilted, true);
    assert.equal(s.bruteForceCount, 0);
  });
});

describe("session_ended", () => {
  it("is a no-op for the reducer — host decides reset", () => {
    const before = run([
      { type: "assistive_completed" },
      { type: "kid_submitted_critical" },
    ]);
    const after = reduceTree(before, { type: "session_ended" });
    assert.deepEqual(after, before);
  });
});

describe("determinism", () => {
  it("the same event sequence yields the same final model", () => {
    const seq: TreeReducerEvent[] = [
      { type: "assistive_completed" },
      { type: "assistive_completed" },
      { type: "kid_submitted_critical" },
      { type: "kid_engaged_socratic" },
      { type: "assistive_completed" },
    ];
    assert.deepEqual(run(seq), run(seq));
  });
});
