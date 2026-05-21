/**
 * Tiny promise-timeout helper used by the kid surface to fall back to a
 * fixture when the live classifier hasn't returned in time.
 *
 * Returns a discriminated union rather than throwing on timeout, so the
 * caller can branch cleanly without try/catch noise. The original promise
 * is *not* cancelled — that's the caller's responsibility via the same
 * `AbortController` they passed into the underlying fetch.
 */

export type WithTimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" };

/**
 * Race `p` against a `ms`-ms timer. The returned promise always resolves —
 * it never rejects on timeout. If `p` rejects, the rejection propagates.
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<WithTimeoutResult<T>> {
  if (ms <= 0) {
    // Negative or zero timeout means "instant timeout" — resolve immediately
    // with timeout result and let the underlying promise settle on its own.
    return Promise.resolve({ ok: false as const, reason: "timeout" as const });
  }

  return new Promise<WithTimeoutResult<T>>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: "timeout" });
    }, ms);

    p.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Surface the underlying rejection — callers wrap fetch errors with
        // their own try/catch already. Timeout is the only "soft" outcome.
        reject(err);
      },
    );
  });
}
