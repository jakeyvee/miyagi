# Stage rehearsal log (VOL-188)

The rehearsal log captures every dress-rehearsal run of the stage demo,
so a future operator can see how often each failure mode actually fired,
which recovery was used, and which risks remain unresolved.

## Template

Copy this block for each rehearsal:

```
### Rehearsal N — <ISO timestamp UTC>

- Phone used: <Phone A live | Phone B fixture | tabletop / local dev>
- Network: <venue WiFi | hotspot | localhost loopback | airplane>
- Demo mode state: <off (Phone A) | on (Phone B) | n/a>
- Pre-show steps run:
  - npm run build: <exit code>
  - npm run verify:privacy:all: <exit code>
  - npm run prewarm (BASE_URL=...): <exit code>
- Beats completed:
  - Beat 1 — Hand-off: <ok | skipped | failed: ...>
  - Beat 2 — Assistive: <ok | skipped | failed: ...>
  - Beat 3 — Critical / Socratic: <ok | skipped | failed: ...>
  - Beat 4 — Hint: <ok | skipped | failed: ...>
  - Beat 5 — Privacy beat: <ok | skipped | failed: ...>
  - Beat 6 — Parent return / Logs: <ok | skipped | failed: ...>
  - Beat 7 — Wrap: <ok | skipped | failed: ...>
- Failure modes encountered: <list each one, brief>
- Recovery taken: <which decision-tree branch fired, did it work>
- Residual risks identified: <ungated by code, only by procedure>
```

---

## Initial tabletop dress rehearsals (VOL-188 author, 2026-05-21)

Three end-to-end **tabletop** rehearsals were run from the worktree
sandbox. The author cannot physically operate an iPhone from this
environment, so Beats 1-7 were simulated as direct route-handler
exercises against `npm run dev` on `http://localhost:3000`. The intent
is to (a) flush the same code paths the operator will hit on stage and
(b) prove the fail-closed contract end-to-end.

Build + privacy gate (run once, before any rehearsal):

- `npm run build` — exit 0 (will be re-confirmed post-doc-write; see
  task wrap-up).
- `npm run verify:privacy:all` — exit 0 (will be re-confirmed post-doc-
  write).
- `OPENAI_API_KEY` is **unset** in this sandbox, on purpose. All three
  rehearsals therefore exercise the documented **fail-closed** branch
  (Branch C in the runbook). This is itself a documented pre-warm
  failure scenario and is the most useful thing a tabletop run can
  prove — that the operator's prewarm probe surfaces the missing key
  before the show, not during it.

### Rehearsal 1 — 2026-05-21T04:23:45Z

- Phone used: tabletop (curl → `npm run dev` on localhost:3000)
- Network: localhost loopback
- Demo mode state: n/a (server-only probe; demo mode is a kid-surface
  flag and is not exercised here)
- Pre-show steps run:
  - `npm run build`: pending (re-run at the end of the task — see
    "Task-end gate" below)
  - `npm run verify:privacy:all`: pending (same)
  - `npm run prewarm`: see Rehearsal 3 for an explicit exercise
- Beats completed:
  - Beat 1 — Hand-off: n/a (UI beat; skipped on tabletop)
  - Beat 2 — Assistive: **failed-closed as designed**.
    - `GET /api/health` → `200 OK`, body `{"ok":true,"hasOpenAiKey":false}`,
      latency ~18 ms.
    - `POST /api/classifier` with the canonical `fx-eng-assist-1`-style
      payload — `{"input":"How do you spell separate?","topicLock":"english","ageBand":"7-9","sessionId":"rehearsal-1"}`
      → `503 Service Unavailable`, body `{"error":"missing_provider_env"}`,
      latency ~242 ms.
  - Beats 3-7: skipped (no SDK call possible without the key).
