"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  SYNC_RETENTION_BOUNDS,
  useSyncOptIn,
} from "@/lib/parent/sync-prefs";
import {
  runSync,
  triggerDeleteServerSide,
  triggerExport,
  useSyncStatus,
} from "@/lib/parent/sync-engine";
import {
  errorText,
  noteText,
  primaryButton,
  secondaryButton,
  subheading,
} from "./styles";

/**
 * Parent-facing Cloud Sync surface (VOL-195).
 *
 * Opt-in only. Defaults are OFF. Copy here is deliberately conservative
 * — there is no marketing language, and the per-record consent semantics
 * are spelled out so a parent reading this in 30 seconds understands
 * what does and does not leave their device.
 */
const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    padding: "1rem 1.5rem 1.5rem",
    maxWidth: "30rem",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,
  card: {
    border: "1px solid #e4e4e7",
    borderRadius: "0.75rem",
    padding: "0.875rem 1rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.625rem",
  } satisfies CSSProperties,
  sectionTitle: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.75rem",
  } satisfies CSSProperties,
  toggleLabelCol: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.125rem",
    flex: 1,
  } satisfies CSSProperties,
  toggleLabel: {
    fontSize: "0.9375rem",
    color: "#111",
    fontWeight: 500,
  } satisfies CSSProperties,
  toggleHelper: {
    fontSize: "0.8125rem",
    color: "#555",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  togglePill: (active: boolean): CSSProperties => ({
    appearance: "none",
    border: active ? "1px solid #111" : "1px solid #d4d4d8",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#333",
    borderRadius: "999px",
    padding: "0.375rem 0.875rem",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "2rem",
    flexShrink: 0,
  }),
  sliderRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.375rem",
  } satisfies CSSProperties,
  sliderValue: {
    fontVariantNumeric: "tabular-nums" as const,
    fontSize: "0.875rem",
    color: "#333",
  } satisfies CSSProperties,
  slider: {
    width: "100%",
  } satisfies CSSProperties,
  statusRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
    fontSize: "0.8125rem",
    color: "#555",
  } satisfies CSSProperties,
  statusPill: {
    background: "#f4f4f5",
    color: "#333",
    borderRadius: "999px",
    padding: "0.125rem 0.625rem",
    fontSize: "0.75rem",
    alignSelf: "flex-start" as const,
    fontVariantNumeric: "tabular-nums" as const,
  } satisfies CSSProperties,
  destructiveButton: {
    appearance: "none" as const,
    background: "#fff",
    color: "#a40000",
    border: "1px solid #a40000",
    borderRadius: "0.75rem",
    padding: "0.875rem 1rem",
    fontSize: "1rem",
    cursor: "pointer",
    width: "100%",
    minHeight: "2.75rem",
  } satisfies CSSProperties,
  confirmRow: {
    display: "flex",
    gap: "0.5rem",
  } satisfies CSSProperties,
  destructiveCopy: {
    color: "#666",
    fontSize: "0.8125rem",
    margin: 0,
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;

function formatRelativeTime(ms: number | null): string {
  if (ms === null) return "Never";
  const now = Date.now();
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function SyncPanel() {
  const [opts, setOpts] = useSyncOptIn();
  const status = useSyncStatus();
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lastExportNote, setLastExportNote] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const relative = useMemo(() => formatRelativeTime(status.lastSyncMs), [status.lastSyncMs]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    setLocalError(null);
    try {
      const result = await runSync();
      if (!result.ok) {
        setLocalError(result.error ?? "Sync failed.");
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setLastExportNote(null);
    setLocalError(null);
    try {
      const payload = await triggerExport();
      if (!payload) {
        setLocalError("Could not load export — is sync configured?");
        return;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `kid-quest-cloud-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastExportNote("Export downloaded.");
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setLocalError(null);
    try {
      const ok = await triggerDeleteServerSide();
      if (!ok) {
        setLocalError("Server-side deletion reported errors. Check status below.");
      } else {
        setConfirmDelete(false);
      }
    } finally {
      setDeleting(false);
    }
  }, []);

  return (
    <section style={styles.root} aria-label="Cloud sync controls">
      <header>
        <h2 style={subheading}>Cloud sync (opt-in)</h2>
        <p style={noteText}>
          Off by default. Each feature is its own toggle. Logs only sync if
          BOTH the logs toggle below AND the per-record consent flag in the
          Logs tab are on.
        </p>
      </header>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>What to sync</h3>

        <div style={styles.toggleRow}>
          <div style={styles.toggleLabelCol}>
            <span style={styles.toggleLabel}>Sync settings to cloud</span>
            <span style={styles.toggleHelper}>
              Uploads only your parent settings (topic lock, age band, study
              window). Default OFF.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpts({ ...opts, settings: !opts.settings })}
            style={styles.togglePill(opts.settings)}
            aria-pressed={opts.settings}
            aria-label="Toggle settings sync"
          >
            {opts.settings ? "On" : "Off"}
          </button>
        </div>

        <div style={styles.toggleRow}>
          <div style={styles.toggleLabelCol}>
            <span style={styles.toggleLabel}>
              Sync classifier logs to cloud (per-record consent)
            </span>
            <span style={styles.toggleHelper}>
              Uploads only the rows you explicitly mark "sync" in the Logs
              tab. Records created before consent is given are never
              uploaded. Default OFF.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpts({ ...opts, logs: !opts.logs })}
            style={styles.togglePill(opts.logs)}
            aria-pressed={opts.logs}
            aria-label="Toggle logs sync"
          >
            {opts.logs ? "On" : "Off"}
          </button>
        </div>

        <div style={styles.sliderRow}>
          <label htmlFor="sync-retention" style={styles.toggleLabel}>
            Server retention window
          </label>
          <input
            id="sync-retention"
            type="range"
            min={SYNC_RETENTION_BOUNDS.min}
            max={SYNC_RETENTION_BOUNDS.max}
            value={opts.retentionDays}
            onChange={(e) =>
              setOpts({ ...opts, retentionDays: Number(e.target.value) })
            }
            style={styles.slider}
          />
          <span style={styles.sliderValue}>
            {opts.retentionDays} day{opts.retentionDays === 1 ? "" : "s"}
          </span>
          <span style={styles.toggleHelper}>
            Anything older than this on the server is deleted on next sync.
          </span>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Status</h3>
        <div style={styles.statusRow} role="status" aria-live="polite">
          <span>Last sync: {relative}</span>
          <span>Pending uploads: {status.pendingUploads}</span>
          {status.lastErrorMessage ? (
            <span style={errorText}>{status.lastErrorMessage}</span>
          ) : null}
          {localError ? <span style={errorText}>{localError}</span> : null}
          {lastExportNote ? (
            <span style={styles.statusPill}>{lastExportNote}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          style={primaryButton}
          disabled={syncing || (!opts.settings && !opts.logs)}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          onClick={() => void handleExport()}
          style={secondaryButton}
          disabled={exporting}
        >
          {exporting ? "Preparing…" : "Export my data"}
        </button>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Delete cloud data</h3>
        <p style={styles.destructiveCopy}>
          Deletes the copy stored on the server (settings + logs). Your
          local copy on this device is not affected.
        </p>
        {confirmDelete ? (
          <>
            <p style={styles.destructiveCopy}>
              This can&apos;t be undone. Continue?
            </p>
            <div style={styles.confirmRow}>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={secondaryButton}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                style={{ ...primaryButton, background: "#a40000" }}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, delete cloud data"}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={styles.destructiveButton}
          >
            Delete cloud data
          </button>
        )}
      </div>
    </section>
  );
}
