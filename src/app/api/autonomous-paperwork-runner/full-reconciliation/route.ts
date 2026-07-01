import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/autonomous-paperwork-runner/full-reconciliation
 * Legacy P106.1 full reconciliation — use /api/p1061-autonomous-paperwork-runner/full-reconciliation.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  return NextResponse.json(
    {
      ok: false,
      error: "P106.1 full reconciliation moved to /api/p1061-autonomous-paperwork-runner/full-reconciliation.",
    },
    { status: 410 },
  );
}
