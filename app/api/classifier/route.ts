import { NextResponse } from "next/server";

import {
  isAgeBand,
  isVerdict,
  VERDICTS,
  type ClassifierRequest,
  type ClassifierResponse,
} from "@/lib/contracts";
import { getAnthropic } from "@/lib/server/anthropic";

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
 * The Anthropic SDK is only ever imported from this file (via
 * `@/lib/server/anthropic`). API keys never reach the client bundle.
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_LENGTH = 2000;
const MAX_OUTPUT_TOKENS = 256;

const CLASSIFY_TOOL = {
  name: "record_classification",
  description:
    "Record the classification verdict and confidence for the kid's input.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: {
        type: "string",
        enum: [...VERDICTS],
        description:
          "One of: assistive, critical, off_topic, unsafe (see system prompt).",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Calibration confidence in [0,1].",
      },
    },
    required: ["verdict", "confidence"],
    additionalProperties: false,
  },
};

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
    "Call the `record_classification` tool with exactly one verdict and a",
    "confidence in [0,1]. Do not respond in prose.",
  ].join("\n");
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
  // `sessionId` is optional; reject only if present and not a string.
  if (v.sessionId !== undefined && typeof v.sessionId !== "string") {
    return false;
  }
  return true;
}

function extractToolResult(content: readonly unknown[]): ClassifierResponse | null {
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    if (block.type !== "tool_use") continue;
    if (block.name !== CLASSIFY_TOOL.name) continue;
    const input = block.input as Partial<ClassifierResponse> | undefined;
    if (!input || typeof input !== "object") continue;
    if (!isVerdict(input.verdict)) continue;
    const c = input.confidence;
    if (typeof c !== "number" || Number.isNaN(c) || c < 0 || c > 1) continue;
    return { verdict: input.verdict, confidence: c };
  }
  return null;
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

  let anthropic;
  try {
    anthropic = getAnthropic();
  } catch {
    // getServerEnv() throws when ANTHROPIC_API_KEY is missing — fail closed so
    // the kid surface never silently degrades to "no classifier".
    return NextResponse.json(
      { error: "missing_provider_env" },
      { status: 503 },
    );
  }

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: buildSystemPrompt(topicLock, ageBand),
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: CLASSIFY_TOOL.name },
      messages: [{ role: "user", content: input }],
    });
  } catch {
    return NextResponse.json({ error: "classifier_failed" }, { status: 502 });
  }

  const result = extractToolResult(response.content);
  if (!result) {
    return NextResponse.json({ error: "classifier_failed" }, { status: 502 });
  }

  return NextResponse.json(result, { status: 200 });
}
