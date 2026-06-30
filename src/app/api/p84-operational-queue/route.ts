import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildP84OperationalQueueFromStores } from "@/lib/p84-operational-queue";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/p84-operational-queue
 * Preview-only Paperwork Unlock Queue (P90). No Breezy writes, no workflow writes, no live sends.
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
    buildP84OperationalQueueFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    queue: includeEntries
      ? report
      : {
          ...report,
          entries: undefined,
          unlockable: report.unlockable.map((e) => ({
            candidateId: e.candidateId,
            candidateName: e.candidateName,
            queueStatus: e.queueStatus,
            queueStatusLabel: e.queueStatusLabel,
            nextAction: e.nextAction,
            canEnterSendQueue: e.canEnterSendQueue,
          })),
          monitorOnly: report.monitorOnly.map((e) => ({
            candidateId: e.candidateId,
            candidateName: e.candidateName,
            queueStatus: e.queueStatus,
          })),
          blocked: report.blocked.map((e) => ({
            candidateId: e.candidateId,
            candidateName: e.candidateName,
            currentBlocker: e.currentBlocker,
          })),
        },
    warnings: [
      "Preview execution queue — no Breezy publish, no workflow writes, no live P84 sends.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; this endpoint never sends."
        : "P84 liveSend disabled (expected).",
    ],
  });
}
