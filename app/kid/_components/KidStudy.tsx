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
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
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
import {
  fakeStreamFromText,
  makeSessionId,
  streamResponseText,
} from "@/lib/kid/streaming";
import { withTimeout } from "@/lib/kid/timeout";
import {
  advanceFixtureCursor,
  isDemoModeEnabled,
  useDemoMode,
} from "@/lib/kid/demo-mode";
import type { DemoFixture } from "@/lib/fixtures";
import {
  echoBubble,
  errorText,
  giveAnswerButton,
  hintButton,
  inputRow,
  link,
  noteText,
  refusalBubble,
  responseArea,
  screen,
  screenInner,
  socraticControls,
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
/** Live classifier must answer within this window or demo mode swaps in a fixture. */
const CLASSIFIER_TIMEOUT_MS = 5000;
/** Long-press threshold for the hidden stage-recovery gesture. */
const LONG_PRESS_MS = 800;

/** Source of the currently-displayed verdict chip — drives the status dot. */
type VerdictSource = "none" | "live" | "fixture";

export function KidStudy() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [settings, setSettings] = useState<ParentSettings | null>(null);

  const [draft, setDraft] = useState<string>("");
  const [submittedInput, setSubmittedInput] = useState<string | null>(null);
  const [streamText, setStreamText] = useState<string>("");
  const [verdict, setVerdict] = useState<ClassifierResponse | null>(null);
  const [verdictSource, setVerdictSource] = useState<VerdictSource>("none");
  const [socratic, setSocratic] = useState<SocraticState>(EMPTY_SOCRATIC);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Demo-mode is reactive so a parent toggling it in another tab takes
  // effect on the kid surface immediately on the next submission.
  const demoMode = useDemoMode();
  const demoModeRef = useRef<boolean>(demoMode);
  useEffect(() => {
    demoModeRef.current = demoMode;
  }, [demoMode]);

  const sessionIdRef = useRef<string>(makeSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks the fixture currently being replayed (if any) so the Socratic
  // hint button can stream its canned hint instead of hitting the route.
  const activeFixtureRef = useRef<DemoFixture | null>(null);
  // Counts how many tutor turns we've replayed for the current fixture
  // critical exchange, so we can stop at SOCRATIC_TURN_CAP and surface
  // the hint button just like the live path.
  const fixtureTutorTurnsRef = useRef<number>(0);
  // Tree slot ref + long-press / multi-touch state for the hidden
  // stage-recovery gesture (only active in demo mode).
  const treeSlotRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const activePointersRef = useRef<Set<number>>(new Set());
  const gestureFiredThisGestureRef = useRef<boolean>(false);

  // 1. Hydrate parent settings on mount.
  useEffect(() => {
    const state = readParentLocalState();
    if (!state.settings) {
      setPhase("no-settings");
      return;
    }
    setSettings(state.settings);
    setPhase("ready");
  }, []);

  // 2. Autofocus the input when ready.
  useEffect(() => {
    if (phase === "ready" && !busy) {
      inputRef.current?.focus();
    }
  }, [phase, busy]);

  const resetForNewSubmission = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamText("");
    setVerdict(null);
    setVerdictSource("none");
    setRefusal(null);
    setErrorMessage(null);
    setSocratic(EMPTY_SOCRATIC);
    activeFixtureRef.current = null;
    fixtureTutorTurnsRef.current = 0;
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
      opts?: { suppressGrowth?: boolean },
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
      // Suggest a tree state change so the tree hook can advance one stage.
      // Suppressed by the "Give me answer now" bypass, which has already
      // applied its own (shrink) consequence and must not be cancelled out.
      if (!opts?.suppressGrowth) {
        emit({
          type: "tree_state_changed",
          sessionId: sessionIdRef.current,
          timestampMs: Date.now(),
          state: "sapling",
        });
      }
    },
    [],
  );

  /** Streams a canned text into the stream panel via fakeStreamFromText. */
  const runFixtureFakeStream = useCallback(
    async (text: string, signal: AbortSignal): Promise<void> => {
      for await (const chunk of fakeStreamFromText(text, { signal })) {
        if (signal.aborted) return;
        setStreamText((prev) => prev + chunk);
      }
    },
    [],
  );

  /** Replay path for an assistive fixture. Mirrors runAnswerStream. */
  const runFixtureAnswerStream = useCallback(
    async (fixture: DemoFixture, signal: AbortSignal): Promise<void> => {
      const text = fixture.answer ?? "";
      await runFixtureFakeStream(text, signal);
      if (signal.aborted) return;
      emit({
        type: "tree_state_changed",
        sessionId: sessionIdRef.current,
        timestampMs: Date.now(),
        state: "sapling",
      });
    },
    [runFixtureFakeStream],
  );

  /**
   * Replay path for a critical fixture. Yields the next canned tutor turn
   * from `fixture.socratic.turns`. Honors SOCRATIC_TURN_CAP — once the
   * fixture's tutor turns are exhausted (or the cap is reached), reports
   * capReached so the host surface shows the "Want a hint?" button.
   */
  const runFixtureSocraticStream = useCallback(
    async (
      fixture: DemoFixture,
      signal: AbortSignal,
    ): Promise<{ capReached: boolean; tutorText: string }> => {
      const turns = fixture.socratic?.turns ?? [];
      const turnIndex = fixtureTutorTurnsRef.current;
      // No more canned turns (either ran out or hit the global cap) — same
      // shape the live route returns when it sends `{ capReached: true }`.
      if (turnIndex >= turns.length || turnIndex >= SOCRATIC_TURN_CAP) {
        return { capReached: true, tutorText: "" };
      }
      const text = turns[turnIndex] ?? "";
      await runFixtureFakeStream(text, signal);
      if (signal.aborted) return { capReached: false, tutorText: text };
      fixtureTutorTurnsRef.current = turnIndex + 1;
      const capReached =
        fixtureTutorTurnsRef.current >= turns.length ||
        fixtureTutorTurnsRef.current >= SOCRATIC_TURN_CAP;
      return { capReached, tutorText: text };
    },
    [runFixtureFakeStream],
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

  /**
   * Plays a fixture through the kid flow as if a live classifier had
   * returned its verdict. Used by:
   *   - the demo-mode bypass at submission time,
   *   - the 5s timeout fallback,
   *   - the hidden stage-recovery gesture (where the fixture's own input
   *     replaces the kid's draft so the on-screen exchange stays coherent).
   *
   * `reason` is for the console.info tag — the privacy/runbook agent reads
   * these to confirm fixture replays during stage drills.
   */
  const runFixtureFlow = useCallback(
    async (
      fixture: DemoFixture,
      reason: "demo_bypass" | "timeout" | "gesture",
      signal: AbortSignal,
    ): Promise<void> => {
      if (!settings) return;
      activeFixtureRef.current = fixture;
      fixtureTutorTurnsRef.current = 0;

      setVerdict(fixture.classifier);
      setVerdictSource("fixture");

      // eslint-disable-next-line no-console
      console.info(
        `[kid-quest demo] fixture fallback fired (reason=${reason} verdict=${fixture.classifier.verdict} fixture=${fixture.id})`,
      );

      emit({
        type: "classifier_verdict",
        sessionId: sessionIdRef.current,
        timestampMs: Date.now(),
        verdict: fixture.classifier.verdict,
        confidence: fixture.classifier.confidence,
      });

      switch (fixture.classifier.verdict) {
        case "assistive":
          await runFixtureAnswerStream(fixture, signal);
          return;
        case "critical": {
          const result = await runFixtureSocraticStream(fixture, signal);
          const nextTurns: SocraticTurn[] = [
            { role: "kid", text: fixture.input },
          ];
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
    [settings, runFixtureAnswerStream, runFixtureSocraticStream],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!settings || busy) return;

      const trimmed = draft.trim();
      const nonWs = trimmed.replace(/\s+/g, "");
      if (trimmed.length === 0) return;
      if (trimmed.length > MAX_INPUT_CHARS) {
        setErrorMessage("That's a bit too long. Try a shorter question.");
        return;
      }

      // If the kid is mid-Socratic loop, this submission is the next "kid"
      // turn — short answers like "8" or "36" are valid here, so the
      // min-length check does NOT apply. Skip the classifier and feed it
      // straight to /api/socratic (or the active fixture's canned tutor
      // turns).
      if (socratic.active && !socratic.capReached) {
        await continueSocratic(trimmed);
        return;
      }

      // Fresh question: enforce the min-length rule so an accidental
      // single keystroke doesn't get classified as a real prompt.
      if (nonWs.length < MIN_NON_WHITESPACE) {
        setErrorMessage("Try a longer question (a few words).");
        return;
      }

      // Fresh exchange: clear prior state and prepare a new abort controller.
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

      // Demo / fixture-mode bypass: skip the live classifier entirely and
      // play the next canned fixture as if it had returned.
      if (demoModeRef.current) {
        try {
          const fixture = advanceFixtureCursor();
          await runFixtureFlow(fixture, "demo_bypass", controller.signal);
        } catch (cause) {
          if (!controller.signal.aborted) {
            setErrorMessage(kidReadableError(cause));
          }
        } finally {
          setBusy(false);
          if (abortRef.current === controller) abortRef.current = null;
        }
        return;
      }

      try {
        const classifierPromise = callClassifier(
          trimmed,
          settings.ageBand,
          settings.topicLock,
          controller.signal,
        );
        const raced = await withTimeout(classifierPromise, CLASSIFIER_TIMEOUT_MS);

        if (!raced.ok) {
          // Timed out. Demo-mode fallback: silently swap to the next
          // fixture. Outside demo mode there's nothing to do — surface a
          // neutral error and let the kid retry.
          if (isDemoModeEnabled()) {
            // Cancel the in-flight classifier — its eventual response is
            // moot now.
            controller.abort();
            const newController = new AbortController();
            abortRef.current = newController;
            const fixture = advanceFixtureCursor();
            await runFixtureFlow(fixture, "timeout", newController.signal);
          } else {
            setErrorMessage(kidReadableError(new Error("classifier_timeout")));
          }
          return;
        }

        const classifierResult = raced.value;
        setVerdict(classifierResult);
        setVerdictSource("live");
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
    [draft, settings, busy, socratic, runFixtureFlow],
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
        // Fixture-mode continuation: replay the next canned tutor turn
        // instead of hitting /api/socratic.
        const activeFixture = activeFixtureRef.current;
        let result: { capReached: boolean; tutorText: string };
        if (activeFixture && activeFixture.socratic) {
          result = await runFixtureSocraticStream(
            activeFixture,
            controller.signal,
          );
        } else {
          result = await runSocraticStream(
            kidText,
            settings,
            priorTurns,
            false,
            controller.signal,
          );
        }
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
    [settings, socratic.priorTurns, runSocraticStream, runFixtureSocraticStream],
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

  /**
   * "Give me answer now" — the kid bails out of the Socratic loop. Tree
   * shrinks one stage and the brute-force counter ticks up (wilt at 2,
   * dead at 3). Then we still stream the assistive answer to the original
   * critical question so the kid actually gets the help — at a cost.
   */
  const handleGiveMeAnswer = useCallback(async () => {
    if (!settings || busy) return;
    const firstKidTurn = socratic.priorTurns.find((t) => t.role === "kid");
    const input = firstKidTurn?.text ?? submittedInput ?? "";
    if (!input) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setErrorMessage(null);
    setStreamText("");

    emit({
      type: "kid_demanded_answer",
      sessionId: sessionIdRef.current,
      timestampMs: Date.now(),
    });

    try {
      const activeFixture = activeFixtureRef.current;
      if (activeFixture && activeFixture.answer) {
        // fakeStream doesn't emit a growth event — nothing to suppress here.
        await runFixtureFakeStream(activeFixture.answer, controller.signal);
      } else {
        await runAnswerStream(input, settings, controller.signal, {
          suppressGrowth: true,
        });
      }
      // End the Socratic loop — the kid took the bypass; there's nothing
      // left to be Socratic about.
      setSocratic(EMPTY_SOCRATIC);
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
  }, [
    settings,
    busy,
    socratic.priorTurns,
    submittedInput,
    runAnswerStream,
    runFixtureFakeStream,
  ]);

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
      const activeFixture = activeFixtureRef.current;
      if (activeFixture && activeFixture.socratic) {
        await runFixtureFakeStream(
          activeFixture.socratic.hint,
          controller.signal,
        );
      } else {
        await runSocraticStream(
          input,
          settings,
          socratic.priorTurns,
          true,
          controller.signal,
        );
      }
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
  }, [
    settings,
    busy,
    socratic.priorTurns,
    submittedInput,
    runSocraticStream,
    runFixtureFakeStream,
  ]);

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

  /**
   * Hidden stage-recovery affordance. Two triggers (whichever fires first):
   *   1. Three simultaneous touches on the tree slot.
   *   2. A single >=800ms long-press on the tree slot.
   * Both are gated on demo mode, completely silent (no visual hint), and
   * advance the fixture cursor by one, then replay the new fixture as if
   * the kid had typed `fixture.input`. No-op outside demo mode.
   */
  const triggerStageRecoveryGesture = useCallback(() => {
    if (!demoModeRef.current) return;
    if (!settings) return;
    if (gestureFiredThisGestureRef.current) return;
    gestureFiredThisGestureRef.current = true;

    // Cancel anything in flight. Start a fresh exchange just like a normal
    // submission — but route through the fixture flow.
    resetForNewSubmission();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setDraft("");

    const fixture = advanceFixtureCursor();
    setSubmittedInput(fixture.input);

    emit({
      type: "kid_input_submitted",
      sessionId: sessionIdRef.current,
      timestampMs: Date.now(),
      input: fixture.input,
    });

    void (async () => {
      try {
        await runFixtureFlow(fixture, "gesture", controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setErrorMessage(kidReadableError(cause));
        }
      } finally {
        setBusy(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
  }, [settings, resetForNewSubmission, runFixtureFlow]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTreePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!demoModeRef.current) return;
      activePointersRef.current.add(event.pointerId);
      // Three simultaneous pointers — fire immediately. Reset gesture
      // latch on the FIRST pointer down so a fresh gesture can fire.
      if (activePointersRef.current.size === 1) {
        gestureFiredThisGestureRef.current = false;
        // Start long-press timer on first pointer down.
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          triggerStageRecoveryGesture();
        }, LONG_PRESS_MS);
      } else if (activePointersRef.current.size >= 3) {
        clearLongPressTimer();
        triggerStageRecoveryGesture();
      }
    },
    [clearLongPressTimer, triggerStageRecoveryGesture],
  );

  const releaseTreePointer = useCallback(
    (pointerId: number) => {
      activePointersRef.current.delete(pointerId);
      if (activePointersRef.current.size === 0) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer],
  );

  const handleTreePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      releaseTreePointer(event.pointerId);
    },
    [releaseTreePointer],
  );

  const handleTreePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      releaseTreePointer(event.pointerId);
    },
    [releaseTreePointer],
  );

  const handleTreePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      releaseTreePointer(event.pointerId);
    },
    [releaseTreePointer],
  );

  /**
   * iOS Safari sometimes does not raise pointerdown for the 2nd/3rd touch
   * when the first is held — keep a parallel touch-event listener so the
   * three-finger gesture still fires there. Touch and pointer handlers
   * don't conflict because we gate on demoMode and the fired-latch.
   */
  const handleTreeTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!demoModeRef.current) return;
      if (event.touches.length >= 3) {
        clearLongPressTimer();
        triggerStageRecoveryGesture();
      }
    },
    [clearLongPressTimer, triggerStageRecoveryGesture],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const canSubmit = useMemo(() => {
    if (!settings || busy) return false;
    const nonWs = draft.trim().replace(/\s+/g, "").length;
    if (nonWs === 0) return false;
    // Mid-Socratic replies can be as short as "8" — only the initial
    // question gets the min-length gate.
    if (socratic.active && !socratic.capReached) return true;
    return nonWs >= MIN_NON_WHITESPACE;
  }, [settings, busy, draft, socratic.active, socratic.capReached]);

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
          <p
            style={{
              ...noteText,
              fontFamily: "var(--font-display)",
              fontSize: "20px",
              fontStyle: "italic",
              color: "var(--color-text-primary)",
              textAlign: "center",
            }}
          >
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

  const dotColor =
    verdictSource === "live"
      ? "var(--color-accent)"
      : verdictSource === "fixture"
        ? "#d97706"
        : "var(--color-text-on-surface-mute)";

  return (
    <main style={screen}>
      <div style={screenInner}>
        <div
          ref={treeSlotRef}
          style={treeSlot}
          data-slot="tree"
          onPointerDown={handleTreePointerDown}
          onPointerUp={handleTreePointerUp}
          onPointerCancel={handleTreePointerCancel}
          onPointerLeave={handleTreePointerLeave}
          onTouchStart={handleTreeTouchStart}
        >
          <Tree />
        </div>

        <div
          style={verdictSlot}
          data-slot="verdict-chip"
          data-fixture-event={verdictSource === "fixture" ? "1" : "0"}
          data-verdict-source={verdictSource}
          aria-live="polite"
        >
          {verdict ? (
            <>
              <span
                aria-hidden="true"
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "50%",
                  background: dotColor,
                  display: "inline-block",
                  flex: "0 0 auto",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--color-text-primary)",
                }}
              >
                {verdict.verdict}
              </span>
              <span
                style={{ color: "var(--color-text-on-surface-mute)" }}
                aria-hidden="true"
              >
                ·
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  color: "var(--color-text-secondary)",
                }}
              >
                {Math.round(verdict.confidence * 100)}% conf
              </span>
            </>
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: "0.5rem",
                height: "0.5rem",
                borderRadius: "50%",
                background: dotColor,
                display: "inline-block",
              }}
            />
          )}
        </div>

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

          {socratic.active && !busy ? (
            <div style={socraticControls}>
              {socratic.capReached ? (
                <button
                  type="button"
                  style={hintButton}
                  onClick={() => void handleWantHint()}
                >
                  Want a hint?
                </button>
              ) : null}
              <button
                type="button"
                style={giveAnswerButton}
                onClick={() => void handleGiveMeAnswer()}
                aria-label="Give me the answer now — this will shrink your tree"
              >
                Give me answer now (−1 🌳)
              </button>
            </div>
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
            placeholder="Type your question…"
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
