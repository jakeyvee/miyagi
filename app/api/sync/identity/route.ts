import { NextResponse } from "next/server";
import {
  badRequest,
  deriveParentId,
  isHexString,
  parseJsonBody,
} from "@/lib/server/sync/route-helpers";

/**
 * POST /api/sync/identity
 * Body: { pinHashHex: string, saltHex: string }
 * Returns: { parentId: string }
 *
 * Derives a stable, opaque `parentId` from the parent's locally-stored
 * PIN hash + salt. The hashing happens server-side so the derivation can
 * be audited from a single place (and so a future migration to a stronger
 * KDF only has to update this file).
 *
 * Threat model:
 *
 *   - The PIN itself never reaches the server. The client sends the
 *     already-hashed value from `lib/parent/pin.ts`.
 *   - SHA-256(pinHashHex + saltHex) is irreversible. An attacker with
 *     `parentId` cannot recover the PIN.
 *   - A device compromise can recompute `parentId` and impersonate the
 *     parent — same trust class as the current local-only posture.
 *   - The id is opaque, fixed-length, and contains no PII; safe to log.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") {
    return badRequest("invalid_body", "Expected JSON object.");
  }
  const c = body as Record<string, unknown>;
  if (!isHexString(c.pinHashHex)) {
    return badRequest("invalid_pin_hash", "pinHashHex must be a non-empty hex string.");
  }
  if (!isHexString(c.saltHex)) {
    return badRequest("invalid_salt", "saltHex must be a non-empty hex string.");
  }
  const parentId = await deriveParentId(c.pinHashHex, c.saltHex);
  return NextResponse.json({ parentId });
}
