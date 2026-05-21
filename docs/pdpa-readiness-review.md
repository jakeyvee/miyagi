# PDPA and minor-user readiness review (VOL-191)

Phase 2 gate document. This is a documentation-only review of kid-quest's
current data flows, storage posture, and operational practices against
Singapore's Personal Data Protection Act ("PDPA") baseline and the
additional care expected when a product is intended to be used by minors.

It is the formal readiness gate that VOL-195 (opt-in cloud sync) depends
on, and the reference document for anyone considering moving the product
from its current "adult proxy tester on stage" demo posture to a real
pilot with minor users.

This is not a legal opinion. It is an engineering-and-product readiness
review against a public baseline.

---

## 1. TL;DR — go / no-go

**Today's posture passes.** kid-quest is being demoed to adult proxy
testers only, with no minor users on stage, no cross-device sync, no
server-side persistence of kid input or classifier output, and no
microphone/camera/audio path. The data that leaves the parent device is
narrowly scoped (kid-typed query text, topic lock, age band, and an
optional embedding for brute-force detection), it goes only to OpenAI via
our own server-only route handlers, and the OpenAI API key never reaches
the browser. The local stores (`localStorage` for parent PIN hash +
settings, IndexedDB for classifier logs) are namespaced, parent-clearable,
and not synced anywhere. That is sufficient for the stage demo as
currently scoped.

