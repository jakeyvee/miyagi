"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { VERDICTS, type ClassifierLogRecord, type Verdict } from "@/lib/contracts";
import {
  clearLogs,
  listLogsWithConsent,
  setLogSyncConsent,
} from "@/lib/parent/log-store";
import { useSyncOptIn } from "@/lib/parent/sync-prefs";
import {
  errorText,
  noteText,
  primaryButton,
  secondaryButton,
  subheading,
} from "./styles";

const PAGE_SIZE = 50;
const SHOW_MORE_THRESHOLD = 180;
const CONFIDENCE_HINT_STORAGE_KEY = "kid-quest:parent:logs:confidenceHintDismissed";
const SKELETON_ROW_COUNT = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LoadState = "idle" | "loading" | "ready" | "error";

const logStyles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  } satisfies CSSProperties,
  counterRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
    fontSize: "0.8125rem",
    color: "#555",
  } satisfies CSSProperties,
  counterPill: {
    background: "#f4f4f5",
    borderRadius: "999px",
    padding: "0.25rem 0.625rem",
    fontVariantNumeric: "tabular-nums" as const,
  } satisfies CSSProperties,
  filtersWrap: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    padding: "0.625rem",
    border: "1px solid #e4e4e7",
    borderRadius: "0.75rem",
    background: "#fafafa",
  } satisfies CSSProperties,
  filterChipsRow: {
    display: "flex",
    gap: "0.375rem",
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,
  filterChip: (active: boolean, palette?: { bg: string; fg: string }): CSSProperties => ({
    appearance: "none",
    border: active ? `1px solid ${palette?.fg ?? "#111"}` : "1px solid #d4d4d8",
    background: active ? palette?.bg ?? "#111" : "#fff",
    color: active ? palette?.fg ?? "#fff" : "#333",
    borderRadius: "999px",
    padding: "0.375rem 0.75rem",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "2rem",
  }),
  todayToggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  } satisfies CSSProperties,
  toggleLabel: {
    fontSize: "0.875rem",
    color: "#333",
  } satisfies CSSProperties,
  togglePill: (active: boolean): CSSProperties => ({
    appearance: "none",
    border: active ? "1px solid #111" : "1px solid #d4d4d8",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#333",
    borderRadius: "999px",
    padding: "0.375rem 0.75rem",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "2rem",
  }),
  filteredCount: {
    fontSize: "0.75rem",
    color: "#666",
    margin: 0,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  dayHeader: {
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    background: "#fff",
    padding: "0.375rem 0.125rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    borderBottom: "1px solid #e4e4e7",
    listStyle: "none",
  } satisfies CSSProperties,
  relativePill: {
    background: "#eef2ff",
    color: "#3730a3",
    borderRadius: "999px",
    padding: "0.0625rem 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "none" as const,
  } satisfies CSSProperties,
  card: {
    border: "1px solid #e4e4e7",
    borderRadius: "0.75rem",
    padding: "0.75rem 0.875rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
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
  confidenceWrap: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
    minWidth: "5.5rem",
    alignItems: "flex-end" as const,
  } satisfies CSSProperties,
  confidence: {
    color: "#555",
    fontSize: "0.8125rem",
    fontVariantNumeric: "tabular-nums" as const,
  } satisfies CSSProperties,
  confidenceBarTrack: {
    width: "5rem",
    height: "0.25rem",
    background: "#e4e4e7",
    borderRadius: "999px",
    overflow: "hidden",
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
  cardActions: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
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
    minHeight: "1.75rem",
  } satisfies CSSProperties,
  copyButton: {
    appearance: "none" as const,
    background: "transparent",
    border: "1px solid #d4d4d8",
    color: "#333",
    fontSize: "0.75rem",
    padding: "0.25rem 0.625rem",
    cursor: "pointer",
    borderRadius: "999px",
    minHeight: "1.75rem",
  } satisfies CSSProperties,
  emptyBox: {
    border: "1px dashed #d4d4d8",
    borderRadius: "0.75rem",
    padding: "1.5rem 1.25rem",
    textAlign: "center" as const,
    color: "#555",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "0.5rem",
  } satisfies CSSProperties,
  emptyIcon: {
    color: "#a1a1aa",
    flexShrink: 0,
  } satisfies CSSProperties,
  emptyTitle: {
    color: "#333",
    fontSize: "0.9375rem",
    fontWeight: 600,
  } satisfies CSSProperties,
  emptyBody: {
    fontSize: "0.875rem",
    lineHeight: 1.4,
    maxWidth: "26rem",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column" as const,
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
  errorPanel: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    borderRadius: "0.75rem",
    padding: "1rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  } satisfies CSSProperties,
  errorTitle: {
    color: "#991b1b",
    fontSize: "0.9375rem",
    fontWeight: 600,
    margin: 0,
  } satisfies CSSProperties,
  errorBody: {
    color: "#7f1d1d",
    fontSize: "0.875rem",
    margin: 0,
    lineHeight: 1.4,
  } satisfies CSSProperties,
  errorDetails: {
    color: "#7f1d1d",
    fontSize: "0.75rem",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    margin: 0,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  } satisfies CSSProperties,
  errorDetailsToggle: {
    appearance: "none" as const,
    background: "transparent",
    border: "none",
    color: "#7f1d1d",
    fontSize: "0.75rem",
    padding: 0,
    cursor: "pointer",
    alignSelf: "flex-start" as const,
    textDecoration: "underline",
  } satisfies CSSProperties,
  hintCard: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-start",
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1e3a8a",
    borderRadius: "0.75rem",
    padding: "0.625rem 0.75rem",
    fontSize: "0.8125rem",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  hintBody: {
    flex: 1,
    margin: 0,
  } satisfies CSSProperties,
  hintDismiss: {
    appearance: "none" as const,
    background: "transparent",
    border: "none",
    color: "#1e3a8a",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.375rem",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  copyConfirm: {
    fontSize: "0.6875rem",
    color: "#166534",
    marginLeft: "0.25rem",
  } satisfies CSSProperties,
  skeletonShell: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  } satisfies CSSProperties,
  skeletonCard: {
    border: "1px solid #e4e4e7",
    borderRadius: "0.75rem",
    padding: "0.75rem 0.875rem",
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  } satisfies CSSProperties,
  skeletonRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
  } satisfies CSSProperties,
  skeletonBlock: (width: string, height = "0.875rem"): CSSProperties => ({
    height,
    width,
    borderRadius: "0.375rem",
    background:
      "linear-gradient(90deg, #f1f1f3 0%, #e4e4e7 50%, #f1f1f3 100%)",
    backgroundSize: "200% 100%",
    animation: "kidQuestShimmer 1.4s ease-in-out infinite",
  }),
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

