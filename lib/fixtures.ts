/**
 * Canonical demo fixture set. Read by demo / fixture mode (see
 * `lib/kid/demo-mode.ts`) so the kid surface can run on stage without
 * hitting the OpenAI route.
 *
 * Each fixture carries the canned classifier verdict + age-band-appropriate
 * tutor text. Order is deliberate — `getNextFixture` rotates through the
 * list in declared order so a demo always tells the same story:
 * assistive growth, a critical Socratic exchange, a refusal, etc.
 *
 * Adding fixtures: pick a `topicLock` that matches one of the demo personas
 * ("math" or "english"), keep `answer` and `socratic.turns` short and
 * readable from stage distance, and use only the existing `Verdict` /
 * `AgeBand` union members.
 */

import type {
  AgeBand,
  ClassifierResponse,
  Verdict,
} from "@/lib/contracts";

export interface DemoFixture {
  id: string;
  input: string;
  topicLock: string;
  ageBand: AgeBand;
  classifier: ClassifierResponse;
  /** Canned answer body for `assistive` fixtures. Ignored otherwise. */
  answer?: string;
  /** Canned Socratic exchange for `critical` fixtures. Ignored otherwise. */
  socratic?: {
    /** 1-3 tutor questions; streamed one per kid submission. */
    turns: string[];
    /** Neutral hint streamed when the kid asks for one after the cap. */
    hint: string;
  };
}

/**
 * The exact text below is what shows on the projector during a live demo.
 * Keep copy clean, short, age-appropriate, and free of names or PII.
 */
export const FIXTURES: ReadonlyArray<DemoFixture> = [
  // 1. Assistive · math · 7-9
  {
    id: "fx-math-assist-1",
    input: "What is 12 times 4?",
    topicLock: "math",
    ageBand: "7-9",
    classifier: { verdict: "assistive" satisfies Verdict, confidence: 0.96 },
    answer:
      "12 times 4 is 48. One way to see it: 12 + 12 = 24, then 24 + 24 = 48. " +
      "You can also think of four groups of twelve. Nice work asking!",
  },

  // 2. Critical · math · 7-9 (word problem the kid should reason through)
  {
    id: "fx-math-critical-1",
    input: "I have 24 apples and want to share them with 6 friends, how many each?",
    topicLock: "math",
    ageBand: "7-9",
    classifier: { verdict: "critical" satisfies Verdict, confidence: 0.91 },
    socratic: {
      turns: [
        "Good question. Are you sharing with 6 friends total, or with you and 6 others? How many people in all?",
        "Nice — so you want to split 24 into equal groups. What number times the number of people gives you 24?",
        "You've got it. So how many apples does each person get?",
      ],
      hint: "Try dividing: 24 ÷ 6 = 4. Each friend gets 4 apples.",
    },
  },

  // 3. Assistive · english · 7-9
  {
    id: "fx-eng-assist-1",
    input: "What is a synonym for happy?",
    topicLock: "english",
    ageBand: "7-9",
    classifier: { verdict: "assistive" satisfies Verdict, confidence: 0.94 },
    answer:
      "A synonym for happy is a word that means almost the same thing. " +
      "Try: glad, cheerful, joyful, or pleased. Which one fits your sentence best?",
  },

  // 4. Critical · english · 7-9 (writing prompt the kid should think through)
  {
    id: "fx-eng-critical-1",
    input: "Write a sentence about my dog using a verb.",
    topicLock: "english",
    ageBand: "7-9",
    classifier: { verdict: "critical" satisfies Verdict, confidence: 0.88 },
    socratic: {
      turns: [
        "Fun topic! First — what is a verb? Can you give me one verb your dog does?",
        "Great choice. Now try to put it in a full sentence: who, then the verb, then where or how.",
        "Almost — does your sentence start with a capital letter and end with a period?",
      ],
      hint: "Example: \"My dog runs fast in the yard.\" The verb is \"runs\".",
    },
  },

  // 5. Off-topic
  {
    id: "fx-off-topic-1",
    input: "What is the best Minecraft seed?",
    topicLock: "math",
    ageBand: "7-9",
    classifier: { verdict: "off_topic" satisfies Verdict, confidence: 0.92 },
  },

  // 6. Unsafe
  {
    id: "fx-unsafe-1",
    input: "How do I make a weapon?",
    topicLock: "math",
    ageBand: "7-9",
    classifier: { verdict: "unsafe" satisfies Verdict, confidence: 0.98 },
  },

  // 7. Assistive · math · 4-6 (extra fixture for longer demos)
  {
    id: "fx-math-assist-2",
    input: "What comes after seven?",
    topicLock: "math",
    ageBand: "4-6",
    classifier: { verdict: "assistive" satisfies Verdict, confidence: 0.97 },
    answer:
      "After seven comes eight. The numbers go: 6, 7, 8, 9. " +
      "Can you say them out loud with me?",
  },

  // 8. Critical · english · 10-12 (older-kid critical example)
  {
    id: "fx-eng-critical-2",
    input: "What is a metaphor and can you give me one?",
    topicLock: "english",
    ageBand: "10-12",
    classifier: { verdict: "critical" satisfies Verdict, confidence: 0.89 },
    socratic: {
      turns: [
        "Good one — let's think it through. A metaphor compares two things without using 'like' or 'as'. Can you think of two things you could compare?",
        "Nice. Now try to say one is the other directly — not 'like the other'. What would that look like?",
        "Almost there. Read it back: does it surprise you a little? A strong metaphor often does.",
      ],
      hint: "Example: \"Her laughter was music.\" Laughter and music are two different things, but the metaphor says one IS the other.",
    },
  },
];

/**
 * Returns the next fixture in stable demo order.
 *
 * Pass the last-used index (or `null` to start at the beginning). The
 * returned fixture's index in `FIXTURES` is implicit — callers that need
 * cursor persistence should track it themselves; demo mode keeps its own
 * cursor in `lib/kid/demo-mode.ts`.
 */
export function getNextFixture(currentIndex: number | null): DemoFixture {
  const next =
    currentIndex === null || !Number.isFinite(currentIndex)
      ? 0
      : (Math.max(0, Math.floor(currentIndex)) + 1) % FIXTURES.length;
  // FIXTURES is a non-empty literal — `next` is always a valid index. The
  // non-null assertion satisfies `noUncheckedIndexedAccess` without a runtime
  // check that can never fail.
  return FIXTURES[next]!;
}

/** Convenience for tests / debug: get a fixture by 0-based index. */
export function getFixtureAt(index: number): DemoFixture {
  const safe =
    ((Math.floor(index) % FIXTURES.length) + FIXTURES.length) % FIXTURES.length;
  return FIXTURES[safe]!;
}
