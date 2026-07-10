import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildBulkMappingReviewToolsReport } from "@/lib/p111-bulk-mapping-review";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/project-mapping/bulk-review — P111 grouped review tools report */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildBulkMappingReviewToolsReport();
  return NextResponse.json({
    ok: true,
    bulkReview: report,
    warnings: report.warnings,
  });
}
