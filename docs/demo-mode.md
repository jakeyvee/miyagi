# Demo / fixture mode

Kid-quest ships a **demo mode** that bypasses the live OpenAI route and replays
canned fixtures instead. It exists so the team can show the product on stage,
in classrooms, and in offline environments without provider keys, API quotas,
or network jitter — and so the surface degrades gracefully when the live route
times out during a live walkthrough.

When demo mode is **off** (the default), nothing in this document applies. The
kid surface goes straight to `/api/classifier`, `/api/answer`, and
`/api/socratic` exactly as it does today.

## Enabling demo mode

There are two ways to flip demo mode on. Either is sufficient — the surface
checks both.

### 1. Environment variable (recommended for stage machines)

Set `NEXT_PUBLIC_KID_QUEST_DEMO_MODE` to `1`, `true`, `yes`, or `on` before
the Next.js build / dev server starts:

```bash
NEXT_PUBLIC_KID_QUEST_DEMO_MODE=1 npm run dev
# or in production:
NEXT_PUBLIC_KID_QUEST_DEMO_MODE=1 npm run build && npm run start
```

Because the flag has the `NEXT_PUBLIC_` prefix, Next inlines it at build time
and the kid surface can read it from `process.env` without a server round-trip.

### 2. Parent dashboard override (recommended for ad-hoc demos)

Open `/parent`, unlock with the PIN, and on the **Settings** tab scroll to the
bottom. Click the small grey **Demo mode** link to reveal a single checkbox:

> ☐ Replay fixtures on the kid surface (stage/demo only)

Toggling it writes to `localStorage[kid-quest:demo-mode]` and dispatches a
`storage` event so other open tabs (including the `/kid` surface) react
immediately. Toggling the box off removes the key.

## Disabling demo mode

- If demo mode was enabled by env var: unset `NEXT_PUBLIC_KID_QUEST_DEMO_MODE`
  and restart the build.
- If demo mode was enabled by the parent override: open the **Demo mode**
  panel in `/parent` and uncheck the box, or clear the
  `kid-quest:demo-mode` key from localStorage.

## What demo mode changes on the kid surface

When demo mode is on, every new kid submission:

1. **Skips `/api/classifier`.** Instead, the kid surface advances an
   in-memory fixture cursor (`advanceFixtureCursor()` in
   `lib/kid/demo-mode.ts`) and uses the fixture's canned
   `classifier: ClassifierResponse` as the verdict.
2. **For `assistive` fixtures:** streams `fixture.answer` through
   `fakeStreamFromText`, which yields ~5-20 char chunks with a short delay
   so it looks like real token streaming on the projector.
3. **For `critical` fixtures:** runs a fake Socratic loop using
   `fixture.socratic.turns`. Each kid follow-up reveals the next canned
   tutor turn. The global `SOCRATIC_TURN_CAP` is honored — when reached,
   the **Want a hint?** button appears as in the live flow and streams
   `fixture.socratic.hint`.
4. **For `off_topic` / `unsafe` fixtures:** shows the same refusal copy as
   the live flow.

Session events still fire (`kid_input_submitted`, `classifier_verdict`,
`tree_state_changed`) so the tree state machine grows / wilts / dies exactly
as it would with live data.

## Visible verdict + confidence chip

Regardless of demo mode, the `data-slot="verdict-chip"` element below the
tree now renders a stage-readable summary after every submission:

```
●  assistive  ·  96% conf
```

The dot at the start indicates the source of the verdict:

| Dot color | Meaning                                                |
| --------- | ------------------------------------------------------ |
| grey      | No submission yet this session.                        |
| green     | Live classifier returned the verdict.                  |
| amber     | Verdict came from a fixture (demo bypass, timeout, or gesture). |

For tooling that needs to detect fixture-replayed events without subscribing
to the in-memory bus, the chip also exposes `data-fixture-event="1"` and
`data-verdict-source="fixture|live|none"`.

## 5-second timeout fallback (demo mode only)

In demo mode, the live `/api/classifier` call is wrapped in a 5-second
timeout (see `lib/kid/timeout.ts` for the typed helper). If the route
hasn't returned in time, the surface silently aborts it and falls through to
`advanceFixtureCursor()` — the kid sees the next fixture replay instead of
an error.

Outside demo mode the timeout doesn't trigger a fixture swap (there are no
fixtures to swap to); it surfaces a neutral retry message and lets the kid
try again.

Each fallback logs a tagged line to the console so the runbook agent and
parent log viewer can confirm the swap during a stage drill:

```
[kid-quest demo] fixture fallback fired (reason=timeout verdict=critical fixture=fx-math-critical-1)
```

`reason` is one of `demo_bypass | timeout | gesture`.

## Hidden stage-recovery gesture

When demo mode is on, the tree slot accepts two hidden affordances. Either
fires first wins; both are no-ops outside demo mode and never appear
on-screen:

1. **Three simultaneous touches on the tree** — fires immediately.
2. **A single long-press on the tree ≥ 800 ms** — fires on release timer.

The gesture advances the fixture cursor by one and replays that fixture as
if the kid had typed `fixture.input`. It's intended for the on-stage
operator: if a demo wanders into a weird state, place three fingers on the
tree (or hold for a beat) and the next canned exchange takes over.

## Fixture list

The canonical fixture set lives in `lib/fixtures.ts`. Order is significant —
`getNextFixture` rotates through it in declared order so a demo always tells
the same story.

| # | id                  | topic   | age   | verdict    | shape                                    |
| - | ------------------- | ------- | ----- | ---------- | ---------------------------------------- |
| 1 | fx-math-assist-1    | math    | 7-9   | assistive  | canned `answer`                          |
| 2 | fx-math-critical-1  | math    | 7-9   | critical   | 3 Socratic turns + hint                  |
| 3 | fx-eng-assist-1     | english | 7-9   | assistive  | canned `answer`                          |
| 4 | fx-eng-critical-1   | english | 7-9   | critical   | 3 Socratic turns + hint                  |
| 5 | fx-off-topic-1      | math    | 7-9   | off_topic  | refusal copy                             |
| 6 | fx-unsafe-1         | math    | 7-9   | unsafe     | refusal copy                             |
| 7 | fx-math-assist-2    | math    | 4-6   | assistive  | canned `answer` (younger age band)       |
| 8 | fx-eng-critical-2   | english | 10-12 | critical   | 3 Socratic turns + hint (older age band) |

To extend the set, edit `lib/fixtures.ts`. Keep `topicLock` to one of the
demo personas (`math` or `english`) and keep the canned text age-band
appropriate. The classifier `confidence` values are floats in `0..1`.

## Files

- `lib/fixtures.ts` — fixture list + `getNextFixture` / `getFixtureAt`.
- `lib/kid/demo-mode.ts` — env+localStorage flag, `useDemoMode` hook,
  `setDemoMode`, `advanceFixtureCursor`, `peekFixtureCursor`.
- `lib/kid/streaming.ts` — `fakeStreamFromText` for canned streaming.
- `lib/kid/timeout.ts` — typed `withTimeout` helper.
- `app/kid/_components/KidStudy.tsx` — fixture bypass, timeout fallback,
  gesture handlers, visible chip.
- `app/parent/_components/ParentDashboard.tsx` — Settings-tab footer
  override link.
