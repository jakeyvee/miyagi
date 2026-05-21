import type { AgeBand } from "./age-band";

export interface AnswerRequest {
  input: string;
  topicLock: string;
  ageBand: AgeBand;
}

export type SocraticTurnRole = "kid" | "tutor";
export interface SocraticTurn {
  role: SocraticTurnRole;
  text: string;
}

/** Max 3 tutor turns; after that the kid can request a hint. */
export const SOCRATIC_TURN_CAP = 3;

export interface SocraticRequest {
  input: string;
  topicLock: string;
  ageBand: AgeBand;
  /** Prior turns in this exchange. Empty for first kid turn. */
  priorTurns: SocraticTurn[];
  /** If true, kid hit the cap and is requesting a neutral hint. */
  wantHint?: boolean;
}
