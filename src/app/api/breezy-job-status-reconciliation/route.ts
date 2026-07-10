import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildBreezyJobStatusReconciliationFromStores } from "@/lib/breezy-job-status-reconciliation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/breezy-job-status-reconciliation
 * Preview-only live Breezy job status reconciliation (P92). No Breezy writes, no live sends.
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
    buildBreezyJobStatusReconciliationFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    reconciliation: includeEntries
      ? report
      : {
          ...report,
          entries: undefined,
          manualActionList: report.manualActionList.slice(0, 10),
          safeToReactivate: report.safeToReactivate.map((e) => ({
            positionId: e.positionId,
            jobTitle: e.jobTitle,
            recommendation: e.recommendation,
            blockedCandidateCount: e.blockedCandidateCount,
          })),
          safeToPublish: report.safeToPublish.map((e) => ({
            positionId: e.positionId,
            jobTitle: e.jobTitle,
            recommendation: e.recommendation,
            blockedCandidateCount: e.blockedCandidateCount,
          })),
          duplicateConflict: report.duplicateConflict.map((e) => ({
            positionId: e.positionId,
            duplicateActiveJobId: e.duplicateActiveJobId,
            reason: e.reason,
          })),
        },
    warnings: [
      "Preview only — live read-only Breezy GETs; no publish/reactivate writes and no live P84 sends.",
      "Duplicate active ads are never auto-approved for publish.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
