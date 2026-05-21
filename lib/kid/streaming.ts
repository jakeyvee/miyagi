/**
 * Helpers for consuming streaming `text/plain` responses from
 * `/api/answer` and `/api/socratic`. Decodes bytes via `TextDecoder`,
 * dispatches per-token text to a callback, and honours an
 * `AbortController` so the kid surface can cancel mid-flight (e.g. when
 * the study window closes or the kid resubmits).
 */

export interface StreamTextOptions {
  /** Called with each decoded text chunk as it arrives. */
  onToken: (text: string) => void;
  /** Optional abort signal; aborts surface as `AbortError`. */
  signal?: AbortSignal;
}

/**
 * Drains a `Response.body` ReadableStream into the `onToken` callback.
 * Resolves with the full concatenated string when the stream ends.
 *
 * Throws if the response has no body, if the signal aborts, or if the
 * underlying reader errors.
 */
export async function streamResponseText(
  response: Response,
  { onToken, signal }: StreamTextOptions,
): Promise<string> {
  if (!response.body) {
    throw new Error("stream_missing_body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  const onAbort = () => {
    // Cancel the reader so the underlying connection tears down.
    reader.cancel().catch(() => {
      /* reader may already be released */
    });
  };
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const text = decoder.decode(value, { stream: true });
        if (text) {
          full += text;
          onToken(text);
        }
      }
    }
    // Flush any trailing bytes the decoder was holding.
    const tail = decoder.decode();
    if (tail) {
      full += tail;
      onToken(tail);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  return full;
}

/**
 * Generates a short opaque id for tagging session events. Avoids pulling
 * in a UUID dependency for the kid surface.
 */
export function makeSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
