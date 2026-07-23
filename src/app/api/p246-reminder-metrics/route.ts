import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { readP246DashboardSnapshot } from "@/lib/p246-outstanding-paperwork-reminders";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/p246-reminder-metrics — latest P246 outstanding-paperwork reminder snapshot */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const snapshot = await readP246DashboardSnapshot();
  if (!snapshot) {
    return NextResponse.json({
      ok: true,
      available: false,
      metrics: null,
      warnings: [
        "No P246 dashboard snapshot yet. Run: npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts",
      ],
    });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    metrics: snapshot,
    warnings: [
      "P246 metrics reflect the latest preview/live reminder campaign run.",
      "Dropbox Sign is the source of truth — reminders are never sent for unverified packets.",
    ],
  });
}
