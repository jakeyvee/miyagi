import { NextResponse } from "next/server";
import type { ClassifierLogRecord } from "@/lib/contracts";
import { getSyncAdapter } from "@/lib/server/sync";
import {
  MAX_LOG_BATCH,
  badRequest,
  clampRetentionDays,
  handleAdapterError,
  isClassifierLogRecord,
  isParentId,
  normalizeLogRecord,
  parseJsonBody,
} from "@/lib/server/sync/route-helpers";

/**
 * /api/sync/logs — opt-in cloud sync for classifier log records (VOL-195).
 *
 *   POST   body { parentId, records[], retentionDays } -> { acceptedIds[] }
 *   DELETE ?parentId&id=...                            -> { ok: true }
 *   DELETE ?parentId&all=true                          -> { ok: true, deletedCount }
 *
 * Per PDPA review §7.1, records are uploaded only with parent opt-in AND
 * per-record consent. The route does not re-derive consent — that's
 * enforced client-side in `sync-engine.ts`. We do enforce strict shape
 * validation and a batch cap to prevent unbounded payloads.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") {
    return badRequest("invalid_body");
  }
  const c = body as Record<string, unknown>;
  if (!isParentId(c.parentId)) {
    return badRequest("invalid_parent_id");
  }
  if (!Array.isArray(c.records)) {
    return badRequest("invalid_records", "records must be an array.");
  }
  if (c.records.length === 0) {
    return NextResponse.json({ acceptedIds: [] });
  }
  if (c.records.length > MAX_LOG_BATCH) {
    return badRequest("batch_too_large", `Max ${MAX_LOG_BATCH} records per request.`);
  }
  const records: ClassifierLogRecord[] = [];
  for (const raw of c.records) {
    if (!isClassifierLogRecord(raw)) {
      return badRequest("invalid_record", "One or more records failed shape validation.");
    }
    records.push(normalizeLogRecord(raw));
  }
  const retentionDays = clampRetentionDays(c.retentionDays);
  try {
    const adapter = getSyncAdapter();
    const result = await adapter.upsertLogs(c.parentId, records, retentionDays);
    return NextResponse.json(result);
  } catch (cause) {
    return handleAdapterError(cause);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId");
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all");
  if (!isParentId(parentId)) {
    return badRequest("invalid_parent_id");
  }
  try {
    const adapter = getSyncAdapter();
    if (all === "true") {
      const result = await adapter.bulkClearLogs(parentId);
      return NextResponse.json({ ok: true, ...result });
    }
    if (typeof id !== "string" || id.length === 0) {
      return badRequest("missing_id_or_all", "Pass id=<recordId> or all=true.");
    }
    await adapter.deleteLog(parentId, id);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return handleAdapterError(cause);
  }
}
