"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  AnswerRequest,
  ClassifierRequest,
  ClassifierResponse,
  ParentSettings,
  SocraticRequest,
  SocraticTurn,
  Verdict,
} from "@/lib/contracts";
import { isVerdict, SOCRATIC_TURN_CAP } from "@/lib/contracts";
import { readParentLocalState } from "@/lib/parent/local-store";
import { emit } from "@/lib/kid/session-events";
import { isInsideWindow } from "@/lib/kid/study-window";
import { makeSessionId, streamResponseText } from "@/lib/kid/streaming";
import {
  echoBubble,
  errorText,
  hintButton,
  inputRow,
  link,
  lockedBanner,
  noteText,
  refusalBubble,
  responseArea,
  screen,
  screenInner,
  streamPanel,
  submitButton,
  submitButtonDisabled,
  textInput,
  treeSlot,
  verdictSlot,
} from "./styles";
import { Tree } from "./Tree";

/**
 * Mobile kid study surface. Owns:
 *  - Parent-settings hydration from localStorage.
 *  - Study-window gating (recomputed every 30s while the surface is open).
 *  - Typed-only kid input -> classifier -> route to answer / Socratic /
 *    refusal copy.
 *  - Streaming token render for answer + Socratic responses, including the
 *    Socratic turn cap and hint affordance.
 *
 * Stable DOM slots for downstream tickets:
 *  - `data-slot="tree"`           -> VOL-184 tree visuals
 *  - `data-slot="verdict-chip"`   -> VOL-186 verdict/confidence chip
 *  - `data-slot="stream-output"`  -> VOL-184/185 listen via session events
 *
 * Session events emitted via `lib/kid/session-events`:
 *  - kid_input_submitted
 *  - classifier_verdict
 *  - tree_state_changed (suggestion on successful assistive stream-end)
 *  - session_ended (on parent-set window close)
 *
 * NOTE: No microphone, no provider keys, no audio path. Typed text only.
 */

type LoadPhase = "loading" | "ready" | "no-settings";

interface SocraticState {
  active: boolean;
  priorTurns: SocraticTurn[];
  capReached: boolean;
}

const EMPTY_SOCRATIC: SocraticState = {
  active: false,
  priorTurns: [],
  capReached: false,
};

const MIN_NON_WHITESPACE = 3;
const MAX_INPUT_CHARS = 2000;

