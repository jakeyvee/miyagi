# Deployment runbook (Vercel)

This is the demo deployment for kid-quest. It targets Vercel, runs on Node.js
serverless functions, and is fronted by Vercel's CDN.

The deployment intentionally has **no database, no auth, no telemetry**. Every
secret is server-only and is read through `getServerEnv()` from
`@/lib/server/env`.

---

## 1. One-time project setup

Do this once, per Vercel project (production + previews share the same
project).

### 1a. Connect the repo

1. In the Vercel dashboard click **Add New… → Project**.
2. Select the `kid-quest` GitHub repository.
3. **Framework preset**: Next.js (auto-detected).
4. **Root directory**: `./` (repo root).
5. **Build command**: leave as the default (`next build`).
6. **Output directory**: leave as the default (`.next`).
7. **Install command**: leave as the default (`npm install`).
8. **Node.js version**: 20.x (matches `@types/node` 22 dev dep — Vercel's
   current default is fine).

Do **not** click Deploy yet — env vars first.

### 1b. Configure env vars

In **Project Settings → Environment Variables**, add:

| Name             | Value                            | Environments                       | Type   |
| ---------------- | -------------------------------- | ---------------------------------- | ------ |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (from the OpenAI dash)  | Production, Preview, Development   | Secret |

Hard rules:

- The name **must not** start with `NEXT_PUBLIC_`. If it does, Next.js inlines
  the value into the browser bundle and the key leaks.
- Mark the variable as **Secret** so it isn't shown in plain text after save.
- Use the same key for Production and Preview for the demo. If you ever bring
  this past demo stage, rotate to separate keys.

