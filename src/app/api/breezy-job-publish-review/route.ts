import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildBreezyJobPublishReviewFromStores } from "@/lib/breezy-job-publish-review";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/breezy-job-publish-review
 * Preview-only Breezy job publish review (P91). No Breezy writes, no live sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const includeEntries = url.searchParams.get("includeEntries") === "true";

  const [report, p84Flags] = await Promise.all([
    buildBreezyJobPublishReviewFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    review: includeEntries
      ? report
      : {
          ...report,
          entries: undefined,
          safeToPublish: report.safeToPublish.map((e) => ({
            positionId: e.positionId,
            jobTitle: e.jobTitle,
            recommendedAction: e.recommendedAction,
            blockedCandidateCount: e.blockedCandidateCount,
          })),
          duplicateConflict: report.duplicateConflict.map((e) => ({
            positionId: e.positionId,
            duplicateActiveJobId: e.duplicateActiveJobId,
            reason: e.reason,
          })),
        },
    warnings: [
      "Preview only — no Breezy publish/reactivate writes and no live P84 sends.",
      "Duplicate active ads are never auto-approved for publish.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
