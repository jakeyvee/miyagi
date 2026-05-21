import "server-only";

import { NextResponse } from "next/server";
import { isVerdict, isAgeBand, type ClassifierLogRecord } from "@/lib/contracts";
import type { ParentSettings } from "@/lib/contracts";
import { MissingSyncEnvError } from "./adapter";

/**
 * Shared validation + error helpers for the `app/api/sync/**` route
 * handlers. Kept here so the routes stay small and consistent.
 */

export const MAX_RETENTION_DAYS = 365;
export const MIN_RETENTION_DAYS = 1;
export const DEFAULT_RETENTION_DAYS = 30;
export const MAX_LOG_BATCH = 200;

export interface ErrorBody {
  error: string;
  detail?: string;
}

export function badRequest(error: string, detail?: string) {
  return NextResponse.json<ErrorBody>({ error, detail }, { status: 400 });
}

export function serviceUnavailable(error: string, detail?: string) {
  return NextResponse.json<ErrorBody>({ error, detail }, { status: 503 });
}

export function internalError(error: string, detail?: string) {
  return NextResponse.json<ErrorBody>({ error, detail }, { status: 500 });
}

export function handleAdapterError(cause: unknown) {
  if (cause instanceof MissingSyncEnvError) {
    return serviceUnavailable("missing_sync_env", cause.message);
  }
  const message = cause instanceof Error ? cause.message : "unknown adapter error";
  // Never echo back arbitrary cause objects — could contain secrets in
  // theory. The message is sourced from our own code paths.
  return internalError("sync_adapter_failure", message);
}

const PARENT_ID_RE = /^[0-9a-f]{64}$/;
const SALT_HEX_RE = /^[0-9a-f]+$/;

export function isParentId(value: unknown): value is string {
  return typeof value === "string" && PARENT_ID_RE.test(value);
}

export function isHexString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && SALT_HEX_RE.test(value);
}

export function isParentSettings(value: unknown): value is ParentSettings {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (typeof c.topicLock !== "string") return false;
  if (!isAgeBand(c.ageBand)) return false;
  return true;
}

export function isClassifierLogRecord(value: unknown): value is ClassifierLogRecord {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || c.id.length === 0) return false;
  if (typeof c.sessionId !== "string" || c.sessionId.length === 0) return false;
  if (typeof c.timestampMs !== "number" || !Number.isFinite(c.timestampMs)) return false;
  if (typeof c.input !== "string") return false;
  if (!isVerdict(c.verdict)) return false;
  if (typeof c.confidence !== "number" || !Number.isFinite(c.confidence)) return false;
  if (c.confidence < 0 || c.confidence > 1) return false;
  return true;
}

export function clampRetentionDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RETENTION_DAYS;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (rounded > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return rounded;
}

export async function parseJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Strip a record to exactly the `ClassifierLogRecord` shape. Server-side
 * we never persist client-only fields like `syncConsent` / `syncedAtMs`
 * — consent is what authorised the upload; once stored, it's just data.
 */
export function normalizeLogRecord(input: ClassifierLogRecord): ClassifierLogRecord {
  return {
    id: input.id,
    sessionId: input.sessionId,
    timestampMs: input.timestampMs,
    input: input.input,
    verdict: input.verdict,
    confidence: input.confidence,
  };
}

/**
 * Derive a stable parent identifier from the parent's local PIN hash + salt
 * using SHA-256. Threat model:
 *
 *   - The server cannot recover the PIN from this id (one-way hash plus the
 *     parent never sends the PIN, only the already-hashed value).
 *   - If a device is compromised, the attacker can compute the same id and
 *     impersonate the parent — but that is the same trust class as today's
 *     local-PIN-only posture: a stolen device already gives full access.
 *   - The id is opaque and includes no PII; it is safe to log.
 */
export async function deriveParentId(
  pinHashHex: string,
  saltHex: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${pinHashHex}:${saltHex}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}
