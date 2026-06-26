import type { AutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { AutonomousPaperworkDashboardSnapshot } from "@/lib/autonomous-paperwork-engine/types";
import type { AutonomousCandidateCommunicationDashboardSnapshot } from "@/lib/autonomous-candidate-communication-engine/types";
import type { CandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { AutomationReadinessScore } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import { canExecutePaperwork } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { canExecuteCommunication } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildAutomationReadinessScore(input: {
  paperwork: AutonomousPaperworkDashboardSnapshot;
  onboarding: AutonomousOnboardingDashboardSnapshot;
  communication: AutonomousCandidateCommunicationDashboardSnapshot;
  orchestrations: CandidateOrchestrationSnapshot[];
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
}): AutomationReadinessScore {
  const total = input.orchestrations.length || 1;
  const automated = input.orchestrations.filter((o) => o.automationEligible).length;
  const blocked = input.orchestrations.filter((o) => o.blockers.length > 0).length;
  const humanApproval = input.orchestrations.filter((o) => o.workflowStage === "recruiter_approval").length;

  const coverageScore = clamp(100 - (blocked / total) * 40);
  const paperworkScore = clamp(
    (input.paperwork.automationReadiness.readyForAutoSend /
      Math.max(1, input.paperwork.automationReadiness.readyForAutoSend + input.paperwork.automationReadiness.blocked)) *
      100,
  );
  const communicationScore = clamp(
    input.p73Flags.communicationEnabled
      ? (input.communication.health.automationPercent ?? 50)
      : 25,
  );
  const onboardingScore = clamp(
    (input.onboarding.kpis.readyForWork / Math.max(1, input.onboarding.kpis.inPipeline)) * 100,
  );
  const blockerScore = clamp(100 - (blocked / total) * 100);
  const humanScore = clamp(100 - (humanApproval / total) * 60);
  const executionScore = clamp(
    (canExecutePaperwork(input.p71Flags) ? 0 : 80) + (canExecuteCommunication(input.p73Flags) ? 0 : 20),
  );

  const contributors = [
    { id: "coverage", label: "Coverage", score: coverageScore, weight: 15, detail: "Candidates without blockers" },
    { id: "paperwork", label: "Paperwork", score: paperworkScore, weight: 20, detail: "Auto-send readiness" },
    { id: "communication", label: "Communication", score: communicationScore, weight: 15, detail: "Preview automation rate" },
    { id: "onboarding", label: "Onboarding", score: onboardingScore, weight: 15, detail: "Ready-for-work ratio" },
    { id: "blockers", label: "Outstanding blockers", score: blockerScore, weight: 15, detail: "Fewer blockers = higher score" },
    { id: "human_approvals", label: "Human approvals", score: humanScore, weight: 10, detail: "Recruiter approval queue" },
    { id: "execution_readiness", label: "Execution readiness", score: executionScore, weight: 10, detail: "Preview mode safeguards active" },
  ];

  const overall = clamp(
    contributors.reduce((sum, c) => sum + c.score * (c.weight / 100), 0),
  );

  const improvements: string[] = [];
  if (blocked > 0) improvements.push(`Resolve ${blocked} blocked candidate workflows`);
  if (humanApproval > 0) improvements.push(`Clear ${humanApproval} recruiter approval queues`);
  if (!input.p73Flags.communicationEnabled) improvements.push("Enable P73 communication in preview to simulate full lifecycle");
  if (paperworkScore < 70) improvements.push("Increase paperwork auto-eligibility coverage");
  if (onboardingScore < 50) improvements.push("Accelerate onboarding pipeline to Ready for Work");

  return {
    overall,
    contributors,
    summary: `Platform automation readiness: ${overall}%. ${automated} of ${total} candidates eligible for preview automation.`,
    improvements: improvements.slice(0, 4),
  };
}
