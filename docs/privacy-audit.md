# Privacy & server-boundary audit (VOL-187)

This document is the demo-day evidence pack for kid-quest's privacy posture.
It is intended to be copy-pasted into the runbook ticket (VOL-188) and read
verbatim during the demo dry run.

## TL;DR

- The OpenAI API key never leaves the server. The browser bundle has no SDK
  import, no `process.env.ANTHROPIC_API_KEY` read, no `NEXT_PUBLIC_*` envar
  carrying it, and no direct `api.anthropic.com` URL.
- The app has zero microphone, audio, or speech APIs. Kid input is typed
  text only.
- Parent settings and the PIN hash live in a single `localStorage` key on
  the parent's device. Classifier logs live in an IndexedDB database on the
  same device. There is no cloud sync in v1.
- All LLM provider calls go through Next.js route handlers under
  `app/api/**`, which import the OpenAI SDK exclusively from
  `lib/server/anthropic.ts` (the file starts with `import "server-only";`).

## The four architectural claims

### Claim 1 — `ANTHROPIC_API_KEY` is server-only

| where it is read       | file                                | guard                              |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| canonical reader       | `lib/server/env.ts:16`              | first line is `import "server-only";` |
| health probe (presence only) | `app/api/health/route.ts:33-34`     | route handler — never sent to browser |
| OpenAI client constructor | `lib/server/anthropic.ts:18`           | server-only marker; lazy singleton |

The browser bundle is checked at build time by `scripts/inspect-client-bundle.sh`,
which `grep`s every file under `.next/static/**` for `ANTHROPIC_API_KEY` and
`sk-ant-...` literals.

The name `NEXT_PUBLIC_ANTHROPIC_API_KEY` is forbidden everywhere in the repo —
even in docs — so it never gets copy-pasted into a Vercel env-var form.

### Claim 2 — No microphone / audio / speech APIs

`scripts/verify-privacy.ts` fails on any source file containing any of:
`getUserMedia`, `MediaRecorder`, `webkitSpeechRecognition`, `SpeechRecognition`,
`speechSynthesis`, `AudioContext`, `MediaStreamTrack`, `navigator.mediaDevices`.

Kid input is constrained at the UI layer:

- `app/parent/_components/Settings.tsx:89` — `type="text"` for topic lock.
- `app/parent/_components/PinSetup.tsx:76,92` — `type="password"` for the PIN.
- `app/parent/_components/PinUnlock.tsx:108` — `type="password"` for the PIN.
- `app/parent/_components/Settings.tsx:123,133` — `type="time"` for the
  study window.

There are no other `<input>` elements in the parent surface, no `<input>`
elements at all in the kid surface (it uses a typed-text panel that owns its
own `<textarea>`-style input), and `<input type="file">` is banned by the
verify script.

### Claim 3 — Local-first storage only

Two distinct, namespaced, browser-side stores:

| store        | mechanism      | key / db                  | source of truth              |
| ------------ | -------------- | ------------------------- | ---------------------------- |
| parent state | `localStorage` | `kid-quest:parent:v1`     | `lib/parent/local-store.ts:15` |
| classifier logs | IndexedDB   | db `kid-quest-logs`, store `classifier_logs` | `lib/parent/log-store.ts:17-19` |

`lib/parent/local-store.ts` holds `{ pin: { saltHex, hashHex } | null, settings: ParentSettings | null }`.
The plaintext PIN is **never** persisted; only `SHA-256(salt + pin)` is, via
`lib/parent/pin.ts:hashPin`. PIN comparison is constant-time
(`lib/parent/pin.ts:safeEqualHex`).

The IndexedDB log writer (`lib/parent/log-store.ts:appendLog`) is best-effort
and never throws to the caller, so a quota-full or storage-denied browser
does not interrupt the kid flow. No log row is ever sent to the server in v1.

### Claim 4 — All LLM access goes through `app/api/**`

The single OpenAI client lives in `lib/server/anthropic.ts`. Every file in that
directory starts with `import "server-only";`, which causes the Next.js
bundler to fail the build if the module is imported from any client
component. The three route handlers that use it:

- `app/api/classifier/route.ts:10` — classifier verdict (JSON).
- `app/api/answer/route.ts:3` — streaming assistive helper.
- `app/api/socratic/route.ts:9` — streaming Socratic tutor.

The health probe (`app/api/health/route.ts`) intentionally does **not** import
the SDK — it only reports `hasAnthropicKey: <boolean>` without ever returning
the value.

The service worker (`app/sw.ts:24-31`) explicitly registers `/api/*` as
`NetworkOnly`, so a stale classifier verdict can never be served from cache.

## Automated verify scripts

