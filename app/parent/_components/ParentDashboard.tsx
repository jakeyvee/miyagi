"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ParentSettings } from "@/lib/contracts";
import { setDemoMode, useDemoMode } from "@/lib/kid/demo-mode";
import { ClassifierLogViewer } from "./ClassifierLogViewer";
import { Settings } from "./Settings";
import { SyncPanel } from "./SyncPanel";
import { heading, screen } from "./styles";

type Tab = "settings" | "logs" | "sync";

const TAB_STORAGE_KEY = "kid-quest:parent:lastTab";

interface Props {
  initialSettings: ParentSettings | null;
  onSettingsSaved: (next: ParentSettings) => void;
}

const tabShell: CSSProperties = {
  padding: "var(--space-5) var(--space-5) 0",
  maxWidth: "32rem",
  margin: "0 auto",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: "var(--space-1)",
  background: "var(--color-surface-soft)",
  padding: "4px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border)",
};

const tabButton = (active: boolean): CSSProperties => ({
  flex: 1,
  appearance: "none",
  border: "none",
  background: active ? "var(--color-primary)" : "transparent",
  color: active ? "var(--color-secondary)" : "var(--color-text-secondary)",
  borderRadius: "var(--radius-pill)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  transition: "background 200ms var(--ease-out), color 200ms var(--ease-out)",
});

const logsPanelHeading: CSSProperties = { ...heading };

function isTab(value: unknown): value is Tab {
  return value === "settings" || value === "logs" || value === "sync";
}

function readPersistedTab(): Tab {
  if (typeof window === "undefined") return "settings";
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return isTab(raw) ? raw : "settings";
  } catch {
    return "settings";
  }
}

function persistTab(tab: Tab): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // localStorage may be disabled (private mode quota, etc.) — ignore.
  }
}

const demoFooter: CSSProperties = {
  padding: "var(--space-4) var(--space-5) var(--space-5)",
  maxWidth: "32rem",
  margin: "0 auto",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  boxSizing: "border-box",
};

const demoLinkButton: CSSProperties = {
  appearance: "none",
  background: "none",
  border: "none",
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  padding: 0,
  alignSelf: "flex-start",
};

const demoPanel: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  padding: "var(--space-3) var(--space-4)",
  background: "var(--color-surface-soft)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  fontSize: "13px",
  color: "var(--color-text-secondary)",
};

const demoSwitchRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

export function ParentDashboard({ initialSettings, onSettingsSaved }: Props) {
  const [tab, setTab] = useState<Tab>("settings");
  const [demoPanelOpen, setDemoPanelOpen] = useState<boolean>(false);
  const demoOn = useDemoMode();

  useEffect(() => {
    setTab(readPersistedTab());
  }, []);

  function selectTab(next: Tab) {
    setTab(next);
    persistTab(next);
  }

  return (
    <>
      <div style={tabShell}>
        <div style={tabBarStyle} role="tablist" aria-label="Parent dashboard sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            aria-controls="parent-tab-settings"
            id="parent-tabbtn-settings"
            onClick={() => selectTab("settings")}
            style={tabButton(tab === "settings")}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "logs"}
            aria-controls="parent-tab-logs"
            id="parent-tabbtn-logs"
            onClick={() => selectTab("logs")}
            style={tabButton(tab === "logs")}
          >
            Logs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sync"}
            aria-controls="parent-tab-sync"
            id="parent-tabbtn-sync"
            onClick={() => selectTab("sync")}
            style={tabButton(tab === "sync")}
          >
            Sync
          </button>
        </div>
      </div>

      {tab === "settings" ? (
        <div role="tabpanel" id="parent-tab-settings" aria-labelledby="parent-tabbtn-settings">
          <Settings initial={initialSettings} onSaved={onSettingsSaved} />
          <div style={demoFooter}>
            <button
              type="button"
              style={demoLinkButton}
              aria-expanded={demoPanelOpen}
              aria-controls="parent-demo-panel"
              onClick={() => setDemoPanelOpen((v) => !v)}
            >
              Demo mode
            </button>
            {demoPanelOpen ? (
              <div id="parent-demo-panel" style={demoPanel} role="group" aria-label="Demo mode controls">
                <div style={demoSwitchRow}>
                  <input
                    id="parent-demo-toggle"
                    type="checkbox"
                    checked={demoOn}
                    onChange={(e) => setDemoMode(e.target.checked)}
                  />
                  <label htmlFor="parent-demo-toggle">
                    Replay fixtures on the kid surface (stage/demo only)
                  </label>
                </div>
                <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                  When on, the kid surface skips the live tutor and plays a canned
                  fixture instead. Leave off for normal use.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : tab === "logs" ? (
        <main
          style={screen}
          role="tabpanel"
          id="parent-tab-logs"
          aria-labelledby="parent-tabbtn-logs"
        >
          <h1 style={logsPanelHeading}>Classifier logs</h1>
          <ClassifierLogViewer />
        </main>
      ) : (
        <div
          role="tabpanel"
          id="parent-tab-sync"
          aria-labelledby="parent-tabbtn-sync"
        >
          <SyncPanel />
        </div>
      )}
    </>
  );
}