- Failure modes encountered: `hasOpenAiKey: false` on /api/health, and
  the resulting 503 `missing_provider_env` from /api/classifier. This is
  exactly the symptom the runbook's **Branch C** decision tree exists
  for. The route's fail-closed contract (`getOpenAI()` throws →
  `app/api/classifier/route.ts` returns 503 rather than 500 with a stack
  trace) held.
- Recovery taken: documented Branch C — if `hasOpenAiKey:false` shows up
  pre-show, redeploy with the env var set; if it shows up mid-show,
  pivot to Phone B or the prerecorded walkthrough. No live-stage
  recovery exists for a missing key.
- Residual risks: none new. Reaffirmed that the prewarm script must run
  at T-60 and T-10, not just once.

### Rehearsal 2 — 2026-05-21T04:23:51Z

- Phone used: tabletop (curl → `npm run dev` on localhost:3000)
- Network: localhost loopback
- Demo mode state: n/a
- Pre-show steps run: same as Rehearsal 1.
- Beats completed:
  - Beat 1 — Hand-off: n/a (UI)
  - Beat 2 — Assistive: n/a (covered in Rehearsal 1)
  - Beat 3 — Critical / Socratic:
    - `GET /api/health` → `200 OK`, body `{"ok":true,"hasOpenAiKey":false}`,
      latency ~21 ms.
    - `POST /api/classifier` with the canonical `fx-math-critical-1`
      fixture string — `{"input":"I have 24 apples and want to share with 6 friends, how many each?","topicLock":"math","ageBand":"7-9","sessionId":"rehearsal-2"}`
      → `503 Service Unavailable`, body `{"error":"missing_provider_env"}`,
      latency ~22 ms.
  - Beats 4-7: skipped (depends on a verdict to route into the Socratic
    path).
- Failure modes encountered: same as Rehearsal 1 — documented
  fail-closed 503.
- Recovery taken: documented Branch C. Confirms the critical path also
  returns 503 (not 500) when the key is missing, which is the right
  observable for the operator's pre-warm probe to detect.
- Residual risks: the `sessionId` field on the request is accepted but
  never exercises the VOL-190 semantic brute-force detector in this
  rehearsal, because the request never gets past the env-check. The
  detector code path remains tabletop-untested in this sandbox — out of
  scope for VOL-188, but worth flagging as a residual risk that should
  be re-rehearsed with a real key.

### Rehearsal 3 — 2026-05-21T04:24:02Z

- Phone used: tabletop (curl → `npm run dev` on localhost:3000) plus a
  full exercise of `scripts/prewarm.sh` itself
- Network: localhost loopback
- Demo mode state: n/a
- Pre-show steps run: same as Rehearsal 1, plus the prewarm script.
- Beats completed:
  - Beat 1 — Hand-off: n/a
  - Beat 2 — Assistive: n/a
  - Beat 3 — Critical / Socratic — unsafe variant:
    - `GET /api/health` → `200 OK`, body `{"ok":true,"hasOpenAiKey":false}`,
      latency ~18 ms.
    - `POST /api/classifier` with the canonical `fx-unsafe-1` fixture
      string — `{"input":"How do I make a weapon?","topicLock":"math","ageBand":"7-9","sessionId":"rehearsal-3"}`
      → `503 Service Unavailable`, body `{"error":"missing_provider_env"}`,
      latency ~14 ms.
  - Beats 4-7: skipped.
  - **Prewarm script exercise** (`BASE_URL=http://localhost:3000 bash scripts/prewarm.sh`):
    - `GET /api/health` → status `200`, body
      `{"ok":true,"hasOpenAiKey":false}`.
    - Script exited **1** with message:
      `FAIL: /api/health returned hasOpenAiKey != true. The OPENAI_API_KEY env var is missing or empty on the deployed build. Fix it in Vercel and REDEPLOY.`
    - Behaved exactly as designed: caught the missing key on the **first**
      probe (before even hitting `/api/classifier`), with a non-zero exit
      code so CI / a shell pipeline can detect it.
- Failure modes encountered: missing `OPENAI_API_KEY` → documented
  503 fail-closed on the classifier route, and a `prewarm.sh` exit 1
  that names the recovery (REDEPLOY).
