import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildPostLiveSendVerification } from "@/lib/post-live-send-verification";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/post-live-send-verification
 * Verify first live send and remaining queue strategy (P103). Read-only — no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const verifyDropbox = url.searchParams.get("verifyDropbox") === "true";
  const candidateId = url.searchParams.get("candidateId") ?? undefined;

  const verification = await buildPostLiveSendVerification({
    mtdOnly,
    candidateId,
    verifyDropbox,
  });

  return NextResponse.json({
    ok: true,
    goNoGo: verification.goNoGoRemainingSends,
    verification,
    warnings: [
      "P103 post-live send verification — read-only, no additional sends.",
      "No Breezy writes. Dropbox read-only only when verifyDropbox=true.",
      verification.goNoGoRemainingSends === "GO"
        ? "Remaining sends may proceed via executeOne (recommended)."
        : "NO-GO — resolve verification failures before next send.",
    ],
  });
}