The app reads this via `getServerEnv()` in `lib/server/env.ts`. If the key is
unset, the classifier route throws a clear error on the first request — see
[Fail-closed behavior](#fail-closed-behavior) below.

### 1c. Region and function limits

`vercel.json` at the repo root pins:

- **Region**: `iad1` (US East / Washington D.C.). Close to OpenAI's primary
  region; lowest classifier latency for a US-based demo.
- **`app/api/classifier/route.ts`**: `maxDuration: 30` seconds. Generous
  headroom for a streaming or slow OpenAI response.
- **`app/api/health/route.ts`**: `maxDuration: 5` seconds. The probe is
  trivially fast; a tight limit makes regressions loud.

If the demo audience is not US-based, change `regions` in `vercel.json`. Do
not pin to multiple regions for a serverless project — Vercel only uses the
first entry for serverless functions.

---

## 2. First deploy

1. In **Deployments**, click **Redeploy** on the most recent commit (or push
   any change to `main`).
2. Watch the build log. The CI gate is `npm run build`. If it fails, fix
   locally with `npm run typecheck && npm run build && npm run lint` and push
   again.
3. When the build completes, Vercel assigns a production URL like
   `https://kid-quest.vercel.app`.

Every push to `main` produces a **production** deployment. Every push to any
other branch (and every PR) produces a **preview** deployment with its own
URL.

---

## 3. Verify the deployment

Run these checks from a phone on cellular (not just the office Wi‑Fi) to catch
mobile-specific issues. Replace `<URL>` with your deployment URL.

### 3a. App shell loads

Open `<URL>/` in mobile Safari and Chrome. You should see the landing page.
No console errors. Viewport should not allow pinch-zoom (intentional, set in
`app/layout.tsx`).

### 3b. Health probe

```sh
curl -sS https://<URL>/api/health | jq
```

Expected:

```json
{ "ok": true, "hasAnthropicKey": true }
```

- `ok: true` confirms the function is reachable and the runtime booted.
- `hasAnthropicKey: true` confirms the env var is wired. If it's `false`, go
  back to [1b](#1b-configure-env-vars), re-save, and **redeploy** (Vercel does
  not auto-redeploy on env changes).
- The actual key is **never** in the response.

### 3c. Classifier reachability

The classifier route is still a stub; it returns `501 not_implemented` until a
later ticket wires OpenAI. That's the right signal for this checkpoint — it
proves routing, edge → function path, and JSON parsing all work.

```sh
curl -sS -X POST https://<URL>/api/classifier \
  -H 'content-type: application/json' \
  -d '{"text":"hello","topic":"animals","ageBand":"6-8"}' \
  -i
```

Expected first line: `HTTP/2 501`. Body: `{"error":"not_implemented"}`.

Then test from a phone using a small inspector page or just by hitting the
URL via any HTTP client app. Confirm no CORS errors and no mixed-content
warnings.

### 3d. Same-origin from the browser

Open the deployment in mobile Safari, open the dev tools (or use Safari's
remote inspector), and run in the console:

```js
fetch('/api/health').then(r => r.json()).then(console.log);
```

Expected: `{ ok: true, hasAnthropicKey: true }`. This catches CSP or routing
issues a `curl` test would miss.

---

## 4. Cache busting

Next.js fingerprints all JS/CSS assets, so updates ship automatically. PWA
caches are different.

- **App shell / static assets**: bumped on every deploy via Next's
  content-hashed filenames. No action needed.
- **HTML responses**: served with Vercel's default `s-maxage=0` for App Router
  pages. New deployments are picked up on the next navigation.
- **Service worker** (added in a later ticket): when one ships, update the
  cache version string in the SW source on every release that changes
  cached assets. Until then, there is no SW and nothing to bust.
- **Hard refresh** for stuck testers: on iOS Safari, close all tabs of the
  site; on Android Chrome, long-press refresh → "Reload from origin".

If a tester is still seeing stale content after a redeploy:

1. Check that the deployment is marked **Current** (production) or that they
   have the right preview URL.
2. Have them open in a private/incognito window first to rule out their
   browser cache.
3. As a last resort, in Vercel **Settings → Data Cache** → **Purge Everything**.

---

## 5. Preview vs production behavior

| Aspect             | Preview                                 | Production                            |
| ------------------ | --------------------------------------- | ------------------------------------- |
| Trigger            | Push to any non-main branch, or any PR  | Push to `main`                        |
| URL                | `kid-quest-<branch>-<owner>.vercel.app` | Project's production domain           |
| Env vars           | Same `ANTHROPIC_API_KEY` (per 1b)          | Same `ANTHROPIC_API_KEY`                 |
| Indexable          | `x-robots-tag: noindex` (Vercel default)| Indexable (no robots tag)             |
| Recommended use    | Share demo links, smoke-test branches   | The link you give to a stakeholder    |

Previews are functionally identical to production for this project. There is
no separate staging database or feature flag system to worry about.

---

## 6. Fail-closed behavior

`lib/server/env.ts` throws if `ANTHROPIC_API_KEY` is unset:

```
ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in.
```

What this means in production:

- The **build** does not call `getServerEnv()`, so a missing key does **not**
  break `next build`. This is intentional — we want builds to succeed in a
  fresh env so deployment can recover by adding the var.
- The **classifier route** calls `getServerEnv()` on every request (when
  wired in a later ticket). A missing key surfaces as a 500 with the message
  above in the function logs. The browser sees a generic 500.
- The **health route** does **not** call `getServerEnv()`. It checks
  `process.env.ANTHROPIC_API_KEY` directly so it can report `hasAnthropicKey:
  false` without crashing. Use this as the cheap probe.

If `hasAnthropicKey` is `false` on `/api/health` after a deploy, the rest of the
app is broken in the same way. Fix the env var and redeploy before doing
anything else.

---

## 7. Owner notes

- **One person owns the OpenAI key.** Rotate it through the Vercel dashboard;
  do not commit a new one to `.env.example`. `.env.example` always has empty
  values.
- **No third-party analytics.** Do not add Vercel Analytics, Sentry, or any
  client-side telemetry without coordinating with the privacy review — this
  project ships to kids.
- **No NEXT_PUBLIC secrets, ever.** A quick guard: `grep -R "NEXT_PUBLIC_" .`
  should find nothing related to OpenAI or any other secret.
- **Domain**: the demo runs on the Vercel-assigned domain. If a custom domain
  is added later, terminate TLS at Vercel; do not proxy through a third party.
- **Rollback**: in **Deployments** find the last green production deploy and
  click **Promote to Production**. There is no separate rollback step.
- **Function logs**: **Deployments → \<deploy\> → Functions** shows per-route
  logs. The classifier route is the only one expected to surface OpenAI
  errors; the health route should never log.
