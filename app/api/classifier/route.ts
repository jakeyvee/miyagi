import { NextResponse } from "next/server";
import type {
  ClassifierRequest,
  ClassifierResponse,
} from "@/lib/contracts";

/**
 * POST /api/classifier
 *
 * Stub route handler that establishes the server/client boundary.
 * OpenAI integration lives here in a follow-on ticket — never on the client.
 * Imports from `@/lib/server/*` (e.g. `getServerEnv`) belong in this file.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<ClassifierResponse | { error: string }>> {
  // Body is parsed against the shared contract so later wiring can rely on
  // the same shape, but the actual classifier call is deferred.
  let body: ClassifierRequest;
  try {
    body = (await request.json()) as ClassifierRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  void body;

  return NextResponse.json(
    { error: "not_implemented" },
    { status: 501 },
  );
}
