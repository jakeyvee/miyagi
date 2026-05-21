# Cloud sync (opt-in) — VOL-195

Phase 2 hardening. Implements the cloud-sync gate the PDPA readiness
review documents in [`pdpa-readiness-review.md`](./pdpa-readiness-review.md)
§7. Vendor-neutral by construction; this build ships an in-memory dev
stub and a stubbed Supabase adapter, both behind a single `SyncAdapter`
interface.

> **Default posture: OFF.** Nothing in this surface uploads anything
> until the parent explicitly toggles a feature on. The kid study flow
> never depends on the cloud and works identically with sync disabled
> or the backend unreachable.

---

## 1. Architecture at a glance

```
parent device                                   server (Vercel)              backend
─────────────                                   ───────────────              ───────
SyncPanel.tsx                                   /api/sync/identity           SyncAdapter
ClassifierLogViewer (per-row consent)   ─────►  /api/sync/settings   ─────►  memoryAdapter (default)
sync-prefs.ts (localStorage opt-in)             /api/sync/logs               supabaseAdapter (stub)
log-store.ts (IndexedDB + consent flag)         /api/sync/export
sync-engine.ts (runSync, status, export)
```

Vendor-neutral seam: every route handler depends only on the
`SyncAdapter` interface from `lib/server/sync/adapter.ts`. Swapping
backends is a single-file change in `lib/server/sync/index.ts` plus the
new adapter implementation. The route surface, the contract, and the
UI all stay the same.

---

## 2. Threat model and identity derivation

Sync requires a stable per-parent identifier without ever sending the
PIN off-device. The route handler `POST /api/sync/identity` accepts the
parent's already-hashed PIN (`pinHashHex`) and per-device `saltHex`,
both already stored locally under `kid-quest:parent:v1`, and returns

```
parentId = sha256(pinHashHex + ":" + saltHex)   // 64-char lowercase hex
```

Properties:

- **No plaintext PIN ever leaves the device.** Hashing happens on the
  client (`lib/parent/pin.ts`), the server only sees the already-hashed
  value.
- **`parentId` is one-way.** Recovering the PIN from `parentId` requires
  reversing SHA-256 of a 4-6-digit PIN concatenated with a 32-byte
  salt — not feasible.
- **Device compromise has the same impact as today.** Anyone with the
  contents of `localStorage` can compute the same `parentId` and
  impersonate the parent. That is exactly the trust class we are in
  with PIN-only local-first today; sync does not widen it.
- **The id is opaque and PII-free.** Safe to write to server logs.

The derivation is centralised in
`lib/server/sync/route-helpers.ts::deriveParentId` so a future migration
to a stronger KDF (Argon2, scrypt) is a single edit.

---

## 3. Opt-in semantics

Two distinct feature toggles, both default OFF, persisted to
`localStorage` under `kid-quest:parent:sync:v1` via
`lib/parent/sync-prefs.ts`:

| toggle      | what it does when on                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ |
| `settings`  | Uploads the parent settings blob (topicLock, ageBand, studyTimeWindow) on `runSync()`.     |
| `logs`      | Uploads classifier log rows that ALSO have a per-record consent flag set (`syncConsent`).  |
| `retentionDays` | Server retention window, bounded `[1, 365]`, default 30. Applied to log records.       |

Per the PDPA review §7.1:

- **Settings sync** is a single parent toggle. No per-record consent —
  these are the parent's own configuration.
- **Logs sync** is the parent toggle PLUS a per-record `syncConsent`
  flag, set at write time on the parent device. Default is `false`. The
  global logs toggle controls visibility of the per-record toggle in the
  Logs UI; even when the global toggle is on, ONLY records the parent
  has explicitly marked get uploaded.
- **No backfill.** Pre-existing log rows (v1 schema, no consent field)
  read as `syncConsent: false` and never sync, even after opt-in.

The `runSync()` engine in `lib/parent/sync-engine.ts` is idempotent and
safe to call repeatedly. It updates a `SyncStatus` blob in
localStorage (`kid-quest:parent:sync-status:v1`) on every run for the
parent dashboard to render.

---

