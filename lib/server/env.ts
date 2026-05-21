import "server-only";

/**
 * Server-only env access. Importing this file from a client component will
 * fail the build, so OpenAI keys can never reach the browser bundle.
 *
 * Later tickets that wire the classifier should read via `getServerEnv()`
 * rather than touching `process.env` directly so the missing-key error stays
 * consistent.
 */
export interface ServerEnv {
  OPENAI_API_KEY: string;
}

export function getServerEnv(): ServerEnv {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return { OPENAI_API_KEY: openAiKey };
}
