import { NextResponse } from "next/server";
import { getSyncAdapter } from "@/lib/server/sync";
import {
  badRequest,
  handleAdapterError,
  isParentId,
} from "@/lib/server/sync/route-helpers";

/**
 * GET /api/sync/export?parentId=<hex> — returns the full server-side
 * payload for a parent as `{ settings, logs }`. Returns null/empty when
 * nothing has been synced. Used by the parent dashboard "Export my data"
 * button to materialise a JSON blob the parent can save locally.
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
    const data = await adapter.exportAll(parentId);
    return NextResponse.json(data);
  } catch (cause) {
    return handleAdapterError(cause);
  }
}
