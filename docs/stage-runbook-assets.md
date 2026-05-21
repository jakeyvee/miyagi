# Stage runbook — failover assets (VOL-188)

Every line below is a thing that needs to exist, in a known location,
with a named owner, before doors open. Owners marked **TBD** must be
assigned as a Linear follow-up before the show (one ticket per row is
fine — keep them small).

This list complements [`stage-runbook.md`](./stage-runbook.md). If the
runbook references "the hot spare" or "the prerecorded walkthrough",
this is the inventory that says where they are and who's holding them.

## Inventory

| # | Asset | Spec / requirement | Owner | Done? |
| - | ----- | ------------------ | ----- | ----- |
| 1 | **30-second prerecorded walkthrough video** | MP4, 1080×1920 portrait, ≤ 30 s. Recorded against the **deployed** demo build with **demo mode ON** so the fixture stream is canonical. Ends on the parent Logs tab (matches Beat 7's closing frame). Saved on the demo laptop's desktop AND on a USB stick in the operator's case. | TBD | [ ] |
| 2 | **Phone B (hot spare iPhone)** | Same iOS major version as Phone A. kid-quest PWA pre-installed via Safari Share → Add to Home Screen (see `pwa-install.md`). Parent PIN, `topicLock`, `ageBand`, and `studyTimeWindow` pre-populated. **Demo mode ON** (Parent → Settings → Demo mode checkbox). Battery ≥ 80%, Low Power Mode off. | TBD | [ ] |
| 3 | **Laptop + QuickTime mirroring cable** | USB-C to Lightning (or USB-C to USB-C) cable that is known to work for iPhone mirror. Backup cable in the same bag. Adapter (USB-C → USB-A) for older laptops. QuickTime mic input set to **None** (privacy posture). | TBD | [ ] |
| 4 | **Backup hotspot** | Phone or dedicated hotspot with its own data plan. SSID + password written on a sticky inside the operator's case. Tested at the venue ≥ 24 h before the show. | TBD | [ ] |
| 5 | **Printed runbook (one A4 page)** | Bullet form, no nested lists. Single sheet, landscape, large type. Folded inside the operator's case. Source is the fenced block below — print verbatim. | TBD | [ ] |
| 6 | **Operator's parent PIN sticky** | The PIN set during T-10 setup, written on a sticky inside the Phone A case. The PIN itself is never spoken on stage. | TBD | [ ] |
| 7 | **Spare USB stick (FAT32)** | Carries a duplicate of the prerecorded walkthrough video and a PDF of the printed runbook. | TBD | [ ] |
| 8 | **Charger + power bank** | One Lightning / USB-C charger per phone. One 10 000 mAh+ power bank for the operator's pocket. | TBD | [ ] |

## Owner-assignment follow-up

Every **TBD** row above needs a named owner before the show. The simplest
flow: create one Linear sub-issue under VOL-188 per row, assign, and
check the Done? column once the asset is in the operator's hands.

## Printable one-page operator runbook

Print this as **one A4 landscape page**, large type, no margins narrower
than 1 cm. Verbatim — do not editorialize.

```
============================================================
KID-QUEST — STAGE OPERATOR RUNBOOK (one page)
============================================================

T-60
- Vercel deploy GREEN
- Phone A: WiFi, charge >=80%, DND on, PWA installed
- Phone B (hot spare): demo mode ON, PIN saved
- QuickTime mirror: mic = NONE
- Run: BASE_URL=<deploy-url> npm run prewarm  -> exit 0
- npm run verify:privacy:all on main: PASS

T-10
- Phone A: Clear local logs (Logs tab)
- Set fresh PIN; topicLock=math; ageBand=7-9
- studyTimeWindow brackets now (e.g. now-15m..now+45m)
- Demo mode: OFF on Phone A, ON on Phone B
- Re-run prewarm. exit 0 = go.

DURING (9 beats)
1. Hand-off: parent unlock -> Hand to kid. Tree renders.
2. Assistive: type "What is a synonym for happy?"
   Expect: green chip, ~94%, answer streams, tree grows.
3. Critical: type the apples-and-friends fixture.
   Expect: green chip, ~91%, tutor asks (not answers).
   Reply twice; "Want a hint?" appears after 3 tutor turns.
4. Hint: tap it. Neutral hint streams. Tree stays put.
5. Privacy beat: point at the verdict chip.
   No mic prompt has ever fired.
6. Parent return: back to /parent, unlock, Logs tab.
   Read out: "IndexedDB on this device only."
7. Wrap: recite the privacy paragraph (memorized).
   8. (held) hot-spare gesture: 3-finger or 800ms press
      on the tree (demo mode ONLY -> use Phone B).
   9. (held) cut-to-video: 30s prerecorded walkthrough
      lives on Desktop AND USB stick.

FAILURE CALLS (decision tree)
A. Slow classifier on Phone A
   - Demo mode: timeout fires silently, fixture takes over.
   - Live: swap to Phone B. Bridge: "let me grab the other
     phone, same session."
B. Wrong verdict
   - Three-finger long-press on tree (demo mode ONLY).
   - On Phone A: hand to Phone B first, gesture there.
C. /api/classifier 5xx
   - curl /api/health.
   - hasOpenAiKey:true  -> upstream issue, use Phone B
     or the prerecorded video.
   - hasOpenAiKey:false -> env wiped or stale deploy.
     Redeploy AFTER the show; for now, Phone B or video.
D. Everything broken
   - Cut to 30s prerecorded walkthrough. Narrate over.

PRIVACY PARAGRAPH (Beat 7, verbatim)
"Kid-quest takes typed text only. There is no microphone,
no audio recording, no speech recognition - and there
never will be. The OpenAI key lives on the server. The
parent's PIN and settings live on this phone in
localStorage. The classifier log lives on this phone in
IndexedDB. Nothing about this session left the device
except the kid's typed question to our server, and the
verdict that came back. Local first, on purpose."

============================================================
```
