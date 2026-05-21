/**
 * Client-only PIN helpers. Uses Web Crypto (SubtleCrypto) — no new deps.
 *
 * The plaintext PIN never leaves this module; callers receive only a
 * { saltHex, hashHex } pair to persist.
 */

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;
const SALT_BYTES = 16;

function getCrypto(): Crypto {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is unavailable in this environment.");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export function isValidPin(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length < MIN_PIN_LENGTH || value.length > MAX_PIN_LENGTH) return false;
  return /^\d+$/.test(value);
}

export function generateSaltHex(): string {
  const c = getCrypto();
  const salt = new Uint8Array(SALT_BYTES);
  c.getRandomValues(salt);
  return bytesToHex(salt);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  if (!isValidPin(pin)) {
    throw new Error("PIN must be 4-6 digits.");
  }
  const c = getCrypto();
  const data = new TextEncoder().encode(`${saltHex}:${pin}`);
  const digest = await c.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/** Constant-time string comparison to avoid leaking length-prefix matches. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
