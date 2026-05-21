import "server-only";

import { getServerEnv } from "@/lib/server/env";
import { MissingSyncEnvError, type SyncAdapter } from "./adapter";

/**
 * Supabase implementation of `SyncAdapter`.
 *
 * STUB ONLY. This file deliberately does NOT depend on
 * `@supabase/supabase-js` — adding a runtime dependency is out of scope
 * for VOL-195. When the credentials are real and the pilot is ready to
 * cut over, install the SDK and replace the TODOs below.
 *
 * Required SQL (run once via Supabase migrations):
 *
 *   create table parent_settings (
 *     parent_id text primary key,
 *     settings jsonb not null,
 *     retention_days int not null default 30,
 *     updated_at timestamptz not null default now()
 *   );
 *
 *   create table classifier_logs (
 *     parent_id text not null,
 *     id text not null,
 *     payload jsonb not null,
 *     timestamp_ms bigint not null,
 *     stored_at timestamptz not null default now(),
 *     primary key (parent_id, id)
 *   );
 *
 *   alter table parent_settings enable row level security;
 *   alter table classifier_logs enable row level security;
 *
 *   -- RLS keys all reads/writes on parent_id; the route handlers run
 *   -- with the service role, so they bypass RLS — but RLS keeps a
 *   -- compromised anon/auth role from cross-reading another parent.
 *
 *   create policy "no anon reads" on parent_settings for select using (false);
 *   create policy "no anon reads" on classifier_logs for select using (false);
 *
 * Retention enforcement should run as a scheduled job (Supabase edge
 * function or a cron) that deletes from `classifier_logs` where
 * `now() - stored_at > retention_days * interval '1 day'` per row's
 * parent retention setting. The adapter does not enforce inline.
 *
 * Audit logging: every method below should emit a row into a separate
 * `sync_access_log` table with actor='service-role', parent_id, time,
 * and op. PDPA review §7.6 requires this for any operator read; here
 * it covers our own writes for completeness.
 */
function requireSupabaseEnv(): { url: string; serviceRole: string } {
  const env = getServerEnv();
  const url = env.SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    throw new MissingSyncEnvError(
      "SYNC_BACKEND=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE are not set.",
    );
  }
  return { url, serviceRole };
}

function notImplemented(method: string): never {
  // The env check is done first so callers get the friendly missing-env
  // error in the common case. If the env IS set, we still throw — wiring
  // up the actual Supabase client is left for the cut-over commit.
  requireSupabaseEnv();
  throw new MissingSyncEnvError(
    `Supabase adapter is a stub. ${method} is not implemented in this build; ` +
      `install @supabase/supabase-js and complete the TODOs in supabase-adapter.ts.`,
  );
}

export const supabaseAdapter: SyncAdapter = {
  async putSettings(_parentId, _settings, _retentionDays) {
    notImplemented("putSettings");
  },
  async getSettings(_parentId) {
    notImplemented("getSettings");
  },
  async deleteSettings(_parentId) {
    notImplemented("deleteSettings");
  },
  async upsertLogs(_parentId, _records, _retentionDays) {
    notImplemented("upsertLogs");
  },
  async deleteLog(_parentId, _id) {
    notImplemented("deleteLog");
  },
  async bulkClearLogs(_parentId) {
    notImplemented("bulkClearLogs");
  },
  async exportAll(_parentId) {
    notImplemented("exportAll");
  },
};
