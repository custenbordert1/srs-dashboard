import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildProjectMappingReport, P108_DEFAULT_MODE } from "@/lib/p108-intelligent-project-mapping";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/project-mapping — P108 read-only mapping intelligence */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildProjectMappingReport({ mode: "dryRun" });

  return NextResponse.json({
    ok: true,
    defaultMode: P108_DEFAULT_MODE,
    projectMapping: report,
    warnings: report.warnings,
  });
}
