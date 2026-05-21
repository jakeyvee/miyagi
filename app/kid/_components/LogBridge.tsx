"use client";

import { useEffect } from "react";
import { startLogBridge } from "@/lib/parent/log-bridge";

/**
 * Mounted on the kid surface to forward session events into IndexedDB.
 * The bridge itself swallows write errors, so this component is invisible
 * even on storage failures and never affects the kid flow.
 */
export function LogBridge() {
  useEffect(() => {
    const stop = startLogBridge();
    return () => {
      stop();
    };
  }, []);
  return null;
}