export function KidStudy() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [settings, setSettings] = useState<ParentSettings | null>(null);
  const [insideWindow, setInsideWindow] = useState<boolean>(false);

  const [draft, setDraft] = useState<string>("");
  const [submittedInput, setSubmittedInput] = useState<string | null>(null);
  const [streamText, setStreamText] = useState<string>("");
  const [verdict, setVerdict] = useState<ClassifierResponse | null>(null);
  const [socratic, setSocratic] = useState<SocraticState>(EMPTY_SOCRATIC);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const sessionIdRef = useRef<string>(makeSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const windowClosedNotifiedRef = useRef<boolean>(false);

  // 1. Hydrate parent settings on mount.
  useEffect(() => {
    const state = readParentLocalState();
    if (!state.settings) {
      setPhase("no-settings");
      return;
    }
    setSettings(state.settings);
    setInsideWindow(isInsideWindow(new Date(), state.settings.studyTimeWindow));
    setPhase("ready");
  }, []);

  // 2. Re-check the study window every 30s while the surface is open so the
  //    kid loses access promptly when the parent's window closes.
  useEffect(() => {
    if (!settings) return;
    const tick = () => {
      const open = isInsideWindow(new Date(), settings.studyTimeWindow);
      setInsideWindow(open);
    };
    tick();
    const handle = window.setInterval(tick, 30_000);
    return () => window.clearInterval(handle);
  }, [settings]);

  // 3. When the window closes, abort any in-flight stream and emit a
  //    `session_ended` event exactly once per session.
  useEffect(() => {
    if (!settings) return;
    if (insideWindow) {
      windowClosedNotifiedRef.current = false;
      return;
    }
    if (windowClosedNotifiedRef.current) return;
    windowClosedNotifiedRef.current = true;
    abortRef.current?.abort();
    emit({
      type: "session_ended",
      sessionId: sessionIdRef.current,
      timestampMs: Date.now(),
      reason: "time_window_closed",
    });
  }, [insideWindow, settings]);

  // 4. Autofocus the input when ready and the window is open.
  useEffect(() => {
    if (phase === "ready" && insideWindow && !busy) {
      inputRef.current?.focus();
    }
  }, [phase, insideWindow, busy]);

  const resetForNewSubmission = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamText("");
    setVerdict(null);
    setRefusal(null);
    setErrorMessage(null);
    setSocratic(EMPTY_SOCRATIC);
  }, []);

  const callClassifier = useCallback(
    async (
      input: string,
      ageBand: ParentSettings["ageBand"],
      topicLock: string,
      signal: AbortSignal,
    ): Promise<ClassifierResponse> => {
      const body: ClassifierRequest = { input, topicLock, ageBand };
      const response = await fetch("/api/classifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        throw new Error(`classifier_http_${response.status}`);
      }
      const parsed = (await response.json()) as Partial<ClassifierResponse>;
      if (
        !parsed ||
        typeof parsed.confidence !== "number" ||
        !isVerdict(parsed.verdict)
      ) {
        throw new Error("classifier_bad_payload");
      }
      return { verdict: parsed.verdict, confidence: parsed.confidence };
    },
    [],
  );

  const runAnswerStream = useCallback(
    async (
      input: string,
      activeSettings: ParentSettings,
      signal: AbortSignal,
    ) => {
      const body: AnswerRequest = {
        input,
        topicLock: activeSettings.topicLock,
        ageBand: activeSettings.ageBand,
      };
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        throw new Error(`answer_http_${response.status}`);
      }
      await streamResponseText(response, {
        signal,
        onToken: (chunk) => setStreamText((prev) => prev + chunk),
      });
      // Suggest a tree state change so VOL-184 can react. We pick "sapling"
      // as a placeholder mid-state — VOL-184 will compute the real cadence.
      emit({
        type: "tree_state_changed",
        sessionId: sessionIdRef.current,
        timestampMs: Date.now(),
        state: "sapling",
      });
    },
    [],
  );

  const runSocraticStream = useCallback(
    async (
      input: string,
      activeSettings: ParentSettings,
      priorTurns: SocraticTurn[],
      wantHint: boolean,
      signal: AbortSignal,
    ): Promise<{ capReached: boolean; tutorText: string }> => {
      const body: SocraticRequest = {
        input,
        topicLock: activeSettings.topicLock,
        ageBand: activeSettings.ageBand,
        priorTurns,
        ...(wantHint ? { wantHint: true } : {}),
      };
      const response = await fetch("/api/socratic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        throw new Error(`socratic_http_${response.status}`);
      }
      // The socratic route may return JSON `{ capReached: true }` instead
      // of a token stream when the tutor cap has been hit and the kid
      // hasn't asked for a hint.
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const parsed = (await response.json()) as { capReached?: boolean };
        if (parsed.capReached === true) {
          return { capReached: true, tutorText: "" };
        }
        throw new Error("socratic_bad_payload");
      }
      let buffered = "";
      await streamResponseText(response, {
        signal,
        onToken: (chunk) => {
          buffered += chunk;
          setStreamText((prev) => prev + chunk);
        },
      });
      return { capReached: false, tutorText: buffered };
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!settings || !insideWindow || busy) return;

      const trimmed = draft.trim();
      const nonWs = trimmed.replace(/\s+/g, "");
      if (trimmed.length === 0) return;
      if (nonWs.length < MIN_NON_WHITESPACE) {
        setErrorMessage("Try a longer question (a few words).");
        return;
      }
      if (trimmed.length > MAX_INPUT_CHARS) {
        setErrorMessage("That's a bit too long. Try a shorter question.");
        return;
      }

      // If the kid is mid-Socratic loop, this submission is the next "kid"
      // turn — skip the classifier and feed it straight to /api/socratic.
      if (socratic.active && !socratic.capReached) {
        await continueSocratic(trimmed);
        return;
      }

      // Fresh exchange: clear prior state and run the classifier.
      resetForNewSubmission();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setSubmittedInput(trimmed);
      setDraft("");

      emit({
        type: "kid_input_submitted",
        sessionId: sessionIdRef.current,
        timestampMs: Date.now(),
        input: trimmed,
      });

      try {
        const classifierResult = await callClassifier(
          trimmed,
          settings.ageBand,
          settings.topicLock,
          controller.signal,
        );
        setVerdict(classifierResult);
        emit({
          type: "classifier_verdict",
          sessionId: sessionIdRef.current,
          timestampMs: Date.now(),
          verdict: classifierResult.verdict,
          confidence: classifierResult.confidence,
        });

        await routeVerdict(classifierResult.verdict, trimmed, controller.signal);
      } catch (cause) {
        if (controller.signal.aborted) {
          // Aborts are expected when the window closes or the kid
          // resubmits — no error copy needed.
        } else {
          setErrorMessage(kidReadableError(cause));
        }
      } finally {
        setBusy(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, settings, insideWindow, busy, socratic],
  );

  /** Continues a Socratic exchange with a new kid turn. */
  const continueSocratic = useCallback(
    async (kidText: string) => {
      if (!settings) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setErrorMessage(null);
      setRefusal(null);
      setSubmittedInput(kidText);
      setStreamText("");
      setDraft("");

      const priorTurns: SocraticTurn[] = socratic.priorTurns;

      emit({
        type: "kid_input_submitted",
        sessionId: sessionIdRef.current,
        timestampMs: Date.now(),
        input: kidText,
      });

      try {
        const result = await runSocraticStream(
          kidText,
          settings,
          priorTurns,
          false,
          controller.signal,
        );
        const nextTurns: SocraticTurn[] = [
          ...priorTurns,
          { role: "kid", text: kidText },
        ];
        if (result.tutorText.trim().length > 0) {
          nextTurns.push({ role: "tutor", text: result.tutorText });
        }
        setSocratic({
          active: true,
          priorTurns: nextTurns,
          capReached: result.capReached,
        });
      } catch (cause) {
        if (!controller.signal.aborted) {
          setErrorMessage(kidReadableError(cause));
        }
      } finally {
        setBusy(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [settings, socratic.priorTurns, runSocraticStream],
  );

  /** Routes the classifier verdict to streaming, refusal, or Socratic. */
  const routeVerdict = useCallback(
    async (v: Verdict, input: string, signal: AbortSignal) => {
      if (!settings) return;
      switch (v) {
        case "assistive":
          await runAnswerStream(input, settings, signal);
          return;
        case "critical": {
          // Kick off the Socratic loop with the kid's first turn.
          const result = await runSocraticStream(
            input,
            settings,
            [],
            false,
            signal,
          );
          const nextTurns: SocraticTurn[] = [{ role: "kid", text: input }];
          if (result.tutorText.trim().length > 0) {
            nextTurns.push({ role: "tutor", text: result.tutorText });
          }
          setSocratic({
            active: true,
            priorTurns: nextTurns,
            capReached: result.capReached,
          });
          return;
        }
        case "off_topic":
          setRefusal(
            `Let's stay with ${settings.topicLock}. Try a different question.`,
          );
          return;
        case "unsafe":
          setRefusal("We can't help with that. Ask a grown-up.");
          return;
      }
    },
    [settings, runAnswerStream, runSocraticStream],
  );

  /** Hint affordance — calls /api/socratic with wantHint: true. */
  const handleWantHint = useCallback(async () => {
    if (!settings || busy) return;
    const lastKidTurn = [...socratic.priorTurns]
      .reverse()
      .find((t) => t.role === "kid");
    const input = lastKidTurn?.text ?? submittedInput ?? "";
    if (!input) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setErrorMessage(null);
    setStreamText("");

    try {
      await runSocraticStream(
        input,
        settings,
        socratic.priorTurns,
        true,
        controller.signal,
      );
      // Hint path is neutral — no growth, no wilt. Leave Socratic
      // state as capReached so a fresh question starts a new exchange.
    } catch (cause) {
      if (!controller.signal.aborted) {
        setErrorMessage(kidReadableError(cause));
      }
    } finally {
      setBusy(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [settings, busy, socratic.priorTurns, submittedInput, runSocraticStream]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Plain Enter submits; Shift+Enter inserts a newline. Mirrors the
      // common chat-input idiom and keeps the hit target the full button.
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (!settings || !insideWindow || busy) return false;
    if (draft.trim().replace(/\s+/g, "").length < MIN_NON_WHITESPACE) {
      return false;
    }
    return true;
  }, [settings, insideWindow, busy, draft]);

  if (phase === "loading") {
    return (
      <main style={screen} aria-busy="true">
        <div style={screenInner}>
          <div style={treeSlot} data-slot="tree">
            <Tree />
          </div>
        </div>
      </main>
    );
  }

  if (phase === "no-settings") {
    return (
      <main style={screen}>
        <div style={screenInner}>
          <div style={treeSlot} data-slot="tree">
            <Tree />
          </div>
          <p style={{ ...noteText, fontSize: "1rem", color: "#222" }}>
            Ask the grown-up to set things up before you start.
          </p>
          <p style={noteText}>
            <Link href="/parent" style={link}>
              Open parent controls →
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={screen}>
      <div style={screenInner}>
        <div style={treeSlot} data-slot="tree">
          <Tree />
        </div>

        <div style={verdictSlot} data-slot="verdict-chip" aria-live="polite">
          {verdict
            ? `Verdict: ${verdict.verdict} (${Math.round(verdict.confidence * 100)}%)`
            : " "}
        </div>

        {!insideWindow ? (
          <div style={lockedBanner} role="status">
            Study time is closed. Come back during your study window.
          </div>
        ) : null}

        <section style={responseArea} aria-label="Tutor response">
          {submittedInput ? (
            <div style={echoBubble} aria-label="Your question">
              {submittedInput}
            </div>
          ) : null}

          {refusal ? (
            <div style={refusalBubble} role="status">
              {refusal}
            </div>
          ) : null}

          {streamText || socratic.active || busy ? (
            <div
              style={streamPanel}
              data-slot="stream-output"
              aria-live="polite"
            >
              {streamText || (busy ? "Thinking…" : "")}
            </div>
          ) : null}

          {socratic.active && socratic.capReached && !busy ? (
            <button
              type="button"
              style={hintButton}
              onClick={() => void handleWantHint()}
            >
              Want a hint?
            </button>
          ) : null}

          {errorMessage ? (
            <p style={errorText} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>

        <form onSubmit={(e) => void handleSubmit(e)} style={inputRow}>
          <label htmlFor="kid-input" style={{ display: "none" }}>
            Ask a question
          </label>
          <textarea
            id="kid-input"
            ref={inputRef}
            style={textInput}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              insideWindow ? "Type your question…" : "Study time is closed"
            }
            disabled={!insideWindow}
            maxLength={MAX_INPUT_CHARS}
            inputMode="text"
            autoComplete="off"
            spellCheck
            rows={2}
            aria-label="Ask a question"
          />
          <button
            type="submit"
            style={canSubmit ? submitButton : submitButtonDisabled}
            disabled={!canSubmit}
            aria-label="Send question"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
        <p style={noteText}>
          Type your question. Press Enter to send. No microphone.
        </p>
      </div>
    </main>
  );
}

function kidReadableError(_cause: unknown): string {
  // Keep copy neutral and short. Surface stays interactive — the kid can
  // edit the textarea and try again.
  return "Something went wrong. Try again in a moment.";
}
