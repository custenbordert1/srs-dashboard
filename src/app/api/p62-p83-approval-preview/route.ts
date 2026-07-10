import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildP62P83ApprovalPreviewFromStores } from "@/lib/p62-p83-approval-preview";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/p62-p83-approval-preview
 * Preview-only P62 approval + P83 advancement queue (P95). No persistence, no live sends.
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
  const includeQueue = url.searchParams.get("includeQueue") === "true";

  const [preview, p84Flags] = await Promise.all([
    buildP62P83ApprovalPreviewFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    preview: includeQueue
      ? preview
      : {
          ...preview,
          approvalQueue: preview.approvalQueue.map((entry) => ({
            candidateId: entry.candidateId,
            candidateName: entry.candidateName,
            assignedRecruiter: entry.assignedRecruiter,
            approvalStatus: entry.approvalStatus,
            postApprovalSimulation: entry.postApprovalSimulation,
          })),
          excluded: preview.excluded,
        },
    warnings: [
      "Preview only — manual P62 approval simulation; no workflow writes, no Breezy changes, no live P84 sends.",
      "Nothing is auto-approved.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
