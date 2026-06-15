import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { roleHasPermission } from "@/lib/production-readiness";
import { getRecruitingIntelligenceCacheDiagnostics } from "@/lib/recruiting-intelligence/recruiting-intelligence-cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "recruiting_intelligence_cache_read",
  });
  if (isGuardFailure(guard)) return guard;

  if (!roleHasPermission(guard.session.role, "system_admin")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    diagnostics: getRecruitingIntelligenceCacheDiagnostics(),
  });
}
