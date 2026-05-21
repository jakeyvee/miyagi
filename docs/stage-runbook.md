# Stage demo runbook (VOL-188)

This is the canonical runbook for the live kid-quest stage demo. The
operator's job during the show is to follow the numbered beats below.
Everything in this doc has been rehearsed (see
[`rehearsal-log.md`](./rehearsal-log.md)) and every failure mode listed
here has a documented recovery.

## One-line goal

Complete the parent-to-kid flow plus one full Socratic exchange on a real
iPhone, and **fail closed** if anything wobbles — swap to the hot spare or
cut to the prerecorded walkthrough rather than show broken UI or, worse,
leak a wrong answer.

---

## Pre-show setup (T-60 min)

Run through this list ~60 minutes before doors. Anything that can be
pre-done is pre-done so the T-10 list is short.

- [ ] **Vercel deploy is green.** Open the project's Deployments tab and
      confirm the most recent production build is marked **Current** with
      a green check. Cross-check against
      [`docs/deployment.md`](./deployment.md) for redeploy / promote
      mechanics if it isn't.
- [ ] **Phone A (primary) — physical prep.**
  - [ ] On venue WiFi (or backup hotspot — see
        [`stage-runbook-assets.md`](./stage-runbook-assets.md)). Open the
        deploy URL in Safari once to confirm reachable.
  - [ ] Battery ≥ 80%. Disable Low Power Mode (it throttles JS).
  - [ ] Airplane mode **off**. WiFi **on**. Bluetooth **off** (keeps
        AirPods from auto-connecting mid-demo).
  - [ ] Do Not Disturb / Focus **on** (no notifications on the projector).
  - [ ] Auto-brightness **off**, brightness pinned at venue level.
  - [ ] Auto-lock raised to ≥ 5 min (Settings → Display & Brightness).
  - [ ] Install the PWA from Safari per
        [`docs/pwa-install.md`](./pwa-install.md) (Share → Add to Home
        Screen). Launch from the home-screen icon and confirm
        **standalone mode** — no Safari address bar visible.
- [ ] **Phone B (hot spare) — identical install.**
  - [ ] Same iOS major version as Phone A. PWA installed via the same
        steps.
  - [ ] A known-good parent PIN already saved on Phone B
        (write it on a sticky inside the case so the operator can recover
        without fumbling on stage).
  - [ ] `topicLock`, `ageBand`, and `studyTimeWindow` pre-populated to
        match the demo persona on Phone A.
  - [ ] **Demo mode = ON on Phone B.** Parent → Settings → bottom-of-page
        **Demo mode** link → checkbox checked (see
        [`docs/demo-mode.md`](./demo-mode.md)). Phone B is the fixture-
        replay safety net; it must never block on a live API call.
- [ ] **QuickTime iPhone mirror.**
  - [ ] Connect Phone A to the demo laptop via USB-C / Lightning.
  - [ ] Open **QuickTime Player → File → New Movie Recording**.
  - [ ] Click the arrow next to the record button. Set:
        - **Camera**: the phone (e.g. "Operator's iPhone")
        - **Microphone**: **None** — privacy posture: never capture audio
          during a kid-quest demo, even ambient.
        - **Quality**: High.
  - [ ] Confirm the projector shows the phone's screen mirror. **Do not**
        hit record unless the team has agreed to keep the recording
        internal — the demo is live, not promotional footage.
