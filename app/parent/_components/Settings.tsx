"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AGE_BANDS, type AgeBand, type ParentSettings } from "@/lib/contracts";
import { writeParentSettings } from "@/lib/parent/local-store";
import {
  errorText,
  fieldLabel,
  heading,
  input,
  noteText,
  primaryButton,
  screen,
  secondaryButton,
  segmentedButton,
  segmentedGroup,
  subheading,
} from "./styles";

interface Props {
  initial: ParentSettings | null;
  onSaved: (next: ParentSettings) => void;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_SETTINGS: ParentSettings = {
  topicLock: "",
  ageBand: "7-9",
  studyTimeWindow: { startHHMM: "16:00", endHHMM: "18:00" },
};

export function Settings({ initial, onSaved }: Props) {
  const seed = initial ?? DEFAULT_SETTINGS;
  const [topicLock, setTopicLock] = useState(seed.topicLock);
  const [ageBand, setAgeBand] = useState<AgeBand>(seed.ageBand);
  const [startHHMM, setStartHHMM] = useState(seed.studyTimeWindow.startHHMM);
  const [endHHMM, setEndHHMM] = useState(seed.studyTimeWindow.endHHMM);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ParentSettings | null>(initial);

  const hasSavedSettings = saved !== null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedTopic = topicLock.trim();
    if (trimmedTopic.length === 0) {
      setError("Topic lock cannot be empty.");
      return;
    }
    if (!HHMM_RE.test(startHHMM) || !HHMM_RE.test(endHHMM)) {
      setError("Times must be in HH:MM 24-hour format.");
      return;
    }
    if (startHHMM === endHHMM) {
      setError("Study window start and end cannot be the same time.");
      return;
    }

    const next: ParentSettings = {
      topicLock: trimmedTopic,
      ageBand,
      studyTimeWindow: { startHHMM, endHHMM },
    };
    writeParentSettings(next);
    setTopicLock(trimmedTopic);
    setSaved(next);
    onSaved(next);
  }

  return (
    <main style={screen}>
      <h1 style={heading}>Parent settings</h1>
      <p style={subheading}>
        Controls apply on this device only. Save before handing the device to
        your kid.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label style={fieldLabel}>
          Topic lock
          <input
            style={input}
            type="text"
            value={topicLock}
            onChange={(e) => setTopicLock(e.target.value)}
            placeholder="e.g. multiplication tables"
            maxLength={120}
            required
          />
        </label>

        <div style={fieldLabel}>
          <span>Age band</span>
          <div style={segmentedGroup} role="radiogroup" aria-label="Age band">
            {AGE_BANDS.map((band) => {
              const active = ageBand === band;
              return (
                <button
                  key={band}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAgeBand(band)}
                  style={segmentedButton(active)}
                >
                  {band}
                </button>
              );
            })}
          </div>
        </div>

        <label style={fieldLabel}>
          Study window starts (HH:MM)
          <input
            style={input}
            type="time"
            value={startHHMM}
            onChange={(e) => setStartHHMM(e.target.value)}
            required
          />
        </label>
        <label style={fieldLabel}>
          Study window ends (HH:MM)
          <input
            style={input}
            type="time"
            value={endHHMM}
            onChange={(e) => setEndHHMM(e.target.value)}
            required
          />
        </label>

        {error ? (
          <p style={errorText} role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" style={primaryButton}>
          Save settings
        </button>
      </form>

      {hasSavedSettings ? (
        <Link href="/kid" style={secondaryButton}>
          Hand to kid →
        </Link>
      ) : (
        <p style={noteText}>Save settings to enable handing the device to your kid.</p>
      )}
    </main>
  );
}
