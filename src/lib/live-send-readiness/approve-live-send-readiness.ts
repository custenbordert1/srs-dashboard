import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { loadP97RollbackFile } from "@/lib/approval-mode-production/approval-mode-store";
import { buildLiveSendReadinessFromStores } from "@/lib/live-send-readiness/build-live-send-readiness";
import { saveLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";
import type {
  LiveSendReadinessApproveResult,
  LiveSendReadinessReport,
} from "@/lib/live-send-readiness/types";
import { P99_CONFIRMATION_PHRASE } from "@/lib/live-send-readiness/types";

export async function approveLiveSendReadiness(input: {
  approvedBy: string;
  approvedByUserId: string;
  confirmationPhrase: string;
  candidateCount: number;
  dryRunReportTimestamp: string;
  executiveApprovalFlag: boolean;
  mtdOnly?: boolean;
}): Promise<LiveSendReadinessApproveResult> {
  if (!input.executiveApprovalFlag) {
    throw new Error("executiveApprovalFlag must be true to approve live-send readiness.");
  }

  if (input.confirmationPhrase.trim() !== P99_CONFIRMATION_PHRASE) {
    throw new Error(`Invalid confirmation phrase. Required: "${P99_CONFIRMATION_PHRASE}".`);
  }

  const [report, p84Flags, rollback] = await Promise.all([
    buildLiveSendReadinessFromStores({ mtdOnly: input.mtdOnly }),
    loadP84FeatureFlags(),
    loadP97RollbackFile(),
  ]);

  validateReadinessForApproval(report, {
    candidateCount: input.candidateCount,
    dryRunReportTimestamp: input.dryRunReportTimestamp,
    rollbackEntryCount: rollback.entries.length,
    liveSend: p84Flags.liveSend,
  });

  const approvedAt = new Date().toISOString();
  const approval = {
    approved: true as const,
    approvedBy: input.approvedBy,
    approvedByUserId: input.approvedByUserId,
    approvedAt,
    confirmationPhrase: P99_CONFIRMATION_PHRASE,
    candidateCountConfirmed: input.candidateCount,
    dryRunReportTimestamp: input.dryRunReportTimestamp,
    readyCandidateCount: report.metrics.readinessPassCount,
    liveSendEnabled: false as const,
    paperworkSent: false as const,
  };

  await saveLiveSendReadinessApproval(approval);

  const refreshedReport = await buildLiveSendReadinessFromStores({ mtdOnly: input.mtdOnly });

  return {
    ok: true,
    approval,
    report: refreshedReport,
    warnings: [
      "Readiness approval recorded — no paperwork sent.",
      "P84 liveSend was not enabled. Readiness approval does not equal live send.",
      "No Breezy writes. No Dropbox Sign calls.",
      "Enable P84 liveSend only after explicit executive sign-off for the live-send phase.",
    ],
  };
}

function validateReadinessForApproval(
  report: LiveSendReadinessReport,
  input: {
    candidateCount: number;
    dryRunReportTimestamp: string;
    rollbackEntryCount: number;
    liveSend: boolean;
  },
): void {
  if (report.readinessApproved) {
    throw new Error("Live-send readiness already approved.");
  }

  if (input.liveSend) {
    throw new Error("P99 blocked: P84 liveSend is already enabled.");
  }

  if (input.rollbackEntryCount === 0) {
    throw new Error("Rollback artifact missing — cannot approve readiness.");
  }

  if (input.candidateCount !== report.metrics.readinessPassCount) {
    throw new Error(
      `Candidate count mismatch: confirmed ${input.candidateCount}, ready ${report.metrics.readinessPassCount}.`,
    );
  }

  if (input.dryRunReportTimestamp !== report.dryRunReportTimestamp) {
    throw new Error(
      "Dry-run report timestamp mismatch — reload GET /api/live-send-readiness and resubmit.",
    );
  }

  if (report.metrics.readinessBlockedCount > 0) {
    throw new Error(
      `${report.metrics.readinessBlockedCount} candidate(s) blocked — resolve blockers before approval.`,
    );
  }

  if (report.metrics.readinessPassCount === 0) {
    throw new Error("No candidates passed readiness validation.");
  }
}