## 4. IndexedDB schema (v1 → v2)

`kid-quest-logs.classifier_logs` migrated to version 2:

| field         | v1  | v2                                                  |
| ------------- | --- | --------------------------------------------------- |
| `id`          | y   | y                                                   |
| `sessionId`   | y   | y                                                   |
| `timestampMs` | y   | y                                                   |
| `input`       | y   | y                                                   |
| `verdict`     | y   | y                                                   |
| `confidence`  | y   | y                                                   |
| `syncConsent` | —   | optional; default missing/`false`                   |
| `syncedAtMs`  | —   | optional; set on server ack                         |
| index `by_timestamp`     | y   | y                                        |
| index `by_sync_consent`  | —   | added (sparse; only consented rows appear)|

The migration is **additive only**. Existing rows are left untouched
and read as `syncConsent: false`. `listLogs()` keeps its v1 signature
and strips the consent fields before returning, so legacy callers see
no shape change. New consumers use `listLogsWithConsent()`,
`listConsentedLogs()`, or `listUnsyncedConsentedLogs()`.

---

## 5. API surface

All routes are `export const dynamic = "force-dynamic"`. Every response
is JSON. Errors use `{ error: <code>, detail?: <message> }`.

| method | path                                              | purpose                                           | error codes                              |
| ------ | ------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| POST   | `/api/sync/identity`                              | Derive `parentId` from `{pinHashHex, saltHex}`.   | 400 invalid_body / invalid_pin_hash / invalid_salt |
| GET    | `/api/sync/settings?parentId=`                    | Fetch synced settings or null.                    | 400 invalid_parent_id · 503 missing_sync_env |
| PUT    | `/api/sync/settings`                              | Body `{parentId, settings, retentionDays}`.       | 400 invalid_settings · 503 missing_sync_env |
| DELETE | `/api/sync/settings?parentId=`                    | Hard delete.                                      | 400 / 503                                |
| POST   | `/api/sync/logs`                                  | Body `{parentId, records[], retentionDays}`. Cap 200/batch. | 400 batch_too_large · 503        |
| DELETE | `/api/sync/logs?parentId=&id=`                    | Delete one record.                                | 400 / 503                                |
| DELETE | `/api/sync/logs?parentId=&all=true`               | Bulk clear all logs for the parent.               | 400 / 503                                |
| GET    | `/api/sync/export?parentId=`                      | Returns `{settings, logs[]}`.                     | 400 / 503                                |

503 `missing_sync_env` fires only when `SYNC_BACKEND=supabase` AND the
Supabase env is incomplete. With `SYNC_BACKEND=memory` (the default)
the routes never 503 on env.

---

## 6. Env configuration

Server-only via `lib/server/env.ts::getServerEnv()`. All sync env vars
are OPTIONAL — `getServerEnv()` still only throws when
`ANTHROPIC_API_KEY` is missing.

| var                     | purpose                                                           | when required                        |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `SYNC_BACKEND`          | `"memory"` (default) \| `"supabase"`                              | optional; defaults to memory         |
| `SUPABASE_URL`          | Supabase project URL                                              | only when `SYNC_BACKEND=supabase`    |
| `SUPABASE_SERVICE_ROLE` | Server-only service-role key. Same trust class as ANTHROPIC_API_KEY. | only when `SYNC_BACKEND=supabase`    |

**Never** prefix any of these with `NEXT_PUBLIC_`. The privacy verify
script already enforces this on OpenAI; the same hygiene applies here.

`.env.example` carries the canonical comment block.

---

## 7. Adapter stubs

### `memoryAdapter` (`lib/server/sync/memory-adapter.ts`)

Default backend. In-process maps, scoped per `parentId`. NOT durable;
resets on every cold start (Next.js dev refresh, Vercel function cold
boot). Suitable for local smoke-testing and demos. Enforces retention
inline on every `upsertLogs` call.

Smoke-test round-trip with `SYNC_BACKEND=memory`, `npm run build && npm
run start`, then:

