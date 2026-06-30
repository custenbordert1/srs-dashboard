import { executeControlledLiveSend } from "@/lib/controlled-live-send";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import type {
  ApplicantSendReadiness,
  TestCohortSendExecutionEntry,
  TestCohortSendReadinessReport,
} from "@/lib/test-cohort-live-send/types";

async function buildExecutionEntry(input: {
  applicant: ApplicantSendReadiness;
  mode: "dryRun" | "executeOne";
  outcome: TestCohortSendExecutionEntry["outcome"];
  signatureRequestId: string | null;
  error: string | null;
  remainingUnsentSafeCandidates: number;
}): Promise<TestCohortSendExecutionEntry> {
  const workflows = await getCandidateWorkflowState();
  const workflow = input.applicant.candidateId
    ? workflows[input.applicant.candidateId]
    : undefined;
  const onboarding = input.applicant.candidateId
    ? await findActiveOnboardingRecord(input.applicant.candidateId)
    : null;

  return {
    applicantKey: input.applicant.applicantKey,
    applicantName: input.applicant.applicantName,
    candidateId: input.applicant.candidateId!,
    email: input.applicant.email,
    mode: input.mode,
    outcome: input.outcome,
    signatureRequestId:
      input.signatureRequestId ?? workflow?.signatureRequestId ?? onboarding?.signatureRequestId ?? null,
    workflowStatus: workflow?.workflowStatus ?? null,
    onboardingStatus: onboarding?.status ?? null,
    error: input.error,
    remainingUnsentSafeCandidates: input.remainingUnsentSafeCandidates,
  };
}

export async function executeTestCohortSafeSends(input: {
  report: TestCohortSendReadinessReport;
  executiveApprovalFlag?: boolean;
  mtdOnly?: boolean;
  dryRunOnly?: boolean;
}): Promise<TestCohortSendReadinessReport> {
  const safeQueue = [...input.report.safeToSend];
  const executions: TestCohortSendExecutionEntry[] = [];
  let remaining = safeQueue.length;

  for (const applicant of safeQueue) {
    if (!applicant.candidateId) continue;

    const dryRunResult = await executeControlledLiveSend({
      mode: "dryRun",
      candidateId: applicant.candidateId,
      mtdOnly: input.mtdOnly ?? false,
    });
    const dryRunEntry = dryRunResult.executed.find((e) => e.candidateId === applicant.candidateId);
    const dryRunOutcome =
      dryRunEntry?.outcome === "simulated"
        ? "simulated"
        : dryRunEntry?.outcome === "skipped"
          ? "skipped"
          : "failed";

    executions.push(
      await buildExecutionEntry({
        applicant,
        mode: "dryRun",
        outcome: dryRunOutcome,
        signatureRequestId: null,
        error: dryRunEntry?.error ?? null,
        remainingUnsentSafeCandidates: remaining,
      }),
    );

    if (dryRunOutcome !== "simulated") {
      throw new Error(
        `dryRun failed for ${applicant.applicantName} (${applicant.candidateId}): ${dryRunEntry?.error ?? dryRunOutcome}`,
      );
    }

    if (input.dryRunOnly) continue;

    const liveResult = await executeControlledLiveSend({
      mode: "executeOne",
      executiveApprovalFlag: input.executiveApprovalFlag ?? true,
      candidateId: applicant.candidateId,
      mtdOnly: input.mtdOnly ?? false,
    });

    const sentEntry = liveResult.executed.find(
      (e) => e.candidateId === applicant.candidateId && e.outcome === "sent",
    );
    const failedEntry = liveResult.executed.find(
      (e) => e.candidateId === applicant.candidateId && e.outcome === "failed",
    );

    if (!sentEntry?.signatureRequestId?.trim()) {
      const err = failedEntry?.error ?? liveResult.stopReason ?? "No signatureRequestId after send.";
      executions.push(
        await buildExecutionEntry({
          applicant,
          mode: "executeOne",
          outcome: "failed",
          signatureRequestId: null,
          error: err,
          remainingUnsentSafeCandidates: remaining,
        }),
      );
      throw new Error(`executeOne failed for ${applicant.applicantName}: ${err}`);
    }

    remaining -= 1;
    executions.push(
      await buildExecutionEntry({
        applicant,
        mode: "executeOne",
        outcome: "sent",
        signatureRequestId: sentEntry.signatureRequestId,
        error: null,
        remainingUnsentSafeCandidates: remaining,
      }),
    );
  }

  const store = await readIngestionStore();
  const refreshedApplicants = input.report.applicants.map((a) => {
    if (!a.candidateId) return a;
    const sent = executions.some(
      (e) => e.candidateId === a.candidateId && e.mode === "executeOne" && e.outcome === "sent",
    );
    if (!sent) return a;
    return {
      ...a,
      category: "already_sent" as const,
      safeToSendNow: false,
      alreadyPaperworkSent: true,
      recommendation: "Paperwork sent in P104 executeOne run.",
    };
  });

  return {
    ...input.report,
    applicants: refreshedApplicants,
    safeToSend: refreshedApplicants.filter((a) => a.safeToSendNow),
    alreadySent: refreshedApplicants.filter((a) => a.alreadyPaperworkSent),
    needingAction: refreshedApplicants.filter((a) => !a.safeToSendNow && !a.alreadyPaperworkSent),
    executions,
    metrics: {
      ...input.report.metrics,
      safeToSendNowCount: refreshedApplicants.filter((a) => a.safeToSendNow).length,
      alreadySentCount: refreshedApplicants.filter((a) => a.alreadyPaperworkSent).length,
    },
  };
}
