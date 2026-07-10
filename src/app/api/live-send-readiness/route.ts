import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildLiveSendReadinessFromStores } from "@/lib/live-send-readiness";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/live-send-readiness
 * Final live-send readiness validation for P97-persisted candidates (P99).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const includeCandidates = url.searchParams.get("includeCandidates") === "true";

  const [report, p84Flags] = await Promise.all([
    buildLiveSendReadinessFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    readiness: includeCandidates
      ? report
      : {
          ...report,
          candidates: report.candidates.map((entry) => ({
            candidateId: entry.candidateId,
            candidateName: entry.candidateName,
            ready: entry.ready,
            blockingReasons: entry.blockingReasons,
          })),
        },
    requiredConfirmationPhrase: report.requiredConfirmationPhrase,
    warnings: [
      "P99 live-send readiness gate — validation only, no paperwork sends.",
      "Readiness approval does not enable liveSend or send Dropbox Sign packets.",
      "No Breezy writes in P99.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend is enabled globally — review before any live-send phase."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
