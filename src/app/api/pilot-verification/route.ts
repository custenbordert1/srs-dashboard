import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildFirstLiveSendVerification } from "@/lib/p138-first-live-send-verification";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/pilot-verification
 * P138 — verify post-executeOne send and apply pilot safety lock. Read-only — no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidateId") ?? undefined;
  const verifyDropbox = url.searchParams.get("verifyDropbox") === "true";
  const skipLock = url.searchParams.get("skipLock") === "true";

  const verification = await buildFirstLiveSendVerification({
    candidateId,
    verifyDropbox,
    applySafetyLock: !skipLock,
  });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    verification,
    executivePanel: verification.executivePanel,
    overallResult: verification.overallResult,
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
    warnings: [
      "P138 — post-executeOne verification only. No paperwork sends.",
      "No Breezy writes. No executeBatch.",
      verification.overallResult === "PASS"
        ? "Pilot verification passed — safety lock applied if not already locked."
        : "Verification failed — resolve recommendations before re-enabling pilot.",
    ],
  });
}
