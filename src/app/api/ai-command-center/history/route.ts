import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadChatSession } from "@/lib/ai-command-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-command-center/history?sessionId=...
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
  }

  const session = await loadChatSession(sessionId);
  return NextResponse.json({
    ok: true,
    previewMode: true,
    sessionId: session.sessionId,
    messages: session.messages,
    memory: session.memory,
    metrics: session.metrics,
  });
}