**A real minor-user pilot — even a small one (sub-100 minors at a single
pilot site) — must NOT begin until every item in
[§8 Go/no-go checklist for a real minor-user pilot](#8-gono-go-checklist-for-a-real-minor-user-pilot)
is satisfied.** The most load-bearing conditions are: (a) a parental
consent UX that names the OpenAI flow explicitly, (b) an on-screen
first-run notice on the kid surface, (c) a working local-log export
alongside the existing clear, (d) a documented incident-response and
support-contact path, and (e) — if any cloud sync is enabled — per-feature
opt-in plus per-record consent flags, server-side retention windows, and
a deletion API. See §7 and §8.

---

## 2. Scope of this review

### In scope

- The v1 data model as it ships today, namely:
  - Parent PIN hash + settings in `localStorage`
    (`lib/parent/local-store.ts`).
  - Classifier logs in IndexedDB (`lib/parent/log-store.ts`).
  - Server route handlers `/api/classifier`, `/api/answer`,
    `/api/socratic`, `/api/health` (`app/api/**`).
  - Server-side brute-force detection (`lib/server/brute-force.ts`,
    `lib/server/embeddings.ts`) introduced in VOL-190.
  - The service worker contract for `/api/*` (NetworkOnly, `app/sw.ts`).
- Claims the product currently makes about itself:
  privacy posture, local-first storage, no audio/microphone, no
  cross-device sync.
- The set of data classes that leave the parent device today, and where
  they go.
- The minimum conditions a minor-user pilot must satisfy before it can
  begin, and the prerequisites that VOL-195 (opt-in cloud sync) must
  meet.

### Out of scope

- A full legal opinion on PDPA, COPPA (US), UK Age-Appropriate Design
  Code, or any equivalent regime. Treat this document as engineering
  readiness, not as legal advice.
- Jurisdictional analysis beyond the PDPA / Singapore baseline and
  comparable principles-based regimes. A pilot in a different
  jurisdiction must layer its own legal review on top of this document.
- School / district MOUs, data processing agreements, and any contractual
  paperwork required by a pilot partner.
- Vendor selection for any future cloud-sync backend. §7 lists
  prerequisites, not vendors.
- Penetration testing, threat modelling against motivated attackers, and
  audit-grade certification.

---

## 3. Data inventory

Today's data classes, where they live, who can touch them, and whether
any of them is persisted server-side by kid-quest.

| Data class                                  | Source                                                | Storage location                                                       | Retention                                                                  | Who can access                                                              | Server-side?                                              |
| ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Parent PIN hash + per-device salt           | Parent setup flow (`PinSetup.tsx`)                    | `localStorage` key `kid-quest:parent:v1` → `pin: { saltHex, hashHex }` | Until parent clears site data or uninstalls the PWA                        | Whoever has physical access to the parent device                            | **No.** Never sent to the server. SHA-256(salt + pin) only. |
| Parent settings (topicLock, ageBand, studyTimeWindow) | Parent setup + Settings UI                            | `localStorage` key `kid-quest:parent:v1` → `settings`                  | Until parent edits or clears site data                                     | Same as PIN hash                                                            | Sent to the server only as request parameters per kid query (not stored). |
| Kid-typed query text                        | Kid surface input box                                 | In-memory on kid device → sent to `/api/classifier`, `/api/answer`, `/api/socratic` | Not retained by kid-quest server-side. Mirrored into the local classifier log on the parent device (see next row). | Kid (on device), parent (via local log), kid-quest server (transient, per-request), OpenAI (per API call) | **No persistence by us.** Travels over the wire to OpenAI via our route. OpenAI logging applies — see §4 Retention. |
| Classifier verdict + confidence             | OpenAI response → returned by `/api/classifier`       | Mirrored to IndexedDB `kid-quest-logs / classifier_logs` on parent device | Until parent clicks **Clear local logs** or clears site data               | Parent (via dashboard log viewer), kid client (transiently)                 | **No persistence by us.** Returned to the client, not stored. |
| Tutor / answer stream content (model output) | OpenAI streaming completion from `/api/answer` and `/api/socratic` | Transient — streamed token-by-token to the kid client. Not persisted anywhere by us. | Until the stream ends; UI text lives in component state only.              | Kid (on device), kid-quest server (transient pipe), OpenAI (per API call)   | **No persistence by us.**                                  |
| Brute-force embeddings (for re-ask detection) | OpenAI `text-embedding-3-small` invoked from `lib/server/brute-force.ts` | In-process memory on the Vercel function only; per-session window with a 30-minute sliding TTL | 30 minutes max; gone on function recycle; never written to disk by us       | The serverless function instance handling the session                       | **In-memory only.** No DB. No disk. Lost on cold start.   |
| Service-worker runtime cache                | Serwist runtime cache (`app/sw.ts`)                   | On parent / kid device only                                            | Per Serwist cache policy for app shell. `/api/*` pinned to `NetworkOnly`. | Device user                                                                 | Not server-side. `/api/*` responses are **not** cached.    |
| `/api/health` response                      | `app/api/health/route.ts`                             | Not stored. Returns `{ ok, hasOpenAiKey: boolean }`.                   | n/a                                                                        | Anyone who can hit the URL                                                  | No. Reports presence of the key, never the value.          |
| Vercel platform logs                        | Hosting platform — function invocations, request lines | Vercel's logging infrastructure                                        | Per Vercel's platform retention (out of our direct control)                | Vercel staff per their terms; project members of the kid-quest Vercel project | **Outside our codebase.** Honestly disclose: error paths can land in platform logs. See §5. |
| OpenAI API logs                             | OpenAI's platform — kid input text + topic lock + age band on the wire to model + embedding endpoints | OpenAI's logging infrastructure                                        | Per OpenAI's API data usage / retention policy (out of our direct control)  | OpenAI per their terms                                                      | **Outside our codebase.** Default API usage policy applies — see §4 Retention. |

The kid-quest server (the Vercel deployment) **stores none of the above
itself** in v1. The two third-party rows — Vercel platform logs and
OpenAI API logs — are not under our direct control but must be disclosed
to a pilot partner.

---

## 4. PDPA and child-safety assessment

The PDPA is principles-based: consent, purpose limitation, notification,
access and correction, accuracy, protection, retention limitation, and
transfer limitation. The questions below trace each principle against the
current build, and flag where a minor-user pilot must extend the product
before it can start.

### 4.1 Consent

- **Today:** the product is installed by parents acting as adult proxy
  testers. They consent for themselves. There is no kid-facing consent
  flow because there is no minor user on stage.
- **For a minor-user pilot:** PDPA-style consent for a minor's data
  requires **parental consent** by default. For older bands (e.g. 10-12)
  pilot designers should also obtain **kid assent** — a developmentally
  appropriate yes from the child — even though the legal authority sits
  with the parent.
  - Required UX additions:
    - A first-run **parental consent screen** that itemises:
      - That the kid's typed query text is sent off-device to OpenAI via
        our server route handlers.
      - That, when a critical re-ask is detected, an embedding of the
        kid's input is also sent to OpenAI for similarity comparison.
      - That topic lock and age band travel with each query.
      - That no microphone, camera, audio, or speech APIs are used.
      - That local classifier logs are stored on the parent device only
        in v1.
    - A clear "I am the parent / legal guardian" affirmation.
    - A clear "I have explained this to the child" affirmation for the
      7-9 and 10-12 bands.
    - A clear "Decline" path that does not enrol the minor.
  - The consent record itself can be local (per the v1 local-first
    posture) for the pilot, but the moment any cloud sync is enabled the
    consent record becomes a sync-eligible field with its own retention
    rule (see §7).

### 4.2 Notice

The PDPA's Notification Obligation requires that, at or before
collection, the individual be told what is collected, why, and what
happens to it. For minors, that notice must reach the parent in a form
they can actually read.

- **Today:** the product has no first-run kid-facing notice. The Privacy
  section in the README is engineer-facing.
- **For a minor-user pilot:** the parental consent screen above doubles
  as the Notification surface for the parent. The kid surface also needs
  a **short, kid-readable, age-band-appropriate notice on first use**
  that says, in one sentence:
  - What you type here goes to a computer that helps you learn.
  - It does not listen to your voice or see your camera.
  - Your parent can see what you ask later.
  See §9 follow-up: "Add on-screen first-run notice for parent" — the
  same surface should ship the kid-facing notice.

### 4.3 Purpose limitation

PDPA: data collected for a purpose must not be used for unrelated
purposes without fresh consent.

- **Today (must be documented in product copy):** kid query text is used
  for:
  1. Classification into `assistive`, `critical`, `off_topic`,
     `unsafe` (`/api/classifier`).
  2. Generating an assistive answer when the verdict is `assistive`
     (`/api/answer`).
  3. Generating a Socratic guiding question when the verdict is
     `critical` (`/api/socratic`).
  4. Brute-force re-ask detection on `critical` verdicts via OpenAI
     embeddings (`lib/server/brute-force.ts`).
- All four are tightly related to the stated product purpose ("a
  kid-facing learning app that classifies and helps with typed
  questions"). They satisfy purpose limitation today.
- **Any new use** — sending the data anywhere else, training a model on
  it, exposing it to a teacher dashboard, etc. — requires fresh consent
  and an update to the consent screen wording. The consent text must
  enumerate purposes 1–4 explicitly.

### 4.4 Retention

- **Local (parent device).** Classifier logs are kept indefinitely until
  the parent uses the **Clear local logs** button or clears site data /
  uninstalls the PWA. There is no automatic eviction in v1
  (`docs/parent-logs.md`). For a minor-user pilot this is acceptable as
  long as the consent screen names the policy ("logs live on this device
  until you clear them").
- **Server (kid-quest, v1).** Nothing is persisted server-side. Brute-force
  embeddings live in process memory for up to 30 minutes per session and
  are then evicted. There is no DB.
- **Third-party — OpenAI.** Kid input + embeddings travel to OpenAI's API
  endpoints. Retention is governed by OpenAI's then-current API data
  usage policy — see
  <https://openai.com/policies/api-data-usage-policies>
  and <https://openai.com/enterprise-privacy>. As of writing, OpenAI's
  standard API policy retains API inputs/outputs for a bounded abuse-
  monitoring window and does not use them to train models by default; an
  enterprise / Zero Data Retention arrangement removes that retention.
  Treat this as a moving target and re-verify at pilot start.
  - Follow-up: "Evaluate OpenAI Zero Retention / Enterprise terms" (§9).
- **Third-party — Vercel.** Platform logs (function invocations, request
  lines, error stacks) are retained per Vercel's then-current logging
  retention. Out of our direct control.

### 4.5 Deletion

- **Implemented.** Parent can clear all local classifier logs from the
  dashboard via the **Clear local logs** button
  (`docs/parent-logs.md`). Clearing site data / uninstalling the PWA
  drops both the localStorage blob and the IndexedDB store.
- **Not implemented (must add before a minor-user pilot):**
  - **Per-record delete** from the local log (the dashboard exposes
    bulk-clear only). See §9.
  - **Export** of local logs (parent has no way to take their data with
    them today). See §9.
  - **Server-side deletion API.** Not applicable until cloud sync exists.
    When VOL-195 lands, this becomes a hard requirement — see §7.

### 4.6 Access

- **Today.** Only the parent device has access. There is no admin
  backend, no server-side database, no support console, no way for a
  kid-quest operator to look at any specific parent's data because we
  do not have it. Local access on the device is gated by the parent PIN
  (`PinUnlock.tsx`).
- **For a minor-user pilot, today's posture is acceptable because nothing
  is server-side.** It does mean operators cannot help parents recover
  the PIN, restore logs, or troubleshoot a specific session.
- **Cloud sync (VOL-195) introduces an access model that does not exist
  today** — see §7. The design for that access model must precede any
  code, and it must default to "no admin read access to user data."

### 4.7 Operational expectations

- **Incident response.** Today there is no server-side PII to lose, so an
  "incident" is bounded to: (a) source code or env var leak, (b) Vercel
  platform compromise, (c) OpenAI account / key compromise. The
  documented response is: rotate the `OPENAI_API_KEY` via the Vercel
  dashboard (`docs/deployment.md` §7), redeploy, audit Vercel access.
  This is sufficient for the demo. **For a pilot**, an incident-response
  document must name a responsible person, a notification window, and a
  template parent-facing notification.
- **Support.** There is no support email address surfaced in the product
  today. For a minor-user pilot, parents must have a clear way to ask a
  question, report a problem, and request deletion. See §9 follow-up:
  "Support contact surface in parent dashboard".

---

## 5. Specific risks from the current build

These are concrete risks that exist in the build as it stands. Each
includes the disposition for today's posture and the action required
before a minor-user pilot.

1. **Kid query text leaving the device toward OpenAI.**
   - Disposition (today): explicit, documented, contractually bounded by
     OpenAI's API terms. Acceptable for adult proxy testers.
   - Action (pilot): the parental consent screen must name OpenAI by
     vendor; the kid-facing first-run notice must say "what you type goes
     to a computer that helps you learn" in age-band-appropriate
     language.

2. **Embedding of kid input sent to OpenAI for brute-force detection.**
   - Disposition (today): same trust boundary as the classifier path; no
     new permission surface (`docs/brute-force.md` §Privacy).
     Acceptable.
   - Pilot note: embeddings are not opaque — they encode the semantic
     content of the query. The consent screen and notice should not
     describe embeddings as "an anonymous hash"; they should be honest
     that the query content is what travels.

3. **Server-side session window for brute-force is in-memory but error
   paths could surface input text into Vercel platform logs.**
   - Disposition (today): the session map (`lib/server/brute-force.ts`)
     and the embedding cache (`lib/server/embeddings.ts`) are in-process
     only. The `/api/classifier` route swallows brute-force evaluation
     failures inside a `try { ... } catch { ... }` so they cannot poison
     the response — but the cause object itself is unused, which means
     the input text is not currently surfaced into logs through this
     path. Risk is low but defensive scrubbing in any future error path
     that does log is worth a small follow-up.
   - Action (pilot): add explicit error-path scrubbing in
     `lib/server/brute-force.ts` and `lib/server/embeddings.ts` so that
     any future `console.error(...)` call cannot include the raw kid
     input text. See §9 follow-up: "Brute-force window error-path
     scrubbing".

4. **Topic lock and age band sent to OpenAI.**
   - Disposition (today): low-risk, low-sensitivity metadata, but it is
     parent-set product configuration so it must be disclosed.
     Acceptable for today.
   - Pilot note: include in the consent screen enumeration ("topic lock
     and age band travel with each query").

5. **PIN cannot be recovered (no server backend).**
   - Disposition (today): correct — there is no recovery because there
     is no server-side identity. The current product copy in the PIN
     setup flow saying "no recovery" is acceptable for adult proxy
     testers, who know what they're signing up for.
   - Pilot note: for parents at scale, "no recovery" is likely to drive
     support load. A minor-user pilot should either (a) accept this and
     brief participating parents explicitly, or (b) add a recovery flow
     — which will require a server-side identity and therefore a fresh
     privacy review.

6. **`/api/health` returns `hasOpenAiKey: boolean`.**
   - Disposition (today): safe by design — only a boolean, never the
     value (`app/api/health/route.ts`). Documenting it here so it is not
     mis-flagged by a future reviewer.

7. **Service worker caches `/api/*` as NetworkOnly.**
   - Disposition (today): correct and load-bearing. Caching `/api/*`
     responses would store kid input and classifier verdicts on the
     device beyond the active session — extra storage, extra retention,
     extra deletion surface to manage. The current NetworkOnly
     policy keeps the local storage footprint to exactly the
     `localStorage` blob plus IndexedDB log store, both of which are
     parent-controllable. **Do not change this without revisiting this
     section.**

---

## 6. Stage-only adult tester posture (today's DEMO baseline)

This section names the baseline we are passing today and **why** it is
sufficient — so a future reader does not mistake "today's pass" for "the
product is generally cleared for minors."

The DEMO baseline is:

- **No minors are users.** The audience is product / engineering / design
  reviewers, who are themselves operating the device as adults.
- **No personal data is collected.** The parent PIN is a local
  authentication factor, not an identity; settings are product
  configuration; classifier logs reflect typed strings the adult tester
  themselves typed.
- **No cross-device sync.** Nothing leaves the device to a kid-quest
  database, because there is no kid-quest database. The only outbound
  traffic from a session is to OpenAI via our server route handlers,
  carrying the kid-typed text + topic lock + age band (and an embedding
  for brute-force re-ask detection).
- **No microphone, camera, or audio path.** Enforced by code
  (`scripts/verify-privacy.ts`) and at build time
  (`scripts/inspect-client-bundle.sh`).
- **OpenAI API key is server-only**, with a build-time bundle scan
  forbidding it in `.next/static/**` (`docs/privacy-audit.md`).
- **`/api/*` responses are not cached on the device.**
- **Parent can clear logs.** No external retention by us.

For a stage demo with adult proxy testers, the above is sufficient and
this review marks it **pass**. Any of the above changing (e.g. enabling
mic, enabling sync, adding analytics, adding a server-side store) flips
the answer to **must re-review**.

---

## 7. Cloud-sync prerequisites (the gate for VOL-195)

Opt-in cloud sync (VOL-195) is the next big change to the data-handling
posture. This section enumerates the design contracts that must be in
place **before any sync code merges**. It deliberately does not
prescribe a vendor; that is implementation.

### 7.1 Sync-eligible fields

Sync eligibility is decided per field, not "all-or-nothing for the
parent state blob."

| Field                              | Sync-eligible? | Conditions                                                                                                |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| Parent settings (topicLock, ageBand, studyTimeWindow) | Yes            | Plain parent opt-in (single toggle). No per-record consent required — this is parent's own configuration. |
| Parent PIN hash + salt             | Yes (optional) | Only if the parent explicitly enables multi-device login; defaults to off.                                |
| Classifier log rows                | Conditional    | Parent opt-in **plus per-record consent flag** at write time. Default OFF. Logs created before opt-in must not be backfilled.|
| Kid query text inside log rows     | Same as above  | Treat the `input` field as the most sensitive payload; if any log redaction is later added, it lives here.|
| Brute-force window state           | No             | Server-internal, ephemeral. Out of scope for sync.                                                        |
| `/api/health` payloads             | No             | Trivial; nothing to sync.                                                                                 |

### 7.2 Retention windows (server-side)

- Default classifier-log retention: **30 days**, parent-controlled.
- Parent may shorten (e.g. 7 days) or extend (up to a documented maximum,
  e.g. 180 days) via Settings.
- Parent settings rows: kept until the parent disables sync or deletes
  the account.
- Hard delete on retention expiry must be observable (i.e. a delete that
  the parent can verify happened, not a soft-delete flag).

### 7.3 Deletion API

- `DELETE /api/sync/logs/:id` — single-record delete by id.
- `DELETE /api/sync/logs` — bulk-clear all logs for the calling parent.
- `DELETE /api/sync/account` — full account wipe (settings + logs +
  consent record), with a documented completion window
  (recommendation: 30 days, named in the privacy notice).
- All three must be reachable from the parent dashboard UI, not just by
  hitting the API directly.

### 7.4 Export

- Parent can export their device's data as a portable file (JSON, single
  archive). Includes parent settings + the full local classifier log
  (and, if sync is on, what is currently on the server).
- Export must be a single click in the parent dashboard.
- The local-side export is a prerequisite even **before** sync —
  see §8 and §9.

### 7.5 Encryption at rest

- All synced records at rest in the chosen backend must be encrypted
  using a managed-key service appropriate to the backend (e.g. the
  backend's default KMS-backed encryption at rest).
- TLS in transit is non-negotiable end-to-end (no plaintext sync
  endpoints, ever).
- Consider per-parent envelope encryption as a longer-term hardening
  step. Not required for the v1 of sync; flag as a future hardening.

### 7.6 Audit logging on access

- Every read of a parent's records by an operator (admin tool, support
  console, anything that is not the parent themselves) must be logged
  with: actor, parent id, time, reason, and approval reference.
- The default posture is **operators cannot read user data**; any
  exception must require a documented justification.
- Audit logs themselves must be retained for at least 12 months and must
  not be deletable by the operator who generated them.

### 7.7 Acceptable backend posture

Any cloud-sync backend chosen for VOL-195 must support:

- Row-level security or equivalent server-side authorisation keyed on
  parent id, so one parent cannot read another's rows even if a query
  is malformed.
- A documented data residency story compatible with the pilot's
  jurisdiction.
- A managed encryption-at-rest story.
- A documented retention policy compatible with §7.2.
- Audit logging support compatible with §7.6.

This is a non-exhaustive list of properties. It does **not** prescribe a
specific vendor. Vendor selection is implementation work in VOL-195.

---

## 8. Go/no-go checklist for a real minor-user pilot

Use this as the pre-flight checklist before a sub-100-minor, single-site
pilot. Every item must be checked.

- [ ] Parental consent UX shipped, with notice explicitly covering the
      kid-typed text → OpenAI flow, the embedding → OpenAI flow, the
      topic lock + age band parameters, the local-log storage policy,
      and the absence of microphone/camera/audio paths.
- [ ] On-screen, age-band-appropriate notice on the kid surface at first
      run, in plain language.
- [ ] PIN-recovery decision made: either (a) a working recovery flow
      ships, OR (b) the pilot scope accepts no-recovery and the
      participating parents are briefed and documented as briefed.
- [ ] Local-log **clear** works (already shipped) AND local-log
      **export** works (not yet shipped — see §9).
- [ ] If sync is enabled for the pilot: per-feature opt-in toggle exists,
      per-record consent flag is honoured at write time, and the
      deletion + export contracts in §7 are met.
- [ ] OpenAI Zero Retention / Enterprise terms reviewed for the pilot's
      account (recommendation: enable Zero Retention for the pilot's API
      key if available).
- [ ] Support contact surfaced in the parent dashboard, with a named
      responder and a target response window.
- [ ] Incident-response plan documented: who is responsible, how an
      incident is declared, how parents are notified, by when.
- [ ] `npm run verify:privacy`, `npm run verify:network`, and
      `npm run verify:bundle` re-run against the deployed pilot build
      (not just `main`) and screenshots / logs filed.
- [ ] The Privacy section of the README is current, and this readiness
      doc is linked from it (see §10).

---

## 9. Follow-up engineering split into Linear

These are the engineering follow-ups identified by this review. They
should be filed as separate Linear tickets by whoever owns Phase 2
sequencing. They are not filed by this document.

1. **Add on-screen first-run notice for parent (Phase 2).**
   Ship a parent-facing first-run notice that names the OpenAI flow, the
   brute-force embedding flow, the topic-lock + age-band parameters, and
   the absence of mic/camera/audio. Doubles as the parental consent
   surface for any future minor-user pilot.

2. **Per-record delete + export API for local logs (Phase 2).**
   Extend `lib/parent/log-store.ts` with a `deleteLog(id)` and an export
   path that serialises the IndexedDB store into a downloadable JSON
   blob. Surface both in `ClassifierLogViewer.tsx`.

3. **Evaluate OpenAI Zero Retention / Enterprise terms (Phase 2).**
   Confirm whether the kid-quest OpenAI account can opt into Zero Data
   Retention, what the latency / cost implications are, and what
   enterprise-tier features (e.g. data residency, DPA) are needed for a
   minor-user pilot. Document the outcome alongside this readiness doc.

4. **Support contact surface in parent dashboard (Phase 2).**
   Add a visible support email / link in the parent dashboard, alongside
   the existing privacy + local-log controls. Define the responder and
   the target response window in the same change.

5. **Brute-force window error-path scrubbing (Phase 2).**
   Audit `lib/server/brute-force.ts` and `lib/server/embeddings.ts` for
   any path that could log raw kid input text via `console.error` /
   `console.warn` / thrown error messages, and add explicit redaction so
   the only thing reaching Vercel platform logs is opaque metadata
   (e.g. session id, length, hash).

(These five are documentation-only artefacts of this review. **Do not
file them from this PR**; the next planning pass picks them up.)

---

## 10. Cross-links

- `docs/privacy-audit.md` — the architectural privacy claims, where each
  is enforced in code, and the automated + manual verification flow.
- `docs/parent-logs.md` — the v1 classifier log schema, retention,
  failure behaviour, and the forward-compatibility note for VOL-195
  sync.
- `docs/brute-force.md` — Phase 1 (client) and Phase 2 (server,
  embeddings) brute-force detection, including the explicit privacy
  note that brute-force lives behind the same OpenAI trust boundary.
- `docs/deployment.md` — Vercel deployment runbook, env-var hygiene,
  fail-closed behaviour, and the "no analytics, no telemetry, no
  third-party crash reporters" rule.
- `docs/capacitor-evaluation.md` — why we stay PWA-only for now, and
  the explicit posture that any Capacitor wrapper must keep the
  permission surface narrow (no mic / camera / speech / filesystem /
  location plugins).
- `docs/demo-mode.md` — note: this document is the artefact of VOL-186
  (fixture mode + demo override), which is still in flight in a
  concurrent worktree as of this review. When it lands, link from here
  as the canonical reference for the "no live LLM" demo posture; until
  then this is a known-pending cross-link.
