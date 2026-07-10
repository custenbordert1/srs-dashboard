import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildP62AssignmentPreviewFromStores } from "@/lib/p62-assignment-preview";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/p62-assignment-preview
 * Preview-only P62 recruiter assignment for P93 published-job cohort (P94).
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

  const [preview, p84Flags] = await Promise.all([
    buildP62AssignmentPreviewFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    preview: includeEntries
      ? preview
      : {
          ...preview,
          entries: undefined,
          sampleTraces: preview.sampleTraces.map((entry) => ({
            candidateId: entry.candidateId,
            candidateName: entry.candidateName,
            recommendedRecruiter: entry.recommendedRecruiter,
            outcome: entry.outcome,
            confidence: entry.confidence,
            downstream: {
              p84EligibleAfterSimulation: entry.downstream.p84EligibleAfterSimulation,
            },
          })),
          recruiterDistribution: preview.recruiterDistribution,
        },
    warnings: [
      "Preview only — no workflow writes, no Breezy changes, and no live P84 sends.",
      "Cohort: P93 published-job candidates blocked by missing recruiter only.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