| script                           | what it catches                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run verify:privacy`         | static scan of source tree for: client-side `openai` import, `NEXT_PUBLIC_*OPENAI*` env vars, client-side `process.env.ANTHROPIC_API_KEY` reads, microphone/audio/speech API references, `<input type="file">`. |
| `npm run verify:network`         | static scan of `app/**` and `lib/**` for any direct provider URL (`api.anthropic.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`). All client network calls must be same-origin `/api/*`. |
| `npm run verify:bundle`          | greps the built `.next/static/**` bundle for `ANTHROPIC_API_KEY`, `sk-ant-...` key literals, `getUserMedia`, `MediaRecorder`, `webkitSpeechRecognition`, and `api.anthropic.com`. Runs `npm run build` first if `.next` is missing. |
| `npm run verify:privacy:all`     | runs all three serially (`verify:privacy && verify:network && verify:bundle`) for a single CI gate.              |

All three exit `0` on PASS and `1` on FAIL (`2` for tool/build errors in the
bundle inspector). Run them locally before opening a PR.

### Documented exceptions

The privacy scanner intentionally applies the audio/speech and
`process.env.ANTHROPIC_API_KEY` rules to **code files only** (`.ts`, `.tsx`,
`.js`, `.jsx`, `.mjs`, `.cjs`, `.html`). Markdown is excluded for those
rules because:

- `docs/capacitor-evaluation.md:173` names `SpeechRecognition` precisely to
  explain why Capacitor plugins for it are banned.
- `docs/deployment.md:203` quotes `process.env.ANTHROPIC_API_KEY` while
  explaining why the health probe reads it directly.

The `NEXT_PUBLIC_*OPENAI*` rule, by contrast, applies to **all** files
(`.md`/`.mdx` included) so that variable name is never normalized in any
artifact.

The `data/classifier-corpus/**` directory (kid-typed fixture sentences,
some of which contain words like "audio" or "speech") and
`scripts/eval-classifier.ts` are excluded from the audio-API scan; the
corpus is a labeled dataset, not executable code.

## Manual verification (deployed Vercel build)

These steps belong in the demo-day pre-flight, immediately after the verify
scripts pass on `main`.

### A. Confirm the key never reaches the browser

1. Open the deployed URL in Safari on an iPhone.
2. Settings → Safari → Advanced → **Web Inspector**, plug into a Mac and
   open Safari → Develop → \<device\> → kid-quest.
3. **Network** tab → Reload the page → confirm no request to
   `api.anthropic.com` or any non-same-origin host. The only outbound calls
   should be to your Vercel domain.
4. **Sources** tab → search the loaded scripts (Cmd+Opt+F) for:
   - `ANTHROPIC_API_KEY` → expect zero matches.
   - `sk-` → expect zero matches.
   - `getUserMedia` → expect zero matches.

### B. Confirm storage is local-only

1. **Storage** / **Application** tab → Local Storage → your domain.
   - Expect a single key: `kid-quest:parent:v1` whose value contains
     `{ pin: { saltHex, hashHex }, settings: {...} }`. The PIN value
     **must** look like a hex digest, not a numeric PIN.
2. **Storage** → IndexedDB.
   - Expect one database: `kid-quest-logs`, version `1`, one object store:
     `classifier_logs`. Each row has `id`, `sessionId`, `timestampMs`,
     `input`, `verdict`, `confidence`. Nothing else.
3. Cookies → expect no app-set cookies (only Vercel's deployment cookies, if
   any).

### C. Confirm the server boundary is healthy

1. Hit `GET https://<deployed-url>/api/health` from a phone browser. Expect:
   `{"ok":true,"hasAnthropicKey":true}`. If `hasAnthropicKey:false`, fix the env
   var in Vercel and redeploy before continuing.
2. Hit `POST https://<deployed-url>/api/classifier` with an empty body.
   Expect `400 invalid_json` (proves the route is reachable and validating).
3. Service worker check (Application → Service Workers). The Serwist worker
   should be active with scope `/`. Network tab → reload while online →
   confirm `/api/*` requests show "from network", not "from ServiceWorker"
   (they are pinned to `NetworkOnly` in `app/sw.ts:24-31`).

### D. Mic permission probe (negative test)

1. Open the deployed URL on iOS Safari.
2. Settings → Safari → Camera & Microphone for the site → confirm the
   permission is **not** requested at any point during the kid flow.
3. If the OS ever prompts for mic access from kid-quest, treat it as a
   demo-blocker and run `npm run verify:privacy` against `main` to find the
   regression.

## Claim → test → residual risk

| claim                                          | automated test                                              | manual check                            | residual risk                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `ANTHROPIC_API_KEY` is server-only             | `verify:privacy` (no client read / no `NEXT_PUBLIC_*`) + `verify:bundle` (no `ANTHROPIC_API_KEY` / `sk-` in `.next/static`) | DevTools Sources search for `ANTHROPIC_API_KEY` / `sk-` | Someone could SSR the key into HTML via a Server Component. The bundle scan does not cover prerendered HTML — manual DevTools "Document" view check needed before each major release. |
| 2. No mic / audio / speech APIs                | `verify:privacy` (regex on `getUserMedia` etc.) + `verify:bundle` (same regex on built static) | iOS mic permission probe                | A new dependency could pull in a speech API transitively. The bundle scan catches identifier names; an obfuscated minified rename would not be flagged. |
| 3. Local-first storage only                    | none (positive presence cannot be statically proven, but `verify:network` ensures no client-side third-party hostname is contacted) | DevTools Storage tab: only `kid-quest:parent:v1` + `kid-quest-logs` | A future sync feature (VOL-195) must be a separate opt-in; the verify scripts will not catch a same-origin POST to a new sync route — add a new rule when that lands. |
| 4. All LLM access goes through `app/api/**`    | `verify:privacy` (no `openai` import outside server-only) + `verify:network` (no `api.anthropic.com` URL in `app/**`/`lib/**`) | DevTools Network tab: zero requests to `api.anthropic.com` | A `lib/server/*` file could in theory `fetch()` a different provider directly. `verify:network` covers the top three providers' base hosts; add new providers to the list as needed. |

## How to extend this audit

- Adding a new provider? Add its base URL to `FORBIDDEN_URL_RES` in
  `scripts/verify-network-paths.ts` so the client can never fetch it directly.
- Adding a new server-only env var? Read it via `getServerEnv()` in
  `lib/server/env.ts` and add a parallel rule to `RULES` in
  `scripts/verify-privacy.ts` to forbid client-side reads.
- Adding a new browser-side store (e.g. Cache API, OPFS)? Document it in
  the **Claim 3** table above and update the manual DevTools check in
  section B.
