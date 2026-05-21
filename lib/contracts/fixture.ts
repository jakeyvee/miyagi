import type { ClassifierResponse } from "./classifier";

/**
 * Canned input/response pair used by fixture/demo mode so the kid surface
 * can run without hitting the OpenAI route. Wired up by a later ticket.
 */
export interface FixtureRecord {
  id: string;
  input: string;
  response: ClassifierResponse;
}