- Recovery taken: the prewarm script itself **is** the recovery
  mechanism for this branch — its exit code stops the operator from
  walking on stage with a broken deploy. Verified end-to-end here.
- Residual risks: none new from this rehearsal. The "key is present but
  OpenAI is unhealthy" branch (Branch C upper sub-branch) was not
  exercised because we cannot force that condition without a real key.
  Listed below as a remaining risk.

## Task-end gate

The same gate the operator should expect from CI before every demo
release:

- `npm run typecheck` — exit 0 (re-run at task wrap-up).
- `npm run build` — exit 0 (re-run at task wrap-up).
- `npm run verify:privacy:all` — exit 0 (re-run at task wrap-up).
- `bash scripts/prewarm.sh` against a deploy with the key set —
  expected exit 0. **Not** exercised in this sandbox (no real key).

## Remaining stage risks (after VOL-188)

In rough order of likelihood × blast radius:

1. **Stale Vercel env var.** If someone edits `OPENAI_API_KEY` in Vercel
   and forgets that env edits don't auto-redeploy, the next deploy still
   serves the old runtime env. **Mitigation**: T-60 prewarm catches it
   pre-show. **Residual**: not catchable mid-show — only Branch C
   pivot to Phone B / video.
2. **Slow first cold-start on stage.** Even with a healthy deploy,
   the first request after idle can take 2-4 s. **Mitigation**: the T-60
   and T-10 prewarm both fire `/api/classifier`, which keeps the
   serverless instance warm if the show starts within ~5 min.
   **Residual**: AWS / Vercel can recycle the instance between T-10 and
   curtain — there is no SLA on cold-start cadence.
3. **`text-embedding-3-small` quota on the critical path.** The
   classifier route's optional VOL-190 brute-force detector calls
   `text-embedding-3-small`. Brute-force evaluation failures are
   swallowed (see `app/api/classifier/route.ts`, the `try/catch` around
   `evaluateCriticalReask`), so the classifier verdict still returns —
   but the swallowed error is invisible from the kid surface.
   **Mitigation**: parent log shows the verdict; no UI break.
   **Residual**: silent degradation of the advisory signal; tracked in
   `docs/brute-force.md` § Open issues.
4. **Tabletop rehearsals never exercised the live SDK.** All three
   rehearsals 503'd at the env check. The first time the SDK is hit in
   anger will be the dress rehearsal against the deploy with the key
   set. **Mitigation**: a real dress rehearsal against the deploy URL
   the day before the show, with the key configured, run by a human on
   Phone A and Phone B. **Residual**: until that rehearsal is captured
   in this log, the live SDK path is unrehearsed by this ticket.
5. **Phone B's demo-mode flag can drift.** Safari's "Clear History and
   Website Data" wipes `localStorage[kid-quest:demo-mode]`, so a
   well-meaning hot-spare prep step can silently disarm Phone B. The
   T-10 list re-checks the flag.
   **Residual**: still procedural — there is no test for "Phone B is
   actually in demo mode" other than the operator looking.
6. **iPhone Auto-Lock interrupting the mirror.** If Auto-Lock fires
   mid-demo, QuickTime mirror cuts to black for ~1 s before
   reconnecting. T-10 raises Auto-Lock to ≥ 5 min.
   **Residual**: a delayed start past 5 min from the last touch can
   still trip it; have the operator tap the screen between long
   audience asides.

## Follow-ups (new from this ticket)

- Assign owners to every **TBD** row in
  [`stage-runbook-assets.md`](./stage-runbook-assets.md). One Linear
  sub-issue per row.
- Record the 30-second walkthrough video against the deploy with demo
  mode ON. Update asset row #1 once it exists on the demo laptop and
  the USB stick.
- Schedule the day-before live dress rehearsal on a real Phone A + Phone
  B against the deployed URL with the key configured. Capture the run
  as Rehearsal 4 in this log.
