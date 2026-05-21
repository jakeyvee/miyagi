"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ParentSettings } from "@/lib/contracts";
import {
  readParentLocalState,
  type StoredPin,
} from "@/lib/parent/local-store";
import { PinSetup } from "./PinSetup";
import { PinUnlock } from "./PinUnlock";
import { Settings } from "./Settings";
import { screen, subheading } from "./styles";

type Phase = "loading" | "setup" | "unlock" | "settings";

export function ParentFlow() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [storedPin, setStoredPin] = useState<StoredPin | null>(null);
  const [settings, setSettings] = useState<ParentSettings | null>(null);

  useEffect(() => {
    const state = readParentLocalState();
    setStoredPin(state.pin);
    setSettings(state.settings);
    setPhase(state.pin ? "unlock" : "setup");
  }, []);

  if (phase === "loading") {
    return (
      <main style={screen} aria-busy="true">
        <p style={subheading}>Loading parent controls…</p>
      </main>
    );
  }

  if (phase === "setup") {
    return (
      <>
        <TopNav />
        <PinSetup
          onPinSet={(pin) => {
            setStoredPin(pin);
            setPhase("settings");
          }}
        />
      </>
    );
  }

  if (phase === "unlock" && storedPin) {
    return (
      <>
        <TopNav />
        <PinUnlock storedPin={storedPin} onUnlock={() => setPhase("settings")} />
      </>
    );
  }

  return (
    <>
      <TopNav />
      <Settings initial={settings} onSaved={(next) => setSettings(next)} />
    </>
  );
}

function TopNav() {
  return (
    <nav style={{ padding: "1rem 1.5rem 0", maxWidth: "30rem", margin: "0 auto", width: "100%" }}>
      <Link href="/" style={{ color: "#555", fontSize: "0.875rem" }}>
        ← Home
      </Link>
    </nav>
  );
}
