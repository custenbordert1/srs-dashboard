import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/live-send-operator-checklist
 * Final operator go/no-go checklist before any live paperwork send (P101).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";

  const checklist = await buildLiveSendOperatorChecklist({ mtdOnly });

  return NextResponse.json({
    ok: true,
    goNoGo: checklist.goNoGo,
    checklist,
    warnings: [
      "P101 operator checklist — read-only guard, no paperwork sends.",
      "No Dropbox Sign calls. No Breezy writes. liveSend not modified.",
      checklist.goNoGo === "GO"
        ? "Checklist GO — executive may proceed to controlled executeOne when ready."
        : "Checklist NO-GO — resolve remaining actions before any live send.",
    ],
  });
}