function dayKey(ms: number): string {
  const d = new Date(ms);
  // Local-time YYYY-MM-DD key.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

let cachedDateFormatter: Intl.DateTimeFormat | null = null;
let cachedTimeFormatter: Intl.DateTimeFormat | null = null;

function getDateFormatter(): Intl.DateTimeFormat {
  if (!cachedDateFormatter) {
    cachedDateFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return cachedDateFormatter;
}

function getTimeFormatter(): Intl.DateTimeFormat {
  if (!cachedTimeFormatter) {
    cachedTimeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return cachedTimeFormatter;
}

function formatDayHeader(ms: number): string {
  try {
    return getDateFormatter().format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

function formatTime(ms: number): string {
  try {
    return getTimeFormatter().format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function relativeDayLabel(dayStartMs: number, todayStartMs: number): string {
  const diffDays = Math.round((todayStartMs - dayStartMs) / MS_PER_DAY);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return "Older";
}

function formatConfidence(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

interface GroupedDay {
  dayStartMs: number;
  rows: ClassifierLogRecord[];
}

function groupByLocalDay(rows: ClassifierLogRecord[]): GroupedDay[] {
  const groups: GroupedDay[] = [];
  let current: GroupedDay | null = null;
  let currentKey: string | null = null;
  for (const row of rows) {
    const key = dayKey(row.timestampMs);
    if (key !== currentKey) {
      current = { dayStartMs: startOfLocalDay(row.timestampMs), rows: [] };
      groups.push(current);
      currentKey = key;
    }
    current!.rows.push(row);
  }
  return groups;
}

export function ClassifierLogViewer() {
  const [logs, setLogs] = useState<ClassifierLogRecord[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState<Set<Verdict>>(new Set());
  const [todayOnly, setTodayOnly] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(CONFIDENCE_HINT_STORAGE_KEY);
      setHintDismissed(stored === "1");
    } catch {
      setHintDismissed(false);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CONFIDENCE_HINT_STORAGE_KEY, "1");
    } catch {
      // localStorage may be disabled — non-fatal.
    }
  }, []);

  const [consentMap, setConsentMap] = useState<Record<string, boolean>>({});
  const [syncOpts] = useSyncOptIn();

  const loadInitial = useCallback(async () => {
    setState("loading");
    setError(null);
    setErrorDetailsOpen(false);
    try {
      const withConsent = await listLogsWithConsent({ limit: PAGE_SIZE });
      const rows: ClassifierLogRecord[] = withConsent.map(
        ({ id, sessionId, timestampMs, input, verdict, confidence }) => ({
          id,
          sessionId,
          timestampMs,
          input,
          verdict,
          confidence,
        }),
      );
      const nextConsent: Record<string, boolean> = {};
      for (const r of withConsent) {
        if (r.syncConsent === true) nextConsent[r.id] = true;
      }
      setConsentMap(nextConsent);
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
      const next = await listLogsWithConsent({
        limit: PAGE_SIZE,
        beforeTimestampMs: oldest.timestampMs,
      });
      const trimmed: ClassifierLogRecord[] = next.map(
        ({ id, sessionId, timestampMs, input, verdict, confidence }) => ({
          id,
          sessionId,
          timestampMs,
          input,
          verdict,
          confidence,
        }),
      );
      setLogs((current) => [...current, ...trimmed]);
      setConsentMap((current) => {
        const merged = { ...current };
        for (const r of next) {
          if (r.syncConsent === true) merged[r.id] = true;
        }
        return merged;
      });
      setHasMore(next.length === PAGE_SIZE);
    } catch (cause) {
      console.warn("[kid-quest] failed to page classifier logs", cause);
      setError(cause instanceof Error ? cause.message : "Could not load more logs.");
    } finally {
      setLoadingMore(false);
    }
  }, [logs, loadingMore]);

  const toggleConsent = useCallback(async (id: string) => {
    const current = consentMap[id] === true;
    const next = !current;
    setConsentMap((prev) => ({ ...prev, [id]: next }));
    try {
      await setLogSyncConsent(id, next);
    } catch (cause) {
      console.warn("[kid-quest] failed to toggle consent", cause);
      setConsentMap((prev) => ({ ...prev, [id]: current }));
    }
  }, [consentMap]);

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

  const toggleVerdictFilter = useCallback((verdict: Verdict) => {
    setVerdictFilter((current) => {
      const next = new Set(current);
      if (next.has(verdict)) {
        next.delete(verdict);
      } else {
        next.add(verdict);
      }
      return next;
    });
  }, []);

  const todayStartMs = useMemo(() => startOfLocalDay(Date.now()), [logs.length]);
  const sevenDaysAgoStartMs = todayStartMs - 6 * MS_PER_DAY;

  const counters = useMemo(() => {
    let today = 0;
    let pastSeven = 0;
    for (const row of logs) {
      const rowDay = startOfLocalDay(row.timestampMs);
      if (rowDay === todayStartMs) today += 1;
      if (rowDay >= sevenDaysAgoStartMs) pastSeven += 1;
    }
    return { today, pastSeven };
  }, [logs, todayStartMs, sevenDaysAgoStartMs]);

  const filtersActive = verdictFilter.size > 0 || todayOnly;

  const filteredLogs = useMemo(() => {
    if (!filtersActive) return logs;
    return logs.filter((row) => {
      if (verdictFilter.size > 0 && !verdictFilter.has(row.verdict)) return false;
      if (todayOnly && startOfLocalDay(row.timestampMs) !== todayStartMs) {
        return false;
      }
      return true;
    });
  }, [logs, verdictFilter, todayOnly, filtersActive, todayStartMs]);

  const grouped = useMemo(() => groupByLocalDay(filteredLogs), [filteredLogs]);

  if (state === "loading" || state === "idle") {
    return (
      <section style={logStyles.root} aria-busy="true">
        <ShimmerKeyframes />
        <p style={subheading}>Loading logs…</p>
        <div style={logStyles.skeletonShell} aria-hidden="true">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, idx) => (
            <SkeletonRow key={idx} />
          ))}
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section style={logStyles.root}>
        <div style={logStyles.errorPanel} role="alert">
          <p style={logStyles.errorTitle}>Couldn't load the logs on this device.</p>
          <p style={logStyles.errorBody}>
            The IndexedDB read failed. Tap Retry to try again — your stored logs
            haven't been touched.
          </p>
          <button
            type="button"
            onClick={() => setErrorDetailsOpen((v) => !v)}
            style={logStyles.errorDetailsToggle}
            aria-expanded={errorDetailsOpen}
          >
            {errorDetailsOpen ? "Hide details" : "Show details"}
          </button>
          {errorDetailsOpen ? (
            <pre style={logStyles.errorDetails}>{error ?? "Unknown error."}</pre>
          ) : null}
          <button
            type="button"
            onClick={() => void loadInitial()}
            style={{ ...secondaryButton, marginTop: "0.25rem" }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={logStyles.root}>
      <ShimmerKeyframes />
      <div style={logStyles.counterRow} aria-label="Loaded log summary">
        <span style={logStyles.counterPill}>Today: {counters.today}</span>
        <span style={logStyles.counterPill}>Past 7 days: {counters.pastSeven}</span>
      </div>

      {!hintDismissed && logs.length > 0 ? (
        <div style={logStyles.hintCard} role="note">
          <p style={logStyles.hintBody}>
            Confidence is the classifier's own estimate of how sure it is. Lower
            numbers (under ~60%) are worth a closer look.
          </p>
          <button
            type="button"
            onClick={dismissHint}
            style={logStyles.hintDismiss}
            aria-label="Dismiss confidence explanation"
          >
            Got it
          </button>
        </div>
      ) : null}

      <FilterRow
        verdictFilter={verdictFilter}
        onToggleVerdict={toggleVerdictFilter}
        todayOnly={todayOnly}
        onToggleToday={() => setTodayOnly((v) => !v)}
      />

      {filtersActive ? (
        <p style={logStyles.filteredCount} aria-live="polite">
          Showing {filteredLogs.length} of {logs.length} loaded
          {hasMore ? " — load older for more matches" : ""}.
        </p>
      ) : null}

      {logs.length === 0 ? (
        <EmptyState />
      ) : filteredLogs.length === 0 ? (
        <div style={logStyles.emptyBox}>
          <span style={logStyles.emptyTitle}>No matches in the loaded logs.</span>
          <span style={logStyles.emptyBody}>
            Adjust the filters above, or load older entries.
          </span>
        </div>
      ) : (
        <ul style={logStyles.list}>
          {grouped.map((group) => (
            <DayGroup
              key={group.dayStartMs}
              group={group}
              todayStartMs={todayStartMs}
              showConsent={syncOpts.logs}
              consentMap={consentMap}
              onToggleConsent={(id) => void toggleConsent(id)}
            />
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
          <>
            <p style={logStyles.destructiveCopy}>
              Clear all classifier logs on this device. This can't be undone.
            </p>
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
          </>
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
        {error && state === "ready" ? (
          <p style={errorText} role="status">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface FilterRowProps {
  verdictFilter: Set<Verdict>;
  onToggleVerdict: (verdict: Verdict) => void;
  todayOnly: boolean;
  onToggleToday: () => void;
}

function FilterRow({
  verdictFilter,
  onToggleVerdict,
  todayOnly,
  onToggleToday,
}: FilterRowProps) {
  return (
    <div style={logStyles.filtersWrap} role="group" aria-label="Log filters">
      <div style={logStyles.filterChipsRow}>
        {VERDICTS.map((verdict) => {
          const palette = VERDICT_COLORS[verdict];
          const active = verdictFilter.has(verdict);
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => onToggleVerdict(verdict)}
              style={logStyles.filterChip(active, palette)}
              aria-pressed={active}
              aria-label={`Filter by verdict ${palette.label}`}
            >
              {palette.label}
            </button>
          );
        })}
      </div>
      <div style={logStyles.todayToggleRow}>
        <span style={logStyles.toggleLabel}>Show today only</span>
        <button
          type="button"
          onClick={onToggleToday}
          style={logStyles.togglePill(todayOnly)}
          aria-pressed={todayOnly}
        >
          {todayOnly ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

interface DayGroupProps {
  group: GroupedDay;
  todayStartMs: number;
  showConsent: boolean;
  consentMap: Record<string, boolean>;
  onToggleConsent: (id: string) => void;
}

function DayGroup({
  group,
  todayStartMs,
  showConsent,
  consentMap,
  onToggleConsent,
}: DayGroupProps) {
  const relative = relativeDayLabel(group.dayStartMs, todayStartMs);
  const headerText = formatDayHeader(group.dayStartMs);
  return (
    <>
      <li style={logStyles.dayHeader} aria-label={`${headerText}, ${relative}`}>
        <span>{headerText}</span>
        <span style={logStyles.relativePill}>{relative}</span>
      </li>
      {group.rows.map((log) => (
        <LogRow
          key={log.id}
          log={log}
          showConsent={showConsent}
          consented={consentMap[log.id] === true}
          onToggleConsent={onToggleConsent}
        />
      ))}
    </>
  );
}

interface LogRowProps {
  log: ClassifierLogRecord;
  showConsent: boolean;
  consented: boolean;
  onToggleConsent: (id: string) => void;
}

const consentToggleStyle = (active: boolean): CSSProperties => ({
  appearance: "none",
  border: active ? "1px solid #166534" : "1px solid #d4d4d8",
  background: active ? "#dcfce7" : "#fff",
  color: active ? "#166534" : "#666",
  borderRadius: "999px",
  padding: "0.125rem 0.5rem",
  fontSize: "0.6875rem",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: "1.5rem",
  lineHeight: 1,
});

function LogRow({ log, showConsent, consented, onToggleConsent }: LogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const palette = VERDICT_COLORS[log.verdict];
  const canExpand = log.input.length > SHOW_MORE_THRESHOLD;
  const inputTextStyle: CSSProperties =
    canExpand && !expanded
      ? { ...logStyles.inputText, ...logStyles.inputClamp }
      : logStyles.inputText;
  const confidencePct = Math.round(
    Math.max(0, Math.min(1, log.confidence)) * 100,
  );
  const barFillStyle: CSSProperties = {
    width: `${confidencePct}%`,
    height: "100%",
    background: palette.fg,
    transition: "width 200ms ease-out",
  };

  const handleCopy = useCallback(async () => {
    const text = log.input ?? "";
    if (!text) return;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(text);
        setCopyState("copied");
      } else {
        setCopyState("failed");
      }
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  }, [log.input]);

  const hasInput = log.input.length > 0;

  return (
    <li style={logStyles.card}>
      <div style={logStyles.headerRow}>
        <span style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
          <span
            style={verdictChipStyle(log.verdict)}
            aria-label={`verdict: ${palette.label}`}
          >
            {palette.label}
          </span>
          {showConsent ? (
            <button
              type="button"
              onClick={() => onToggleConsent(log.id)}
              style={consentToggleStyle(consented)}
              aria-pressed={consented}
              aria-label={
                consented
                  ? "Revoke sync consent for this record"
                  : "Allow this record to sync to cloud"
              }
              title={
                consented
                  ? "Sync consent: ON (this row may be uploaded)"
                  : "Sync consent: OFF (this row stays local)"
              }
            >
              {consented ? "sync on" : "sync off"}
            </button>
          ) : null}
        </span>
        <div style={logStyles.confidenceWrap}>
          <span
            style={logStyles.confidence}
            aria-label={`Classifier confidence ${confidencePct} percent`}
          >
            {formatConfidence(log.confidence)}
          </span>
          <div
            style={logStyles.confidenceBarTrack}
            role="presentation"
            aria-hidden="true"
          >
            <div style={barFillStyle} />
          </div>
        </div>
      </div>
      <p style={inputTextStyle}>
        {hasInput ? log.input : <em style={{ color: "#888" }}>(no input captured)</em>}
      </p>
      <div style={logStyles.cardActions}>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={logStyles.showMoreButton}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        {hasInput ? (
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={logStyles.copyButton}
            aria-label="Copy question to clipboard"
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy question"}
          </button>
        ) : null}
      </div>
      <span style={logStyles.timestamp}>{formatTime(log.timestampMs)}</span>
    </li>
  );
}

function SkeletonRow() {
  return (
    <div style={logStyles.skeletonCard}>
      <div style={logStyles.skeletonRow}>
        <div style={logStyles.skeletonBlock("4.5rem", "1rem")} />
        <div style={logStyles.skeletonBlock("3rem", "1rem")} />
      </div>
      <div style={logStyles.skeletonBlock("100%")} />
      <div style={logStyles.skeletonBlock("80%")} />
      <div style={logStyles.skeletonBlock("40%", "0.75rem")} />
    </div>
  );
}

function EmptyState() {
  return (
    <div style={logStyles.emptyBox} role="status">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={logStyles.emptyIcon}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 14h4" />
      </svg>
      <span style={logStyles.emptyTitle}>No logs yet.</span>
      <span style={logStyles.emptyBody}>
        Once your kid uses the app, classifier verdicts and the original
        questions will appear here. Nothing leaves this device.
      </span>
    </div>
  );
}

function ShimmerKeyframes() {
  return (
    <style>{`@keyframes kidQuestShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
  );
}
