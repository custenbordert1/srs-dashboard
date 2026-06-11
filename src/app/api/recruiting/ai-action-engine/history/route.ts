import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listAiActionAudit, getAiMemorySummary } from "@/lib/ai-action-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "ai_action_engine_history",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 25) || 25);

  const [audit, memorySummary] = await Promise.all([listAiActionAudit(limit), getAiMemorySummary()]);

  return NextResponse.json({ ok: true, audit, memorySummary });
}
