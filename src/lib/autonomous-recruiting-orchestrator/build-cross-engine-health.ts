import type { AutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { AutonomousPaperworkDashboardSnapshot } from "@/lib/autonomous-paperwork-engine/types";
import type { AutonomousCandidateCommunicationDashboardSnapshot } from "@/lib/autonomous-candidate-communication-engine/types";
import type { ExecutiveDailyBriefSnapshot } from "@/lib/executive-daily-brief/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import { canExecutePaperwork } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { canExecuteCommunication } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import type { EngineHealthReport, EngineHealthStatus } from "@/lib/autonomous-recruiting-orchestrator/types";

function statusFromCounts(blocked: number, warning: number, offline: boolean): EngineHealthStatus {
  if (offline) return "offline";
  if (blocked > 0) return "blocked";
  if (warning > 0) return "warning";
  return "healthy";
}

export function buildCrossEngineHealth(input: {
  paperwork: AutonomousPaperworkDashboardSnapshot;
  onboarding: AutonomousOnboardingDashboardSnapshot;
  communication: AutonomousCandidateCommunicationDashboardSnapshot;
  brief: ExecutiveDailyBriefSnapshot | null;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  orchestratorEnabled: boolean;
}): EngineHealthReport[] {
  const recruitingBlocked = input.paperwork.automationReadiness.blocked;
  const recruitingWarning = input.paperwork.candidateQueue.filter((r) => r.lifecycleStatus === "needs_recruiter_review").length;

  const paperworkBlocked = input.paperwork.failedPackets.length + input.paperwork.waitingTooLong.length;
  const paperworkWarning = input.paperwork.candidateQueue.filter((r) => r.lifecycleStatus === "queued").length;

  const communicationBlocked = input.communication.health.failures;
  const communicationWarning = input.communication.health.waitingApproval;

  const onboardingBlocked = input.onboarding.kpis.archived;
  const onboardingWarning =
    input.onboarding.kpis.paperworkSent - input.onboarding.kpis.paperworkSigned;

  const executiveOffline = !input.brief;

  return [
    {
      engineId: "recruiting_intelligence",
      label: "Recruiting Engine",
      status: statusFromCounts(recruitingBlocked > 5 ? 1 : 0, recruitingWarning > 0 ? 1 : 0, false),
      explanation:
        recruitingBlocked > 5
          ? `${recruitingBlocked} candidates blocked from automatic paperwork.`
          : recruitingWarning > 0
            ? `${recruitingWarning} candidates need recruiter review.`
            : "Recruiting intelligence operating normally in preview.",
      metrics: { blocked: recruitingBlocked, needsReview: recruitingWarning },
    },
    {
      engineId: "paperwork_intelligence",
      label: "Paperwork Engine",
      status: statusFromCounts(paperworkBlocked > 0 ? 1 : 0, paperworkWarning > 0 ? 1 : 0, false),
      explanation:
        paperworkBlocked > 0
          ? `${paperworkBlocked} paperwork issues (failed or waiting 48+ hours).`
          : paperworkWarning > 0
            ? `${paperworkWarning} packets queued.`
            : "Paperwork intelligence healthy.",
      metrics: {
        readyForAuto: input.paperwork.automationReadiness.readyForAutoSend,
        blocked: paperworkBlocked,
      },
    },
    {
      engineId: "paperwork_execution",
      label: "Paperwork Execution",
      status: statusFromCounts(
        0,
        canExecutePaperwork(input.p71Flags) ? 1 : 0,
        !input.p71Flags.automationEnabled,
      ),
      explanation: canExecutePaperwork(input.p71Flags)
        ? "P71 live execution enabled — orchestrator remains preview-only."
        : input.p71Flags.automationEnabled
          ? `Execution mode: ${input.p71Flags.executionMode} (preview).`
          : "Paperwork execution offline (automation disabled).",
      metrics: {
        mode: input.p71Flags.executionMode,
        liveSends: canExecutePaperwork(input.p71Flags) ? 1 : 0,
      },
    },
    {
      engineId: "communication",
      label: "Communication Engine",
      status: statusFromCounts(
        communicationBlocked > 0 ? 1 : 0,
        communicationWarning > 0 ? 1 : 0,
        !input.p73Flags.communicationEnabled,
      ),
      explanation: canExecuteCommunication(input.p73Flags)
        ? "P73 live communication enabled — orchestrator remains preview-only."
        : input.p73Flags.communicationEnabled
          ? `${input.communication.health.previewSent} preview communications simulated.`
          : "Communication engine offline (disabled).",
      metrics: {
        previewSent: input.communication.health.previewSent,
        waitingApproval: communicationWarning,
      },
    },
    {
      engineId: "onboarding",
      label: "Onboarding Engine",
      status: statusFromCounts(onboardingBlocked > 0 ? 1 : 0, onboardingWarning > 0 ? 1 : 0, false),
      explanation:
        onboardingWarning > 0
          ? `${onboardingWarning} candidates between paperwork sent and signed.`
          : `${input.onboarding.kpis.readyForWork} ready for work.`,
      metrics: {
        inPipeline: input.onboarding.kpis.inPipeline,
        readyForWork: input.onboarding.kpis.readyForWork,
      },
    },
    {
      engineId: "executive",
      label: "Executive Engine",
      status: statusFromCounts(0, executiveOffline ? 1 : 0, executiveOffline),
      explanation: executiveOffline
        ? "Executive daily brief unavailable."
        : `Brief: ${input.brief!.metrics.applicantsToday} applicants today, ${input.brief!.metrics.pendingSignatures} pending signatures.`,
      metrics: executiveOffline
        ? { available: 0 }
        : {
            applicantsToday: input.brief!.metrics.applicantsToday,
            humanReview: input.brief!.metrics.humanReviewCount,
          },
    },
  ];
}
