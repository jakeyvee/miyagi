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

- `Verdict`, `VERDICTS`, `isVerdict` — closed set of classifier verdicts.
- `AgeBand`, `AGE_BANDS`, `isAgeBand` — closed set of age bands.
- `ParentSettings`, `StudyTimeWindow` — local-first parent config.
- `ClassifierRequest`, `ClassifierResponse` — POST `/api/classifier` shapes.
- `SessionEvent`, `SessionEventType`, `TreeState` — kid-session event union.
- `FixtureRecord` — canned input/response pair for demo/fixture mode.
- `ClassifierLogRecord` — one row of the local parent-facing log.

Follow-on tickets should import these instead of redefining request/response
shapes.

## Deployment

The demo is deployed to **Vercel** from `main`. Every other branch produces a
preview deployment with its own URL. See [`docs/deployment.md`](./docs/deployment.md)
for the full runbook (repo connect, env config, verification, cache busting,
rollback).

Quick reference:

1. **Vercel project**: framework auto-detects as Next.js; build, install, and
   output dirs use the defaults. Node 20.x.
2. **Region + function limits**: pinned in `vercel.json` at the repo root.
   Region is `iad1`. The classifier route gets a 30s `maxDuration` for
   streaming headroom; the health probe is capped at 5s.
3. **Env vars** (Project Settings → Environment Variables):
   - `OPENAI_API_KEY` — server-only. **Must not** start with `NEXT_PUBLIC_`,
     or the value leaks into the browser bundle. Mark it as **Secret**. Apply
     to Production **and** Preview.
   - The app reads this via `getServerEnv()` in `lib/server/env.ts`, which
     throws a clear error if unset. `next build` itself does **not** call
     `getServerEnv()`, so a missing key fails at request time, not at build
     time — see the runbook for the fail-closed contract.
4. **Preview vs production**: same env vars, same code path. Previews carry
   Vercel's default `noindex` header; production is indexable.
5. **Verify a deploy**: hit `GET /api/health` from a phone. Expected:
   `{ "ok": true, "hasOpenAiKey": true }`. The key value is never returned —
   only whether it is set. If `hasOpenAiKey` is `false`, the classifier is
   guaranteed to fail; fix the env var and **redeploy** (Vercel does not
   auto-redeploy on env-var edits).
6. **Classifier reachability**: `POST /api/classifier` currently returns
   `501 not_implemented` by design. A `501` from the deployment URL proves
   routing works; the OpenAI wire-up is a separate ticket.

## Out of scope for this foundation

- Full parent flow, kid flow, LLM prompts, tree animation.
- Fixture-mode runtime, logs UI, service worker.
- Cloud sync, multi-kid profiles.
