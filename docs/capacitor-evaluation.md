# Capacitor wrapper evaluation (kid-quest)

Phase 2 hardening decision note. Written after the PWA path (manifest +
Serwist service worker + iOS install runbook, VOL-182) is stable on `main`.

The question on the table: do we wrap the Next.js app in [Capacitor](https://capacitorjs.com/)
to ship a native iOS/Android container, or do we stay PWA-only?

## 1. TL;DR recommendation

**No-go for now. Stay PWA-only through v1 and the stage demo.** The current
Serwist + Add-to-Home-Screen path already gives us standalone launch, an icon,
offline shell, and a fresh `/api/*` round-trip on every classifier call —
which is the entire demo loop. A Capacitor wrapper would expand the native
permission surface (the exact thing we have promised to keep narrow:
typed-only, no microphone, no camera, no audio APIs), force us to either give
up Next.js server components and route handlers or run the wrapper as a
thin shell pointing at the Vercel deployment, and add a release pipeline
(Xcode signing, TestFlight, Play Console) that does not exist today. The
recommendation flips to "spike a thin-shell PoC" only if one of the
[triggers in section 6](#6-triggers-to-revisit) actually fires — concretely:
a partner school requests App Store distribution, or rehearsals show iOS
Add-to-Home-Screen success rate below ~80% on first-time users.

## 2. Decision drivers

What would actually move the needle for kid-quest, and how each driver
scores today.

### Distribution: TestFlight / App Store vs Add-to-Home-Screen

- **Today (PWA):** the parent navigates to the Vercel URL in Safari,
  Share → Add to Home Screen. No store account, no review, no signing keys.
  See `docs/pwa-install.md` for the runbook.
- **Capacitor wrapper:** unlocks TestFlight links and eventually App Store /
  Play Store listings. This matters if and only if a distribution channel
  (a school, a district, a partner) explicitly requires a store listing.
  Today, nobody has asked. The stage demo audience installs from a URL on
  a hot-spare iPhone we control.
- **Verdict:** PWA wins on the current demo target. Wrapper wins the day
  someone asks for an App Store link.

### Device behavior: standalone, splash, status bar, swipe-to-refresh, kid-proofing

- **Standalone launch:** already solved by `display: "standalone"` in the
  manifest. iOS launches without browser chrome from the home-screen icon.
  Verified in `docs/pwa-install.md`.
- **Splash screen:** iOS PWAs use the apple-touch-icon plus an auto-generated
  white splash. Capacitor lets us ship a real splash asset. Cosmetic, not
  blocking for v1.
- **Status bar:** controlled today via `metadata.appleWebApp.statusBarStyle`.
  Capacitor gives us programmatic control (`@capacitor/status-bar`). Again,
  cosmetic.
- **Pull-to-refresh / overscroll:** iOS Safari standalone mode disables the
  URL-bar pull, but the rubber-band overscroll remains. Capacitor's WKWebView
  config can suppress it. Worth ~half a polish ticket if we ever need it;
  not a reason to adopt a wrapper.
- **Kid-proofing:** Guided Access (iOS Accessibility) and Android's Screen
  Pinning already work with a PWA installed to the home screen. A native
  wrapper adds nothing here. The single-app "kiosk" behavior we want for
  a kid handing the phone back to the parent is an OS-level feature, not
  an app-level one.

### Privacy posture: native wrapper expands the permission surface

This is the biggest concern.

- **Today (PWA):** the only browser APIs reachable from the app are those
  the user explicitly grants per-origin (e.g. notifications, geolocation —
  neither of which we request). Microphone, camera, and filesystem are
  effectively off by default and have to be requested with a visible system
  prompt that names our origin. We do not request any of them.
- **Capacitor:** every Capacitor plugin you install (`@capacitor/camera`,
  `@capacitor/microphone` via `@capacitor-community/speech-recognition`,
  `@capacitor/filesystem`, `@capacitor/geolocation`, etc.) adds an entry to
  `Info.plist` (iOS) or `AndroidManifest.xml` (Android). Some of these
  trigger App Store review flags. Even if we never call the plugin, declaring
  it in the manifest changes what the OS believes our app can do, and is
  visible to anyone scanning the binary.
- **Hard rule:** kid-quest is typed-only. No microphone, ever. No camera.
  No audio APIs. A Capacitor PoC must enforce this with an empty plugin
  allowlist (see [section 4](#4-native-permission-risks)).

### Caching: `NetworkOnly` on `/api/*` via Serwist

- **Today:** Serwist's runtime cache explicitly forces `/api/*` to
  `NetworkOnly` for both GET and POST (see `app/sw.ts`). This is load-bearing
  for trust — a stale classifier verdict would silently mislead the parent.
- **Under Capacitor:** the picture changes depending on which path we take.
  - **Capacitor + remote URL (the thin-shell PoC):** the WebView still loads
    the live Vercel deployment, the Serwist SW still controls the document,
    and `/api/*` still hits the network. Behavior is identical to today.
  - **Capacitor + Next static export:** the SW assumptions change. A native
    `fetch()` initiated inside the WebView is subject to App Transport
    Security on iOS and CORS rules on Android, and the request may be
    intercepted by Capacitor's HTTP plugin (`@capacitor/core`'s `CapacitorHttp`)
    which **bypasses the service worker entirely** when enabled. That would
    silently defeat the `NetworkOnly` override and any future caching
    contract we add. If we ever go this route, `CapacitorHttp` must be left
    disabled and we must verify in Safari Web Inspector that requests are
    flowing through the SW.

### Stage demo: does it help the iPhone-on-stage workflow?

- **Today:** the runbook in `docs/pwa-install.md` covers airplane-mode test,
  battery, brightness, hot-spare device, SW refresh. The home-screen install
  takes < 30 seconds per device. The audience never sees the install — they
  see the launch from the icon.
- **Wrapper:** no daylight here. The demo is a launch from a home-screen
  icon. The audience cannot tell whether the WebView is wrapped by Capacitor
  or by iOS's built-in standalone mode. A wrapper would actually add risk:
  TestFlight build numbers, expired provisioning profiles, "this build has
  expired" dialogs the night before a demo.

## 3. Tradeoffs table

| dimension | PWA (today) | Capacitor wrapper (remote URL) | Capacitor + Next static export |
| --- | --- | --- | --- |
| install flow | Safari → Share → Add to Home Screen | TestFlight link / App Store / Play Store | TestFlight / App Store / Play Store |
| release workflow (CI) | `git push main` → Vercel deploy → live | Vercel deploy + separate Xcode/Gradle build, sign, upload to TestFlight / Play | Same as wrapper, plus a `next export` step that must succeed on every release |
| privacy / permissions surface | Browser per-origin prompts only; nothing requested | Whatever the `Info.plist` / `AndroidManifest.xml` declares — must be tightly allowlisted | Same as wrapper |
| OTA updates | Instant on next reload (Serwist `reloadOnOnline` + `skipWaiting`) | Web layer updates instantly (still served from Vercel); native shell updates require a store release | Web layer requires either a store release or a code-push service (e.g. Capgo, Appflow) — adds a new vendor |
| offline cache control | Serwist; `/api/*` is `NetworkOnly` (verified) | Serwist still in charge; verify `CapacitorHttp` is disabled so it doesn't bypass the SW | Serwist behavior changes — `/api/*` is now a cross-origin call to Vercel, and any built-in HTTP interception bypasses the SW. Re-verification needed for every release. |
| dev complexity | One `npm run dev`. One deploy target. | Two build systems (Next + Capacitor). Xcode required on macOS, Android Studio for Android. Provisioning profiles. | Two build systems plus loss of App Router server features (server components, route handlers). Effectively a rewrite of the data layer to call Vercel cross-origin. |
| stage-demo fit | Excellent (covered by `docs/pwa-install.md`) | Neutral — same visual result, more moving parts | Negative — more moving parts, no upside on stage |
| App Store distribution | No | Yes | Yes |
| App Review risk | None | Low if plugins are empty, moderate if Camera/Mic plugins are declared | Same as wrapper |

The narrow read: **Capacitor (remote URL) is the only wrapper variant that
preserves the App Router server features and the `/api/*` contract.** The
static-export variant is structurally incompatible with how kid-quest is
built today.

## 4. Native-permission risks

Capacitor plugins map almost 1:1 to native permission entries. Adding any
of the following would expand the permission surface beyond what kid-quest
has promised:

| Plugin | iOS `Info.plist` key it adds | Android permission it adds | Allowed in kid-quest? |
| --- | --- | --- | --- |
| `@capacitor/camera` | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` | `android.permission.CAMERA` | **NO** |
| `@capacitor-community/speech-recognition` | `NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription` | `android.permission.RECORD_AUDIO` | **NO — violates "no microphone, ever"** |
| `@capacitor/voice-recorder` | `NSMicrophoneUsageDescription` | `android.permission.RECORD_AUDIO` | **NO — violates "no microphone, ever"** |
| `@capacitor/filesystem` | none added by default, but enables sandboxed FS access | `READ/WRITE_EXTERNAL_STORAGE` on legacy Android | **NO for v1** (localStorage + IndexedDB cover the local-first need) |
| `@capacitor/geolocation` | `NSLocationWhenInUseUsageDescription` | `ACCESS_COARSE/FINE_LOCATION` | **NO** |
| `@capacitor/push-notifications` | none (uses APNs entitlement) | `POST_NOTIFICATIONS` (Android 13+) | **NO for v1** |
| `@capacitor/local-notifications` | none | `POST_NOTIFICATIONS` | **NO for v1** |
| `@capacitor/contacts` | `NSContactsUsageDescription` | `READ_CONTACTS` | **NO** |
| `@capacitor/status-bar` | none | none | OK (cosmetic only) |
| `@capacitor/splash-screen` | none | none | OK (cosmetic only) |
| `@capacitor/app` | none | none | OK (lifecycle events) |
| `@capacitor/preferences` | none | none | OK (key-value, but redundant with localStorage) |

**Mandatory `capacitor.config.ts` posture for any PoC:**

```ts
// capacitor.config.ts — illustrative, not committed in this ticket.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.kid-quest.demo",
  appName: "kid-quest",
  webDir: "out", // only if going the static-export route; otherwise omit
  server: {
    // Thin-shell PoC: point at the Vercel deployment so the App Router
    // server features (route handlers, server components) still work.
    url: "https://kid-quest.vercel.app",
    cleartext: false,
  },
  plugins: {
    // Explicitly cosmetic-only allowlist. Adding Camera, Microphone,
    // SpeechRecognition, VoiceRecorder, Geolocation, or Contacts must
    // require a privacy-posture review and product sign-off.
    StatusBar: { style: "DEFAULT" },
    SplashScreen: { launchAutoHide: true },
  },
  // CRITICAL: do NOT enable CapacitorHttp. When enabled, it intercepts
  // fetch() at the native layer and bypasses the service worker, which
  // would silently defeat the `/api/*` NetworkOnly contract in `app/sw.ts`.
  // It is off by default; the PoC must keep it off and add a CI check that
  // the string "CapacitorHttp" does not appear in capacitor.config.ts.
};

export default config;
```

**Central technical risk: Next.js App Router does not map cleanly to a
Capacitor static bundle.** App Router server components, route handlers,
and server-only env reads (`getServerEnv()` in `lib/server/env.ts`) all
require a Node runtime — they cannot be statically exported into a
Capacitor `webDir`. The only honest Capacitor path that preserves the
current architecture is the **thin-shell variant** (`server.url` points at
the Vercel deployment), which is essentially "Safari in a custom container"
and reopens the question of why we'd ship a binary at all.

## 5. Smallest PoC scope (if pursued)

Only execute if a [trigger in section 6](#6-triggers-to-revisit) fires.

**Shape:** Capacitor thin-shell pointed at the Vercel deployment.

**In scope:**

- Add Capacitor in a sibling repo or a `wrapper/` subfolder, **not** in
  the main app tree, so it cannot leak into the web build.
- `capacitor.config.ts` per the snippet in [section 4](#4-native-permission-risks):
  cosmetic plugins only, `server.url` → the Vercel deployment,
  `CapacitorHttp` left off.
- iOS only for the spike. Skip Android until iOS distribution proves the
  thesis.
- Routes/screens in scope: the full live web app, since this is a
  pass-through shell. No route-by-route work.
- API calls: continue to live in `app/api/*` on Vercel. The WebView calls
  same-origin `/api/*` against `https://kid-quest.vercel.app`, the Serwist
  SW continues to enforce `NetworkOnly`, and `OPENAI_API_KEY` stays
  server-only.
- `npm run dev` continues to mean "run the Next app". A separate
  `npm run cap:run:ios` (in the wrapper folder, not the main `package.json`)
  opens the simulator pointed at `localhost:3000` for live development.

**Scope estimate:** ~1 engineer-week for an installable TestFlight build
on one provisioned iPhone. Excludes App Store review submission.

**Yes/no-go gate at the end of the week:**

- Build installs on TestFlight, launches, completes a full classifier
  round-trip with the parent log showing a fresh verdict (proves the SW +
  `NetworkOnly` survived the wrapper).
- `Info.plist` and `AndroidManifest.xml` contain **zero** entries for
  camera, microphone, speech recognition, location, contacts, or
  notifications. Verified by grep in CI.
- No `CapacitorHttp` enable flag anywhere in the wrapper repo.
- Safari Web Inspector confirms `/api/*` requests are flowing through
  the service worker (visible in the SW's fetch handler), not bypassed.

If any of the four fails, kill the spike and stay PWA.

## 6. Triggers to revisit

Concrete signals that would flip the recommendation from "no-go" to
"spike the thin-shell PoC":

1. **iOS Add-to-Home-Screen rehearsal failure rate.** If onboarding tests
   on first-time users show < 80% successful home-screen install on the
   first attempt, the install friction itself is the bottleneck and a
   store listing starts to pay for itself.
2. **Partner / school distribution requirement.** A pilot school or
   district requesting an App Store or TestFlight link explicitly. PWAs
   are a non-starter for MDM-managed school iPads.
3. **Android user share crosses a threshold.** If sustained > 30% of demo
   sessions are on Android, install-banner inconsistency across Chrome
   versions becomes a real support cost. (Note: still a PWA-vs-wrapper
   call, since Chrome's PWA install on Android is generally better than
   iOS Safari's.)
4. **iOS Safari ships a regression that breaks our standalone behavior.**
   Historically iOS 16.x and 17.x have shipped quirks around PWA storage
   (IndexedDB eviction, storage quota) and standalone status-bar styling.
   If a future iOS release breaks our local-first parent log persistence,
   a wrapper with `@capacitor/preferences` becomes a real mitigation —
   though we'd want to verify the bug is not also reproducible in the
   wrapper's WKWebView first.
5. **Required native capability that has no web equivalent.** E.g. App
   Store-required IAP for a paid tier, or true background work. None of
   these are on the v1 roadmap.
6. **Push notifications become a product requirement.** iOS web push from
   a home-screen PWA exists as of iOS 16.4 but is fragile in practice.
   A wrapper with APNs is the more reliable path if push is ever in scope.
   It is not in scope for v1.

None of these are true today. Re-check at the end of the demo cycle and
after the first round of partner conversations.

## 7. Out of scope

Explicit non-goals for this evaluation and any follow-up PoC:

- **No native binaries shipped as part of the demo cut.** The demo is the
  Vercel PWA, installed to the home screen. A Capacitor build, if it
  happens, is a separate sidecar artifact that does not gate the demo.
- **No expansion of the v1 audio / microphone / camera posture under any
  circumstance.** kid-quest is typed-only. A Capacitor PoC that adds a
  microphone or camera plugin — even "just for testing" — fails the gate
  in [section 5](#5-smallest-poc-scope-if-pursued) and must be reverted.
- **No new analytics, telemetry, or crash reporters bundled into the
  wrapper.** The PWA ships with none (`docs/deployment.md` §7 owner notes).
  The wrapper inherits that constraint.
- **No replacement of the Vercel deployment with a static export.** The
  App Router server features (route handlers, server-only env) are the
  product's security boundary. A static export breaks that boundary.
- **No code-push / OTA web-bundle update services** (Capgo, Appflow, etc.)
  in the PoC. The web layer is served from Vercel; that is the only OTA
  channel we want.
