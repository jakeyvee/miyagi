import { NextResponse } from "next/server";
import {
  isAgeBand,
  SOCRATIC_TURN_CAP,
  type AgeBand,
  type SocraticRequest,
  type SocraticTurn,
} from "@/lib/contracts";
import { getOpenAI } from "@/lib/server/openai";

const MODEL = "gpt-4o-mini";
const MIN_INPUT_LEN = 1;
const MAX_INPUT_LEN = 2000;

/**
 * POST /api/socratic
 *
 * Streaming Socratic helper. Asks a guiding question or reflects the
 * kid's thought back — never gives the answer outright. After
 * `SOCRATIC_TURN_CAP` tutor turns the route returns `{ capReached: true }`
 * so the client can offer a hint affordance; passing `wantHint: true`
 * unlocks a single concrete hint that still avoids the full solution.
 */
export async function POST(request: Request): Promise<Response> {
  let body: SocraticRequest;
  try {
    body = (await request.json()) as SocraticRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validationError = validateSocraticRequest(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const tutorTurnCount = body.priorTurns.filter(
    (t) => t.role === "tutor",
  ).length;
  if (tutorTurnCount >= SOCRATIC_TURN_CAP && body.wantHint !== true) {
    return NextResponse.json({ capReached: true }, { status: 200 });
  }

  let openai;
  try {
    openai = getOpenAI();
  } catch {
    return NextResponse.json(
      { error: "missing_provider_env" },
      { status: 503 },
    );
  }

  const systemPrompt = body.wantHint
    ? buildHintSystemPrompt(body.ageBand, body.topicLock)
    : buildSocraticSystemPrompt(body.ageBand, body.topicLock);

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];
  for (const turn of body.priorTurns) {
    messages.push({
      role: turn.role === "tutor" ? "assistant" : "user",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: body.input });

  let upstream;
  try {
    upstream = await openai.chat.completions.create({
      model: MODEL,
      stream: true,
      messages,
    });
  } catch {
    return NextResponse.json({ error: "stream_failed" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(delta));
          }
        }
        controller.close();
      } catch {
        controller.error(new Error("stream_failed"));
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateSocraticRequest(body: SocraticRequest): string | null {
  if (typeof body?.input !== "string") return "invalid_input";
  if (body.input.length < MIN_INPUT_LEN || body.input.length > MAX_INPUT_LEN) {
    return "invalid_input";
  }
  if (typeof body.topicLock !== "string" || body.topicLock.trim().length === 0) {
    return "invalid_topic_lock";
  }
  if (!isAgeBand(body.ageBand)) return "invalid_age_band";
  if (!Array.isArray(body.priorTurns)) return "invalid_prior_turns";
  for (const turn of body.priorTurns) {
    if (!isSocraticTurn(turn)) return "invalid_prior_turns";
  }
  if (body.wantHint !== undefined && typeof body.wantHint !== "boolean") {
    return "invalid_want_hint";
  }
  return null;
}

function isSocraticTurn(value: unknown): value is SocraticTurn {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.role === "kid" || v.role === "tutor") && typeof v.text === "string"
  );
}

function buildSocraticSystemPrompt(ageBand: AgeBand, topicLock: string): string {
  return [
    `You are a Socratic tutor for a child in the ${ageBand} age band.`,
    `The current topic is locked to: "${topicLock}".`,
    ageBandTone(ageBand),
    `NEVER give the final answer. NEVER do the work for the kid.`,
    `Ask ONE short guiding question, or reflect the kid's last thought back so they can think again.`,
    `Stay focused on "${topicLock}". If the kid drifts off-topic, gently steer them back with a question.`,
    `Keep replies to 1-2 sentences. Plain language. No emojis. No markdown.`,
  ].join(" ");
}

function buildHintSystemPrompt(ageBand: AgeBand, topicLock: string): string {
  return [
    `You are a Socratic tutor for a child in the ${ageBand} age band who has been stuck for several turns on the topic "${topicLock}".`,
    ageBandTone(ageBand),
    `Give ONE small, concrete hint that nudges them toward the next step.`,
    `Do NOT solve the problem. Do NOT give the final answer. Leave the last step for the kid.`,
    `Keep the hint to 1-2 short sentences. Plain language. No emojis. No markdown.`,
  ].join(" ");
}

function ageBandTone(ageBand: AgeBand): string {
  switch (ageBand) {
    case "4-6":
      return "Use very simple words and very short sentences. Be warm and gentle.";
    case "7-9":
      return "Use simple words. Be encouraging and clear.";
    case "10-12":
      return "Use clear, age-appropriate language. Be concise and respectful.";
  }
}
