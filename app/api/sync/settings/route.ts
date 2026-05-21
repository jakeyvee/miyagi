import { NextResponse } from "next/server";
import { getSyncAdapter } from "@/lib/server/sync";
import {
  badRequest,
  clampRetentionDays,
  handleAdapterError,
  isParentId,
  isParentSettings,
  parseJsonBody,
} from "@/lib/server/sync/route-helpers";

/**
 * /api/sync/settings — opt-in cloud sync for ParentSettings (VOL-195).
 *
 *   GET    ?parentId=<hex>                            -> { settings | null }
 *   PUT    body { parentId, settings, retentionDays } -> { ok: true }
 *   DELETE ?parentId=<hex>                            -> { ok: true }
 *
 * The route trusts that the parent dashboard already gates this with an
 * explicit opt-in toggle. We still validate inputs strictly so a stray
 * request can't poison another parent's row.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId");
  if (!isParentId(parentId)) {
    return badRequest("invalid_parent_id");
  }
  try {
    const adapter = getSyncAdapter();
    const settings = await adapter.getSettings(parentId);
    return NextResponse.json({ settings });
  } catch (cause) {
    return handleAdapterError(cause);
  }
}

export async function PUT(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") {
    return badRequest("invalid_body");
  }
  const c = body as Record<string, unknown>;
  if (!isParentId(c.parentId)) {
    return badRequest("invalid_parent_id");
  }
  if (!isParentSettings(c.settings)) {
    return badRequest("invalid_settings");
  }
  const retentionDays = clampRetentionDays(c.retentionDays);
  try {
    const adapter = getSyncAdapter();
    await adapter.putSettings(c.parentId, c.settings, retentionDays);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return handleAdapterError(cause);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId");
  if (!isParentId(parentId)) {
    return badRequest("invalid_parent_id");
  }
  try {
    const adapter = getSyncAdapter();
    await adapter.deleteSettings(parentId);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return handleAdapterError(cause);
  }
}