- [ ] **Pre-warm the deployed build.**
  - [ ] From a laptop terminal, run `BASE_URL=https://<deploy-url> npm run prewarm`
        (wraps `scripts/prewarm.sh`). It expects:
        - `GET /api/health` → `{"ok":true,"hasOpenAiKey":true}`
        - `POST /api/classifier` (tiny payload) → HTTP 2xx
  - [ ] If you can't run a shell, hit `https://<deploy-url>/api/health`
        in Safari on Phone A (note: Safari, **not** the PWA — the PWA
        won't render the JSON body). Confirm `hasOpenAiKey: true`.
  - [ ] If the prewarm script reports a 503 `missing_provider_env`,
        **stop**. The `OPENAI_API_KEY` env var is missing or the deploy
        is stale. Pivot to the recovery decision tree below before doing
        anything else.
- [ ] **Privacy gate on `main`.**
  - [ ] Run `npm run verify:privacy:all` on the latest `main` locally,
        OR confirm the CI run for the most recent commit on `main` is
        green. This is the final guard that no microphone API, no
        `NEXT_PUBLIC_*OPENAI*`, and no `sk-...` literal slipped into the
        deployed bundle.

## Pre-show setup (T-10 min)

Short list. Everything below should take less than five minutes if T-60
went smoothly.

- [ ] **Phone A — clean state.**
  - [ ] Parent → unlock with PIN → Logs tab → **Clear local logs** (two
        taps to confirm). OR start with a fresh tester profile by
        clearing site data on Phone A (Safari → Settings → Clear History
        and Website Data → re-install PWA).
- [ ] **Phone A — parent settings.**
  - [ ] Set a fresh parent PIN. Write it on a sticky for the operator.
  - [ ] `topicLock = math` (or whatever persona the demo opens with).
  - [ ] `ageBand = 7-9`.
  - [ ] `studyTimeWindow` brackets the demo time. Default: `now - 15min`
        to `now + 45min`. The kid gate only opens inside the window — a
        too-tight window kills the demo silently.
- [ ] **Demo-mode posture.**
  - [ ] Phone A: **demo mode OFF**. Live classifier is the story.
  - [ ] Phone B: **demo mode ON**. Already done at T-60; just re-confirm
        the checkbox is still checked (a Safari "Clear History" wipes
        the flag).
- [ ] **Final reachability ping.**
  - [ ] On the laptop, re-run `npm run prewarm` against the deploy URL.
        A clean exit-0 is the green light to start.

---

## Stage runbook (during demo)

Nine beats. Each beat lists the **action**, what the **audience sees**,
the **failure mode** that could bite, and the documented **recovery**.

### Beat 1 — Hand-off (parent → kid)

- **Action.** On Phone A (in standalone PWA), open `/parent`, unlock with
  the PIN, confirm settings on the Settings tab, then tap **Hand to kid**.
- **Audience sees.** Parent screen fades, kid screen renders the tree at
  whatever stage the prior session left it (seed if cleared, sprout
  otherwise). Tree slot is the focal element.
- **Failure mode.** Study-window gate refuses the hand-off ("come back
  during study time"). Means the window in settings doesn't cover now.
- **Recovery.** Quickly go back to Settings, widen the window, hand off
  again. < 15 s if the operator stays calm.

### Beat 2 — Assistive demo (Beat A)

- **Action.** Kid types an assistive query — use the canonical
  `fx-eng-assist-1` fixture string: `"What is a synonym for happy?"`.
  Submit.
- **Audience sees.** Verdict chip below the tree shows
  `● assistive · ~94% conf` (green dot — live verdict). Answer streams
  token-by-token. Tree advances one stage (sprout → sapling, etc.).
- **Failure mode.** Live classifier is slow (> 5s). Outside demo mode
  there is no fixture timeout fallback on Phone A — the kid sees a
  neutral retry message.
- **Recovery.** If it stalls, swap to Phone B (demo mode ON: the same
  submission resolves to a fixture in < 1 s). See recovery tree below.

### Beat 3 — Critical / Socratic demo (Beat B)

- **Action.** Kid types a critical math word problem. Canonical fixture:
  `fx-math-critical-1` — `"I have 24 apples and want to share them with
  6 friends, how many each?"`. Submit.
- **Audience sees.** Verdict chip shows `● critical · ~91% conf`. The
  tutor's first **question** streams (it must read as a question, not an
  answer — that's the whole pedagogy point). Kid types a thoughtful
  reply ("six people, including me"). Tutor's second turn streams.
  Repeat once more. After three tutor turns the **Want a hint?** button
  appears in the panel.
- **Failure mode.** The model gives the answer directly instead of asking
  a question (regression in the Socratic prompt). The tree-state machine
  will still advance, but the pedagogy is broken on stage.
- **Recovery.** If a single turn misroutes: continue (audience won't
  catch it). If two in a row misroute: three-finger long-press on the
  tree (demo-mode only — Phone A doesn't have this so reach for Phone B).
  Operator should rehearse the gesture once before the show.

### Beat 4 — Hint path

- **Action.** After three tutor turns appear on Phone A, the kid taps
  **Want a hint?**.
- **Audience sees.** A neutral, one-sentence hint streams in. The tree
  stays put (no growth, no wilt — hints are explicitly neutral on the
  tree state machine).
- **Failure mode.** Hint button doesn't render → tutor turn count never
  hit `SOCRATIC_TURN_CAP`. Look at Phone A's screen: count tutor bubbles.
  If only two, do one more kid reply.
- **Recovery.** If the hint button still doesn't appear after three
  confirmed tutor turns, swap to Phone B and replay the fixture from
  Beat 3 there.

### Beat 5 — Privacy beat (the load-bearing one)

- **Action.** Pause and narrate. While paused, the operator either (a)
  has the laptop QA confirm in advance (preferred) or (b) opens Safari →
  Settings → Camera & Microphone for the deploy domain and confirms the
  permission has **never been requested** during the demo.
- **Audience sees.** Operator points at the verdict chip (still visible
  on screen from Beat 3) — the chip is the **anti-theatre signal**: the
  audience can read the verdict the model returned, so the demo isn't
  just smoke and stream tokens.
- **Failure mode.** A mic / camera permission prompt would be a
  demo-blocker — would also mean a regression has shipped. Pre-show
  privacy gate (T-60 step: `verify:privacy:all` on `main`) is the
  guard that prevents this from happening live.
- **Recovery.** If a mic prompt ever shows mid-demo: dismiss it, then
  switch to the prerecorded walkthrough (see assets doc). Do not
  continue live. File a P0 against the repo immediately after the show.

### Beat 6 — Parent return (Logs tab)

- **Action.** On Phone A, navigate back to `/parent`, re-unlock with the
  PIN, switch from Settings to **Logs**.
- **Audience sees.** A reverse-chronological list of the kid's
  submissions from this session, each with a colored verdict chip and
  confidence value. Two assistives and three criticals from the beats
  above should all be present.
- **Failure mode.** Logs list is empty → the
  `lib/parent/log-bridge.ts` subscription didn't fire, or IndexedDB was
  denied (Private Browsing mode etc.).
- **Recovery.** Don't dwell. Verbally narrate the design: "These rows
  live in IndexedDB on this device only — `kid-quest-logs`. They never
  ship to a server in v1." (See [`docs/parent-logs.md`](./parent-logs.md)
  for the full schema.)

### Beat 7 — Wrap

- **Action.** Close the kid surface, leave Phone A on the parent Logs
  tab. Operator restates the privacy claim (script below).
- **Audience sees.** A still frame of the parent log + the spoken
  paragraph. That's the closing image stakeholders should walk away with.

---

## Failure recovery (decision tree)

A short, explicit decision tree the operator can read at a glance. Each
branch lists the symptom, the call, and the expected recovery time.

### Branch A — Live classifier is slow on Phone A (> 5s response)

- **In demo mode:** nothing to do. The 5-second timeout in
  `lib/kid/timeout.ts` fires silently and the fixture cursor advances
  (see [`docs/demo-mode.md`](./demo-mode.md) → "5-second timeout
  fallback"). The verdict chip flips its dot from grey/green to amber so
  the operator knows a fixture took over, but the audience just sees the
  next exchange.
- **Outside demo mode (Phone A's posture):** there is no automatic
  fallback. Hand the demo over to Phone B (hot spare, demo mode ON).
  Verbally bridge: "Let me grab the other phone — same session, same
  parent settings." Expect < 30 s total swap.

### Branch B — A verdict misroutes (assistive returns critical, or vice versa)

- **Operator gesture:** three-finger long-press on the tree slot (or a
  single long-press ≥ 800 ms — either works). This advances the fixture
  cursor and replays the next canned exchange as if the kid had typed
  `fixture.input`. **Visible only when demo mode is ON** — that's why
  Phone B carries the gesture and Phone A doesn't.
- If you're on Phone A and need the gesture: hand to Phone B first, then
  use the gesture there.

### Branch C — `/api/classifier` returns 5xx on the deployed build

- **First check:** `curl https://<deploy-url>/api/health`.
  - `{"ok":true,"hasOpenAiKey":true}` → the SDK call itself failed
    upstream (OpenAI is having a bad day). Pivot to Phone B (demo mode
    fixtures don't need the network) or to the prerecorded walkthrough.
  - `{"ok":true,"hasOpenAiKey":false}` → the env var is wiped or the
    deploy is stale. **Redeploy** in Vercel (env-var edits do not
    auto-redeploy — see `docs/deployment.md` § 6). If the show is in
    < 5 min, pivot to Phone B or the prerecorded walkthrough; redeploy
    after the show.

### Branch D — Everything is broken

- Cut to the **30-second prerecorded walkthrough video** (see
  [`stage-runbook-assets.md`](./stage-runbook-assets.md) for owner and
  format). Narrate over it. Apologize once, briefly. The walkthrough
  ends on the parent log frame so the spoken privacy paragraph still
  lands.

---

## Privacy claim restatement (script)

Read this paragraph aloud at Beat 7, verbatim. It mirrors the verified
architecture in [`docs/privacy-audit.md`](./privacy-audit.md) and the
manual checks in section A of that doc — do not paraphrase or extend.

> "Kid-quest takes typed text only. There is no microphone, no audio
> recording, no speech recognition — and there never will be. The
> OpenAI key lives on the server. The parent's PIN and settings live on
> this phone in localStorage. The classifier log lives on this phone in
> IndexedDB. Nothing about this session left the device except the kid's
> typed question to our server, and the verdict that came back. Local
> first, on purpose."

Keep it under 25 seconds. Practice it. Don't read from notes on stage —
have it memorized.
