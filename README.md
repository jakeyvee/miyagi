# kid-quest

Mobile-first Next.js 15 App Router PWA. Two user surfaces (`parent`, `kid`)
and one server-only API surface (`api`).

## Local dev

```sh
npm install
cp .env.example .env.local   # fill in OPENAI_API_KEY for route-handler work
npm run dev                  # http://localhost:3000
```

Other scripts:

| script              | purpose                                    |
| ------------------- | ------------------------------------------ |
| `npm run build`     | Production build. Used as the CI gate.     |
| `npm run start`     | Serve the production build.                |
| `npm run typecheck` | `tsc --noEmit`. Runs strict TS checks.     |
| `npm run lint`      | `next lint`.                               |

## Ownership map

| path                  | owner                                         |
| --------------------- | --------------------------------------------- |
| `app/parent/**`       | Parent setup + settings UI.                   |
| `app/kid/**`          | Kid quest UI.                                 |
| `app/api/**`          | Server route handlers. **OpenAI lives here.** |
| `lib/contracts/**`    | Client-safe shared types. Importable anywhere.|
| `lib/server/**`       | Server-only helpers. Marked with `server-only`.|

## Server / client boundary

The contract is intentionally narrow:

- **`lib/contracts/*`** — pure TypeScript types and small const arrays. Safe to
  import from any client component, server component, or route handler.
- **`lib/server/*`** — every file starts with `import "server-only";`. Importing
  from a client component will fail the build. This is where API keys are read.
- **`app/api/**/route.ts`** — the only place that calls external LLM providers.
  Reads secrets via `getServerEnv()` from `@/lib/server/env`.

**Do not** introduce a browser-side OpenAI client, expose `OPENAI_API_KEY` as
`NEXT_PUBLIC_*`, or fetch the OpenAI API from a client component. All LLM
calls go through `app/api/*` route handlers.

**Do not** add microphone, audio, or speech APIs in the foundation. Kid input
is typed text only in v1.

## Required env

| name             | scope        | purpose                              |
| ---------------- | ------------ | ------------------------------------ |
| `OPENAI_API_KEY` | server-only  | Used by the classifier route handler.|

Server-only env is read through `getServerEnv()` (see `lib/server/env.ts`),
which throws a clear error if a required key is missing.

## Shared contracts

All re-exported from `@/lib/contracts`:

- `Verdict`, `VERDICTS`, `isVerdict` — closed set of classifier verdicts:
  `assistive` (mechanical help — typing, vocab, spelling, factual recall),
  `critical` (kid should think through it — math reasoning, essay drafting,
  planning), `off_topic` (outside parent-set topic lock), `unsafe` (adult or
  dangerous content).
- `AgeBand`, `AGE_BANDS`, `isAgeBand` — closed set of age bands.
- `ParentSettings`, `StudyTimeWindow` — local-first parent config.
- `ClassifierRequest`, `ClassifierResponse` — POST `/api/classifier` shapes.
- `SessionEvent`, `SessionEventType`, `TreeState` — kid-session event union.
- `FixtureRecord` — canned input/response pair for demo/fixture mode.
- `ClassifierLogRecord` — one row of the local parent-facing log.

Follow-on tickets should import these instead of redefining request/response
shapes.

## Out of scope for this foundation

- Full parent flow, kid flow, LLM prompts, tree animation.
- Fixture-mode runtime, logs UI, service worker.
- Cloud sync, multi-kid profiles.
