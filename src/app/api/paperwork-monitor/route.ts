import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildPaperworkMonitorSnapshot, P107_DEFAULT_MODE } from "@/lib/paperwork-monitor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/paperwork-monitor */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildPaperworkMonitorSnapshot();

  return NextResponse.json({
    ok: true,
    defaultMode: P107_DEFAULT_MODE,
    paperworkMonitor: report,
    warnings: [
      "P107 polls Dropbox Sign live — no paperwork resend.",
      "Reminders are queued only — not sent automatically.",
    ],
  });
}
