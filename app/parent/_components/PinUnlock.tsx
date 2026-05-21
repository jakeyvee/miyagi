"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  hashPin,
  isValidPin,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  safeEqualHex,
} from "@/lib/parent/pin";
import type { StoredPin } from "@/lib/parent/local-store";
import {
  errorText,
  fieldLabel,
  heading,
  input,
  noteText,
  primaryButton,
  screen,
  subheading,
} from "./styles";

interface Props {
  storedPin: StoredPin;
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

export function PinUnlock({ storedPin, onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownLeft]);

  const locked = cooldownLeft > 0;

  const onlyDigits = (value: string): string =>
    value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (locked) return;
    if (!isValidPin(pin)) {
      setError(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits.`);
      return;
    }
    setBusy(true);
    try {
      const candidate = await hashPin(pin, storedPin.saltHex);
      if (safeEqualHex(candidate, storedPin.hashHex)) {
        setAttempts(0);
        setPin("");
        onUnlock();
        return;
      }
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPin("");
      if (nextAttempts >= MAX_ATTEMPTS) {
        setCooldownLeft(COOLDOWN_SECONDS);
        setAttempts(0);
        setError(
          `Too many tries. Wait ${COOLDOWN_SECONDS}s before trying again.`,
        );
      } else {
        const remaining = MAX_ATTEMPTS - nextAttempts;
        setError(`Wrong PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={screen}>
      <h1 style={heading}>Enter parent PIN</h1>
      <p style={subheading}>
        Unlock parent controls on this device.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label style={fieldLabel}>
          PIN
          <input
            style={input}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="\d*"
            minLength={MIN_PIN_LENGTH}
            maxLength={MAX_PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            disabled={locked || busy}
            required
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error ? (
          <p style={errorText} role="alert">
            {error}
            {locked ? ` (${cooldownLeft}s)` : ""}
          </p>
        ) : null}
        <button type="submit" style={primaryButton} disabled={locked || busy}>
          {busy ? "Checking…" : locked ? `Locked (${cooldownLeft}s)` : "Unlock"}
        </button>
        <p style={noteText}>
          No PIN recovery. If you forget it, clear app data on this device to
          reset.
        </p>
      </form>
    </main>
  );
}
