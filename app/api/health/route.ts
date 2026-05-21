import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Deterministic deployment probe. Returns a tiny JSON payload that the
 * rehearsal and privacy agents (and humans on a phone after a deploy) can hit
 * to confirm:
 *
 *   1. The server is up and Next.js is routing API requests.
 *   2. `ANTHROPIC_API_KEY` is configured in the runtime env.
 *
 * The key VALUE is never returned — only a boolean indicating presence. The
 * classifier route uses `getServerEnv()` from `@/lib/server/env`, which throws
 * if the key is missing; this probe lets you catch that misconfiguration
 * before a kid ever hits the classifier.
 */

// Force dynamic so the probe always reflects the current runtime env, not a
// value frozen at build time.
export const dynamic = "force-dynamic";

interface HealthResponse {
  ok: true;
  hasAnthropicKey: boolean;
}

export function GET(): NextResponse<HealthResponse> {
  // Read process.env directly here — we intentionally do NOT call
  // getServerEnv() because that throws when the key is missing, and the whole
  // point of this probe is to report missingness without 500ing.
  const hasAnthropicKey =
    typeof process.env.ANTHROPIC_API_KEY === "string" &&
    process.env.ANTHROPIC_API_KEY.length > 0;

  return NextResponse.json({ ok: true, hasAnthropicKey });
}
