import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildPaperworkEligibilityReconciliationFromStores } from "@/lib/paperwork-eligibility-reconciliation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/paperwork-eligibility-reconciliation
 * Preview-only P88 reconciliation between P87 ready-grade signals and P84 gates.
 * Never sends paperwork or mutates workflow state.
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
  const includeTraces = url.searchParams.get("includeTraces") === "true";

  const [report, p84Flags] = await Promise.all([
    buildPaperworkEligibilityReconciliationFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: {
      ...p84Flags,
      liveSend: false,
      liveMode: p84Flags.liveMode && p84Flags.liveSend,
    },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    report: includeTraces
      ? report
      : {
          ...report,
          traces: report.traces.map((trace) => ({
            candidateId: trace.candidateId,
            candidateName: trace.candidateName,
            primaryBlockerId: trace.primaryBlockerId,
            primaryBlockerLabel: trace.primaryBlockerLabel,
            p84Eligible: trace.p84.eligible,
            wouldBeEligibleAfterP83Advancement: trace.wouldBeEligibleAfterP83Advancement,
            wouldBeEligibleAfterRecruiterAssignment: trace.wouldBeEligibleAfterRecruiterAssignment,
            recommendedFix: trace.recommendedFix,
            ruleMismatchNote: trace.ruleMismatchNote,
          })),
        },
    warnings: [
      "Preview/read-only — no paperwork sends and no workflow writes.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend is enabled in flags but this endpoint never sends."
        : "P84 liveSend disabled (expected for reconciliation).",
    ],
  });
}