```sh
PID=$(curl -s -XPOST localhost:3000/api/sync/identity \
  -H 'content-type: application/json' \
  -d '{"pinHashHex":"abc","saltHex":"def"}' | jq -r .parentId)

curl -XPUT localhost:3000/api/sync/settings -H 'content-type: application/json' \
  -d "{\"parentId\":\"$PID\",\"settings\":{\"topicLock\":\"math\",\"ageBand\":\"7-9\",\"studyTimeWindow\":{\"startHHMM\":\"15:00\",\"endHHMM\":\"17:00\"}},\"retentionDays\":30}"

curl "localhost:3000/api/sync/export?parentId=$PID"
```

### `supabaseAdapter` (`lib/server/sync/supabase-adapter.ts`)

STUB. Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` from
`getServerEnv()` and throws `MissingSyncEnvError` if either is unset.
Each method body throws with a friendly TODO message.

To cut over:

1. `npm install @supabase/supabase-js` (deliberately NOT added in this
   build).
2. Create the SQL schema in `supabase-adapter.ts` (parents/settings/logs
   tables, RLS by `parent_id`).
3. Replace the `notImplemented(...)` bodies with `supabase.from(...)`
   calls.
4. Set `SYNC_BACKEND=supabase` and the two credentials in the deploy
   env.
5. Add an audit-log table per PDPA §7.6 and emit a row for every method
   call.

---

## 8. Deletion and export

Built per PDPA review §7.3 and §7.4:

- **Single-record delete:** `DELETE /api/sync/logs?parentId=...&id=...`,
  wired in the parent dashboard via the "Delete cloud data" flow's bulk
  variant; per-record delete is reachable via the API today and can be
  surfaced in the Logs tab in a follow-up.
- **Bulk clear:** `DELETE /api/sync/logs?parentId=...&all=true`. Wired
  via the "Delete cloud data" button in the Sync tab.
- **Settings delete:** `DELETE /api/sync/settings?parentId=...`. Wired
  via the same button.
- **Export:** `GET /api/sync/export?parentId=...`. Wired via the
  "Export my data" button — produces a JSON blob downloadable from the
  parent device. Includes settings + every log row currently held
  server-side for the parent.

Local data is never touched by the cloud-delete path. The parent's
existing "Clear local logs" button in the Logs tab remains the only
local-data eviction.

---

## 9. Failure modes

| condition                              | behaviour                                                         |
| -------------------------------------- | ----------------------------------------------------------------- |
| Sync disabled (default)                | `runSync()` is a no-op; status updates feature flags only.        |
| `SYNC_BACKEND=memory`, server up       | Round-trip works; data lost on cold start.                        |
| `SYNC_BACKEND=supabase` env missing    | 503 `missing_sync_env` from every route. `runSync()` records the error in `SyncStatus.lastErrorMessage`. Kid + parent flows continue. |
| Network failure                        | `runSync()` returns `{ok: false, error}`; status reflects it. No throw. |
| Per-record consent revoked             | Row's `syncedAtMs` is cleared locally. Future syncs skip it. Server-side row is NOT auto-deleted — use the dashboard "Delete cloud data" or the API. |
| IndexedDB unavailable (SSR, denied)    | Returns empty arrays; `appendLog` no-ops. Kid flow uninterrupted. |

---

## 10. What this build does NOT do

Out of scope, captured for the follow-up:

- Live Supabase wiring. The credentials and the SDK are intentionally
  not present.
- Auto-sync on local writes. `runSync()` is parent-triggered. A future
  ticket can add background sync, but the per-record consent gate
  stays.
- Per-record server-side delete from the UI. The API supports it; the
  Logs tab does not yet surface a per-row delete-cloud-copy button.
- Multi-device merge. Settings sync is last-writer-wins; logs are
  idempotent on `id`.
- Audit logging on operator reads. Required for Supabase cut-over per
  PDPA §7.6, stubbed in the SQL comments.

---

## 11. Cross-links

- [`pdpa-readiness-review.md`](./pdpa-readiness-review.md) §7 — the
  gate.
- [`parent-logs.md`](./parent-logs.md) — v1 classifier log schema and
  retention story (still load-bearing for the local-first path).
- [`privacy-audit.md`](./privacy-audit.md) — architectural privacy
  claims and the verify scripts.
