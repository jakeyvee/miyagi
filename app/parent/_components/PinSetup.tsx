"use client";

import { useState, type FormEvent } from "react";
import {
  generateSaltHex,
  hashPin,
  isValidPin,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
} from "@/lib/parent/pin";
import { writeStoredPin, type StoredPin } from "@/lib/parent/local-store";
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
  onPinSet: (pin: StoredPin) => void;
}

export function PinSetup({ onPinSet }: Props) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onlyDigits = (value: string): string =>
    value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!isValidPin(pin)) {
      setError(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits, numbers only.`);
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match.");
      return;
    }
    setBusy(true);
    try {
      const saltHex = generateSaltHex();
      const hashHex = await hashPin(pin, saltHex);
      const stored: StoredPin = { saltHex, hashHex };
      writeStoredPin(stored);
      onPinSet(stored);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={screen}>
      <h1 style={heading}>Set a parent PIN</h1>
      <p style={subheading}>
        This PIN unlocks parent controls on this device. There is no recovery —
        if you forget it, you will need to clear app data and start over.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label style={fieldLabel}>
          New PIN ({MIN_PIN_LENGTH}-{MAX_PIN_LENGTH} digits)
          <input
            style={input}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d*"
            minLength={MIN_PIN_LENGTH}
            maxLength={MAX_PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            required
            aria-invalid={error ? true : undefined}
          />
        </label>
        <label style={fieldLabel}>
          Confirm PIN
          <input
            style={input}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d*"
            minLength={MIN_PIN_LENGTH}
            maxLength={MAX_PIN_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(onlyDigits(e.target.value))}
            required
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error ? (
          <p style={errorText} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" style={primaryButton} disabled={busy}>
          {busy ? "Saving…" : "Save PIN"}
        </button>
        <p style={noteText}>
          Only a salted SHA-256 hash of your PIN is stored on this device.
        </p>
      </form>
    </main>
  );
}
