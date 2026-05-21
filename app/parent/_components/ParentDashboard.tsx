"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ParentSettings } from "@/lib/contracts";
import { ClassifierLogViewer } from "./ClassifierLogViewer";
import { Settings } from "./Settings";
import { heading, screen } from "./styles";

type Tab = "settings" | "logs";

const TAB_STORAGE_KEY = "kid-quest:parent:lastTab";

interface Props {
  initialSettings: ParentSettings | null;
  onSettingsSaved: (next: ParentSettings) => void;
}

const tabShell: CSSProperties = {
  padding: "1rem 1.5rem 0",
  maxWidth: "30rem",
  margin: "0 auto",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  background: "#f4f4f5",
  padding: "0.25rem",
  borderRadius: "0.75rem",
};

const tabButton = (active: boolean): CSSProperties => ({
  flex: 1,
  appearance: "none",
  border: "none",
  background: active ? "#fff" : "transparent",
  color: active ? "#111" : "#555",
  borderRadius: "0.5rem",
  padding: "0.625rem 0.5rem",
  fontSize: "0.9375rem",
  fontWeight: active ? 600 : 500,
  cursor: "pointer",
  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
});

const logsPanelHeading: CSSProperties = { ...heading };

function isTab(value: unknown): value is Tab {
  return value === "settings" || value === "logs";
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

export function ParentDashboard({ initialSettings, onSettingsSaved }: Props) {
  const [tab, setTab] = useState<Tab>("settings");

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
        </div>
      </div>

      {tab === "settings" ? (
        <div role="tabpanel" id="parent-tab-settings" aria-labelledby="parent-tabbtn-settings">
          <Settings initial={initialSettings} onSaved={onSettingsSaved} />
        </div>
      ) : (
        <main
          style={screen}
          role="tabpanel"
          id="parent-tab-logs"
          aria-labelledby="parent-tabbtn-logs"
        >
          <h1 style={logsPanelHeading}>Classifier logs</h1>
          <ClassifierLogViewer />
        </main>
      )}
    </>
  );
}
