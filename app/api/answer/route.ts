import { NextResponse } from "next/server";
import { isAgeBand, type AgeBand, type AnswerRequest } from "@/lib/contracts";
import { getOpenAI } from "@/lib/server/openai";

const MODEL = "gpt-4o-mini";
const MIN_INPUT_LEN = 1;
const MAX_INPUT_LEN = 2000;

/**
 * POST /api/answer
 *
 * Streaming assistive helper. Provides short, friendly, age-band-aware
 * direct help — typing, formatting, vocab, factual recall — scoped to the
 * caller's `topicLock`. Response body is plain-text tokens.
 */
export async function POST(request: Request): Promise<Response> {
  let body: AnswerRequest;
  try {
    body = (await request.json()) as AnswerRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validationError = validateAnswerRequest(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
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

  const systemPrompt = buildAnswerSystemPrompt(body.ageBand, body.topicLock);

  let upstream;
  try {
    upstream = await openai.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.input },
      ],
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
        // Stream has already started; terminate it so the client sees EOF.
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

function validateAnswerRequest(body: AnswerRequest): string | null {
  if (typeof body?.input !== "string") return "invalid_input";
  if (body.input.length < MIN_INPUT_LEN || body.input.length > MAX_INPUT_LEN) {
    return "invalid_input";
  }
  if (typeof body.topicLock !== "string" || body.topicLock.trim().length === 0) {
    return "invalid_topic_lock";
  }
  if (!isAgeBand(body.ageBand)) return "invalid_age_band";
  return null;
}

function buildAnswerSystemPrompt(ageBand: AgeBand, topicLock: string): string {
  const tone = ageBandTone(ageBand);
  return [
    `You are a friendly homework helper for a child in the ${ageBand} age band.`,
    `The current topic is locked to: "${topicLock}". Only help with this topic.`,
    `${tone}`,
    `Give direct, useful help: spelling, typing, formatting, vocabulary, and factual recall are all fair game.`,
    `Keep replies short (1-3 sentences when possible). Use plain language. No emojis. No markdown headings.`,
    `If the kid's request is unrelated to "${topicLock}", briefly say so and steer back to the topic without scolding.`,
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
