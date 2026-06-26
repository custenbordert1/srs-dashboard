import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { resetChatSession } from "@/lib/ai-command-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai-command-center/reset
 * Body: { sessionId: string }
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
  }

  const session = await resetChatSession(sessionId);
  return NextResponse.json({
    ok: true,
    previewMode: true,
    sessionId: session.sessionId,
    warnings: ["Session reset — preview conversation memory cleared."],
  });
}
