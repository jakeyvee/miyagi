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
 * Async generator that yields a string in small chunks (~5-20 chars each)
 * with a short delay between chunks so the kid surface's stream UI animates
 * naturally during a demo. Used by fixture / demo mode (see
 * `lib/kid/demo-mode.ts`) in place of a live `Response.body` stream.
 *
 * Honors `opts.signal`: when aborted, the iterator terminates cleanly on
 * the next chunk boundary. Default token delay is 28ms — slow enough to
 * read but fast enough that a long answer finishes inside a typical demo
 * beat.
 */
export interface FakeStreamOptions {
  /** ms between chunks. Defaults to 28. Use 0 for tests. */
  tokenDelayMs?: number;
  /** Optional cancellation. The iterator stops on the next chunk. */
  signal?: AbortSignal;
}

export async function* fakeStreamFromText(
  text: string,
  opts: FakeStreamOptions = {},
): AsyncIterable<string> {
  const delay = opts.tokenDelayMs ?? 28;
  if (text.length === 0) return;

  let i = 0;
  while (i < text.length) {
    if (opts.signal?.aborted) return;
    // Random chunk size in [5, 20]. Lower bound clamped to text remaining.
    const remaining = text.length - i;
    const chunkSize = Math.max(
      1,
      Math.min(remaining, 5 + Math.floor(Math.random() * 16)),
    );
    const chunk = text.slice(i, i + chunkSize);
    i += chunkSize;
    yield chunk;
    if (delay > 0 && i < text.length) {
      await sleep(delay, opts.signal);
      if (opts.signal?.aborted) return;
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort);
  });
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
