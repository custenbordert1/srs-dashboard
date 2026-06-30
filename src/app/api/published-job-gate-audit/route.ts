import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildPublishedJobGateAuditFromStores } from "@/lib/published-job-gate-audit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/published-job-gate-audit
 * Preview-only downstream gate audit for published-but-blocked jobs (P93).
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

  const [audit, p84Flags] = await Promise.all([
    buildPublishedJobGateAuditFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    audit: includeTraces
      ? audit
      : {
          ...audit,
          publishedJobs: audit.publishedJobs.map((job) => ({
            ...job,
            traces: job.traces.map((trace) => ({
              candidateId: trace.candidateId,
              candidateName: trace.candidateName,
              primaryBlocker: trace.primaryBlocker,
              primaryBlockerLabel: trace.primaryBlockerLabel,
              blockerReason: trace.blockerReason,
              fixableWithoutBreezyJobAction: trace.fixableWithoutBreezyJobAction,
            })),
          })),
          exampleTraces: audit.exampleTraces.map((trace) => ({
            candidateId: trace.candidateId,
            candidateName: trace.candidateName,
            positionId: trace.positionId,
            primaryBlocker: trace.primaryBlocker,
            blockerReason: trace.blockerReason,
          })),
        },
    warnings: [
      "Preview only — read-only audit; no Breezy writes and no live P84 sends.",
      "Focus: published Breezy jobs with blocked P84 candidates from P92.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
