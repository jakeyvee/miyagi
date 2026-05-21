import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { getServerEnv } from "./env";

/**
 * Server-only Anthropic client singleton. Never import from a client component —
 * the `server-only` marker above will fail the build if you try.
 *
 * Route handlers call `getAnthropic()` so the SDK is constructed lazily, after
 * `getServerEnv()` has validated the key is present.
 */
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: getServerEnv().ANTHROPIC_API_KEY });
  }
  return client;
}
