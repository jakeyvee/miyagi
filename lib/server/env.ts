import "server-only";

/**
 * Server-only env access. Importing this file from a client component will
 * fail the build, so OpenAI keys can never reach the browser bundle.
 *
 * Later tickets that wire the classifier should read via `getServerEnv()`
 * rather than touching `process.env` directly so the missing-key error stays
 * consistent.
 *
 * VOL-195 added optional cloud-sync env (`SYNC_BACKEND`, `SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE`). These are deliberately OPTIONAL — `getServerEnv()`
 * still only throws when `OPENAI_API_KEY` is missing. The sync layer reads
 * `getServerEnv()` and decides for itself whether the env it requires is
 * present, so a missing sync backend never breaks the classifier or any
 * other existing route.
 *
 * NEVER prefix any of these with `NEXT_PUBLIC_`. `verify:privacy` will catch
 * it on OpenAI; the same hygiene applies to Supabase credentials.
 */
export type SyncBackend = "memory" | "supabase";

export interface ServerEnv {
  OPENAI_API_KEY: string;
  /** Selects the sync adapter. Defaults to "memory" in dev. */
  SYNC_BACKEND?: SyncBackend;
  /** Supabase project URL. Only required when SYNC_BACKEND === "supabase". */
  SUPABASE_URL?: string;
  /** Supabase service-role key. Server-only. Never exposed to the browser. */
  SUPABASE_SERVICE_ROLE?: string;
}

function readSyncBackend(): SyncBackend | undefined {
  const raw = process.env.SYNC_BACKEND;
  if (!raw) return undefined;
  if (raw === "memory" || raw === "supabase") return raw;
  // Unknown values are ignored — the adapter selector treats this as "default"
  // (memory) rather than throwing at module load.
  return undefined;
}

export function getServerEnv(): ServerEnv {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || undefined;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE?.trim() || undefined;
  return {
    OPENAI_API_KEY: openAiKey,
    SYNC_BACKEND: readSyncBackend(),
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE: supabaseServiceRole,
  };
}
