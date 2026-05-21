import "server-only";

import { getServerEnv } from "@/lib/server/env";
import { MissingSyncEnvError, type SyncAdapter } from "./adapter";
import { memoryAdapter } from "./memory-adapter";
import { supabaseAdapter } from "./supabase-adapter";

/**
 * Resolves the cloud-sync adapter based on `SYNC_BACKEND`. Defaults to
 * the in-memory dev stub when unset so route handlers work out of the
 * box without any Supabase credentials.
 *
 * Throws `MissingSyncEnvError` only when `SYNC_BACKEND=supabase` AND the
 * Supabase env is incomplete — that way a misconfigured deploy fails
 * fast and visibly, while a default dev box "just works."
 */
export function getSyncAdapter(): SyncAdapter {
  // Read via the canonical env reader. This intentionally calls
  // getServerEnv() (which throws on missing ANTHROPIC_API_KEY) because in
  // every environment where we'd want sync, we'd also want the
  // classifier — and we'd rather surface the missing Anthropic key here
  // than five layers deeper.
  const env = getServerEnv();
  const backend = env.SYNC_BACKEND ?? "memory";
  if (backend === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
      throw new MissingSyncEnvError(
        "SYNC_BACKEND=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE are not set.",
      );
    }
    return supabaseAdapter;
  }
  return memoryAdapter;
}

export { MissingSyncEnvError } from "./adapter";
export type { SyncAdapter } from "./adapter";
