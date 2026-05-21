# Tree state machine (VOL-184)

Short reference for the kid-surface tree visual + the pure reducer that
drives it. Source of truth lives in `lib/kid/tree/`.

## Files

- `lib/kid/tree/state.ts` — pure reducer. No React, no I/O. Inputs are a
  tiny internal `TreeReducerEvent` union; outputs are a `TreeStateModel`.
- `lib/kid/tree/hook.ts` — `useTreeState()` React hook. Subscribes to the
  session event bus and translates raw `SessionEvent`s into reducer events.
- `app/kid/_components/Tree.tsx` — client component visual (inline SVG, five
  thriving stages + wilt + dead modifiers).
- `lib/kid/tree/state.test.ts` — unit tests for the reducer.

## State model

```
{
  state:           "seed" | "sprout" | "sapling" | "tree" | "blooming"
  thrivingStage:   0 | 1 | 2 | 3 | 4
  bruteForceCount: number   // back-to-back brute-force critical attempts
  isWilted:        boolean  // current stage shown washed out
  isDead:          boolean  // game-over silhouette, growth disabled
}
```

`thrivingStage` -> `state` mapping (1:1):

| stage | state    |
| ----- | -------- |
| 0     | seed     |
| 1     | sprout   |
| 2     | sapling  |
| 3     | tree     |
| 4     | blooming |

## Reducer events

| event                       | meaning                                           |
| --------------------------- | ------------------------------------------------- |
| `assistive_completed`       | assistive answer stream finished (advance stage)  |
| `kid_submitted_critical`    | a detected brute-force critical re-submission     |
| `kid_submitted_assistive`   | kid submitted an assistive request (reset streak) |
| `kid_engaged_socratic`      | kid re-engaged the Socratic loop (reset streak)   |
| `session_ended`             | no-op; host decides whether to reset on next open |

## Transitions

| current → on event              | effect                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| any → `assistive_completed`     | `thrivingStage = min(4, thrivingStage + 1)`; reset brute-force  |
| wilted → `assistive_completed`  | NO stage advance (kid must reset session); brute-force resets   |
| dead → anything                 | no change (dead is absorbing)                                   |
| any → `kid_submitted_critical`  | `bruteForceCount += 1`; wilt at 2; dead at 3                    |
| any → `kid_submitted_assistive` | `bruteForceCount = 0`                                           |
| any → `kid_engaged_socratic`    | `bruteForceCount = 0` (wilt/death modifiers persist)            |
| any → `session_ended`           | no change                                                       |

## Thresholds

- `WILT_THRESHOLD = 2` — two brute-force critical attempts wilt the tree.
- `DEAD_THRESHOLD = 3` — three brute-force critical attempts kill it.
- Stage cap: 4 (`blooming`).

## Phase 1 brute-force heuristic

The reducer doesn't decide what counts as "brute-force" — the hook does. In
Phase 1, the hook treats this pattern as a brute-force critical
re-submission:

> Two consecutive `classifier_verdict` events with `verdict === "critical"`
> where between them there was a `kid_input_submitted` but NO
> `tree_state_changed` (no assistive completion) AND no `session_ended`.

The very first critical of a streak is treated as engagement (the kid is
entering the Socratic loop) and does NOT increment `bruteForceCount`. Only
the 2nd, 3rd, ... consecutive criticals are dispatched as
`kid_submitted_critical` to the reducer.

This is deliberately a runtime heuristic — the kid surface doesn't emit a
dedicated "Socratic kid turn" event, so we infer it from the absence of a
follow-up classifier verdict.

## Handoff to VOL-190 (semantic refinement)

VOL-190 should replace the heuristic with explicit kid-surface events:

- An `assistive_completed` event (or a stream-end token) that supersedes the
  current `tree_state_changed` advisory hop. Swap it in inside
  `lib/kid/tree/hook.ts` — that's the single source-of-truth seam.
- A `kid_socratic_turn` event so the hook can dispatch
  `kid_engaged_socratic` precisely (today it relies on the absence of a
  classifier verdict).
- Optionally, a `kid_brute_force_detected` event emitted by the surface
  itself if VOL-190 wants the detection logic to live closer to the input
  handler.

The reducer's contract (`reduceTree(state, event) -> state`) should remain
stable across that refactor.

## Running the unit tests

The reducer is plain ESM-friendly TS. Until `tsx` lands in devDependencies
(VOL-189), the simplest one-liner is:

```sh
npx --yes tsx --test lib/kid/tree/state.test.ts
```

Once `tsx` is in `devDependencies`, run:

```sh
npx tsx --test lib/kid/tree/state.test.ts
```

The test file uses only `node:test` and `node:assert/strict` — no extra
test framework needed.
