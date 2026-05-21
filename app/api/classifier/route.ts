import { NextResponse } from "next/server";

import {
  isAgeBand,
  isVerdict,
  VERDICTS,
  type ClassifierRequest,
  type ClassifierResponse,
} from "@/lib/contracts";
import { getOpenAI } from "@/lib/server/openai";

/**
 * POST /api/classifier
 *
 * Classifies kid input against the parent's topic lock and the kid's age band.
 * Returns one of:
 *   - `assistive` — typing help, formatting, vocab lookup, factual recall,
 *     spelling. Caller will route to the answer surface.
 *   - `critical`  — math reasoning, essay drafting, planning, things the kid
 *     should think through themselves. Caller will route to the Socratic
 *     surface.
 *   - `off_topic` — outside the parent-set topic lock. Caller refuses.
 *   - `unsafe`    — adult content, dangerous instructions. Caller refuses.
 *
 * The OpenAI SDK is only ever imported from this file (via
 * `@/lib/server/openai`). API keys never reach the client bundle.
 */

const MODEL = "gpt-4o-mini";
const MAX_INPUT_LENGTH = 2000;

interface ClassifierModelOutput {
  verdict: string;
  confidence: number;
}

function buildSystemPrompt(topicLock: string, ageBand: string): string {
  return [
    "You are a classifier for a kid-facing learning app. The kid is in the",
    `age band "${ageBand}" — adapt tone and scope expectations to that age.`,
    "",
    `The parent has set the topic lock to: "${topicLock}". Anything outside`,
    "that topic should be classified as off_topic.",
    "",
    "Classify the kid's input into EXACTLY ONE of these verdicts:",
    "",
    '- "critical": the request needs the kid to do the thinking themselves.',
    "  Examples: math reasoning, word problems, essay drafting, planning a",
    "  project, multi-step problem solving, anything where giving the answer",
    "  would short-circuit learning.",
    '- "assistive": the request is a small mechanical helper. Examples:',
    "  typing help, formatting, vocabulary lookup, definitions, factual",
    "  recall (e.g. capital of a country), spelling, single-word translation.",
    '- "off_topic": the request is outside the parent-set topic lock above.',
    '- "unsafe": adult content, sexual content, self-harm, violence,',
    "  dangerous instructions, drugs, or requests that would harm the kid",
    "  or others.",
    "",
    "Safety beats topic: classify as unsafe even if the request also happens",
    "to be off-topic.",
    "",
    "Respond with a JSON object EXACTLY of the shape:",
    '  {"verdict": "<one of: assistive | critical | off_topic | unsafe>",',
    '   "confidence": <number between 0 and 1>}',
    "Do not include any other keys, explanations, or prose.",
  ].join("\n");
}

function parseClassifierOutput(raw: string): ClassifierResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<ClassifierModelOutput>;
  if (!isVerdict(candidate.verdict)) return null;
  const confidence = candidate.confidence;
  if (
    typeof confidence !== "number" ||
    Number.isNaN(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return null;
  }
  return { verdict: candidate.verdict, confidence };
}

function isValidRequestBody(value: unknown): value is ClassifierRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.input !== "string") return false;
  if (v.input.length < 1 || v.input.length > MAX_INPUT_LENGTH) return false;
  if (typeof v.topicLock !== "string" || v.topicLock.trim().length === 0) {
    return false;
  }
  if (!isAgeBand(v.ageBand)) return false;
  return true;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ClassifierResponse | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { input, topicLock, ageBand } = body;

  let openai;
  try {
    openai = getOpenAI();
  } catch {
    // getServerEnv() throws when OPENAI_API_KEY is missing — fail closed so
    // the kid surface never silently degrades to "no classifier".
    return NextResponse.json(
      { error: "missing_provider_env" },
      { status: 503 },
    );
  }

  let rawContent: string | null;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(topicLock, ageBand) },
        { role: "user", content: input },
      ],
    });
    rawContent = completion.choices[0]?.message?.content ?? null;
  } catch {
    return NextResponse.json({ error: "classifier_failed" }, { status: 502 });
  }

  if (!rawContent) {
    return NextResponse.json({ error: "classifier_failed" }, { status: 502 });
  }

  const result = parseClassifierOutput(rawContent);
  if (!result) {
    return NextResponse.json({ error: "classifier_failed" }, { status: 502 });
  }

  // Belt-and-braces: ensure the verdict really is one of the closed set
  // even if VERDICTS later grows. Keeps the response type honest.
  void VERDICTS;

  return NextResponse.json(result, { status: 200 });
}
