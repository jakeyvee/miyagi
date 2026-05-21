"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { ClassifierLogRecord, Verdict } from "@/lib/contracts";
import { clearLogs, listLogs } from "@/lib/parent/log-store";
import { errorText, noteText, primaryButton, secondaryButton, subheading } from "./styles";

const PAGE_SIZE = 50;
const SHOW_MORE_THRESHOLD = 180;

type LoadState = "idle" | "loading" | "ready" | "error";

const logStyles = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  card: {
    border: "1px solid #e4e4e7",
    borderRadius: "0.75rem",
    padding: "0.75rem 0.875rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,
  timestamp: {
    color: "#555",
    fontSize: "0.8125rem",
  } satisfies CSSProperties,
  confidence: {
    color: "#555",
    fontSize: "0.8125rem",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
  inputText: {
    margin: 0,
    fontSize: "0.9375rem",
    color: "#111",
    lineHeight: 1.4,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  } satisfies CSSProperties,
  inputClamp: {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } satisfies CSSProperties,
  showMoreButton: {
    appearance: "none" as const,
    background: "transparent",
    border: "none",
    color: "#1d4ed8",
    fontSize: "0.8125rem",
    padding: 0,
    cursor: "pointer",
    alignSelf: "flex-start" as const,
  } satisfies CSSProperties,
  emptyBox: {
    border: "1px dashed #d4d4d8",
    borderRadius: "0.75rem",
    padding: "1.25rem",
    textAlign: "center" as const,
    color: "#555",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginTop: "0.5rem",
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
  } satisfies CSSProperties,
  confirmRow: {
    display: "flex",
    gap: "0.5rem",
  } satisfies CSSProperties,
} as const;

const VERDICT_COLORS: Record<Verdict, { bg: string; fg: string; label: string }> = {
  assistive: { bg: "#dcfce7", fg: "#166534", label: "Assistive" },
  critical: { bg: "#dbeafe", fg: "#1e40af", label: "Critical" },
  off_topic: { bg: "#fef3c7", fg: "#92400e", label: "Off-topic" },
  unsafe: { bg: "#fee2e2", fg: "#991b1b", label: "Unsafe" },
};

function verdictChipStyle(verdict: Verdict): CSSProperties {
  const palette = VERDICT_COLORS[verdict];
  return {
    background: palette.bg,
    color: palette.fg,
    borderRadius: "999px",
    padding: "0.125rem 0.625rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
}

function formatTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatConfidence(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

export function ClassifierLogViewer() {
  const [logs, setLogs] = useState<ClassifierLogRecord[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadInitial = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const rows = await listLogs({ limit: PAGE_SIZE });
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setState("ready");
    } catch (cause) {
      console.warn("[kid-quest] failed to load classifier logs", cause);
      setError(cause instanceof Error ? cause.message : "Could not load logs.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (logs.length === 0 || loadingMore) return;
    const oldest = logs[logs.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const next = await listLogs({
        limit: PAGE_SIZE,
        beforeTimestampMs: oldest.timestampMs,
      });
      setLogs((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (cause) {
      console.warn("[kid-quest] failed to page classifier logs", cause);
      setError(cause instanceof Error ? cause.message : "Could not load more logs.");
    } finally {
      setLoadingMore(false);
    }
  }, [logs, loadingMore]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    try {
      await clearLogs();
      setLogs([]);
      setHasMore(false);
      setConfirmingClear(false);
    } catch (cause) {
      console.warn("[kid-quest] failed to clear classifier logs", cause);
      setError(cause instanceof Error ? cause.message : "Could not clear logs.");
    } finally {
      setClearing(false);
    }
  }, []);

  if (state === "loading" || state === "idle") {
    return (
      <section aria-busy="true">
        <p style={subheading}>Loading logs…</p>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section>
        <p style={errorText} role="alert">
          {error ?? "Could not load logs."}
        </p>
        <button
          type="button"
          onClick={() => void loadInitial()}
          style={{ ...secondaryButton, marginTop: "0.75rem" }}
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {logs.length === 0 ? (
        <div style={logStyles.emptyBox}>
          <strong>No queries logged yet.</strong>
          <span style={{ fontSize: "0.875rem" }}>
            Logs appear here after your kid uses the app.
          </span>
        </div>
      ) : (
        <ul style={logStyles.list}>
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}

      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          style={secondaryButton}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading older…" : "Load older"}
        </button>
      ) : null}

      <div style={logStyles.footer}>
        <p style={noteText}>
          Logs are stored only on this device (IndexedDB). They are never sent
          to a server.
        </p>
        {confirmingClear ? (
          <div style={logStyles.confirmRow}>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              style={secondaryButton}
              disabled={clearing}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleClear()}
              style={{ ...primaryButton, background: "#a40000" }}
              disabled={clearing}
            >
              {clearing ? "Clearing…" : "Yes, clear logs"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            style={logStyles.destructiveButton}
            disabled={logs.length === 0}
          >
            Clear local logs
          </button>
        )}
      </div>
    </section>
  );
}

interface LogRowProps {
  log: ClassifierLogRecord;
}

function LogRow({ log }: LogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const palette = VERDICT_COLORS[log.verdict];
  const canExpand = log.input.length > SHOW_MORE_THRESHOLD;
  const inputTextStyle: CSSProperties = canExpand && !expanded
    ? { ...logStyles.inputText, ...logStyles.inputClamp }
    : logStyles.inputText;

  return (
    <li style={logStyles.card}>
      <div style={logStyles.headerRow}>
        <span style={verdictChipStyle(log.verdict)} aria-label={`Verdict: ${palette.label}`}>
          {palette.label}
        </span>
        <span style={logStyles.confidence} aria-label="Classifier confidence">
          {formatConfidence(log.confidence)}
        </span>
      </div>
      <p style={inputTextStyle}>
        {log.input.length === 0 ? <em style={{ color: "#888" }}>(no input captured)</em> : log.input}
      </p>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={logStyles.showMoreButton}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
      <span style={logStyles.timestamp}>{formatTimestamp(log.timestampMs)}</span>
    </li>
  );
}
