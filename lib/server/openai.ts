import "server-only";

import OpenAI from "openai";

import { getServerEnv } from "./env";

/**
 * Server-only OpenAI client singleton. Never import from a client component —
 * the `server-only` marker above will fail the build if you try.
 *
 * Route handlers call `getOpenAI()` so the SDK is constructed lazily, after
 * `getServerEnv()` has validated the key is present.
 */
let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
  }
  return client;
}
