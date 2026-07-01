import type { AutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import { isProjectMappingBlocker } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type { PaperworkMonitorMetrics } from "@/lib/paperwork-monitor/types";
import type { QueueDepth } from "@/lib/p118-autonomous-paperwork-operations-center/types";

export function buildQueueDepth(input: {
  paperworkReport: AutonomousPaperworkReport;
  approvedMappings: ApprovedMappingResolution[];
  monitorMetrics: PaperworkMonitorMetrics | null;
  pendingMappingReviewCount: number;
}): QueueDepth {
  const candidates = input.paperworkReport.candidates;

  const approvedMappingReady = input.approvedMappings.filter((mapping) => {
    const candidate = candidates.find((entry) => entry.candidateId === mapping.candidateId);
    return (
      candidate != null &&
      candidate.blockerCategory != null &&
      isProjectMappingBlocker(candidate.blockerCategory)
    );
  }).length;

  return {
    readyToSend: candidates.filter((c) => c.category === "ready_to_send").length,
    approvedMappingReady,
    pendingMappingReview: input.pendingMappingReviewCount,
    projectNotMappable: candidates.filter((c) => c.blockerCategory === "project_not_mappable").length,
    projectMappingReview: candidates.filter((c) => c.blockerCategory === "project_mapping_review").length,
    duplicateRisk: candidates.filter((c) => c.blockerCategory === "duplicate_risk").length,
    alreadySent: candidates.filter(
      (c) => c.category === "sent" || c.blockerCategory === "already_sent",
    ).length,
    invalidEmail: candidates.filter((c) => c.blockerCategory === "invalid_email").length,
    awaitingSignature: input.monitorMetrics?.awaitingSignature ?? 0,
    signedToday: input.monitorMetrics?.signedToday ?? 0,
    readyForOnboarding: input.monitorMetrics?.readyForOnboarding ?? 0,
  };
}
