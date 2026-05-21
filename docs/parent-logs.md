# Parent classifier logs (v1)

## What we capture

Every time the kid submits an input on `/kid` and the classifier returns a
verdict, the parent device records one `ClassifierLogRecord`:

| Field         | Source                                  | Notes                                  |
| ------------- | --------------------------------------- | -------------------------------------- |
| `id`          | `crypto.randomUUID()` (fallback `${sessionId}:${timestampMs}`) | Stable per row.            |
| `sessionId`   | Kid session bus                         | Same id for paired input + verdict.    |
| `timestampMs` | Classifier-verdict event timestamp      | Used for newest-first paging.          |
| `input`       | Most recent `kid_input_submitted` for that session | Empty string if no pair found. |
| `verdict`     | `assistive` / `critical` / `off_topic` / `unsafe` | From `lib/contracts/verdict.ts`. |
| `confidence`  | `[0, 1]` float                          | Validated on read-back.                |

The row is paired by `lib/parent/log-bridge.ts`, which subscribes once to
the kid session event bus (`lib/kid/session-events.ts`) and writes via
`appendLog()` in `lib/parent/log-store.ts`.

## Where it lives

- **IndexedDB on the parent device only.**
  - Database: `kid-quest-logs`
  - Object store: `classifier_logs` (key path `id`)
  - Index: `by_timestamp` on `timestampMs` (newest-first paging)
- **The server never receives these rows in v1.** No API call ships them.
- localStorage is unrelated (it only holds the parent PIN hash + settings —
  see `lib/parent/local-store.ts`).

## Retention

- Manual only. The parent dashboard exposes a **Clear local logs** button
  with a two-tap confirm step. There is no automatic eviction in v1.
- Clearing the browser site data (or uninstalling the PWA) also drops the
  store; no separate cleanup is required.

## Failure behaviour

- `appendLog` is best-effort. If IndexedDB is unavailable, denied, or full,
  the write is logged via `console.warn` and the kid flow continues
  uninterrupted. The bridge never re-throws into the event bus.
- The log viewer surfaces a retry affordance if `listLogs` rejects.

## Viewer surface

`app/parent/_components/ClassifierLogViewer.tsx`, mounted inside
`<ParentDashboard />` (post PIN-unlock). Pages 50 rows at a time using
`beforeTimestampMs` and stops when a partial page is returned. Mobile-first
inline styles — verdict chip + confidence + clamped input with show-more.

## Forward-compatibility (VOL-195 opt-in sync)

The store is intentionally the canonical local source of truth. A future
opt-in sync (VOL-195) can:

1. Read with `listLogs({ limit, beforeTimestampMs })` to walk newest-first.
2. Use `id` as the dedupe key against the remote side.
3. Leave local rows in place — clearing remains a parent-driven action.

No schema bump is required for the planned sync; if v2 ever adds fields,
the existing `onupgradeneeded` migration is the single seam to extend.
