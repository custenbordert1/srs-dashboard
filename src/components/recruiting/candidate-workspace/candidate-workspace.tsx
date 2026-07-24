"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import { CandidateAssignmentPanel } from "@/components/recruiting/candidate-workspace/candidate-assignment-panel";
import { CandidateAutomationStatusPanel } from "@/components/recruiting/candidate-workspace/candidate-automation-status-panel";
import { CandidateCopilotPanel } from "@/components/recruiting/candidate-workspace/candidate-copilot-panel";
import { CandidateCommunicationLog } from "@/components/recruiting/candidate-workspace/candidate-communication-log";
import { CandidateGradePanel } from "@/components/recruiting/candidate-workspace/candidate-grade-panel";
import { CandidateMelReadinessPanel } from "@/components/recruiting/candidate-workspace/candidate-mel-readiness-panel";
import { CandidateOnboardingPreviewPanel } from "@/components/recruiting/candidate-workspace/candidate-onboarding-preview-panel";
import { CandidateOnboardingPipelinePanel } from "@/components/recruiting/candidate-workspace/candidate-onboarding-pipeline-panel";
import { CandidateWorkforcePlacementPreviewPanel } from "@/components/recruiting/candidate-workspace/candidate-workforce-placement-preview-panel";
import { CandidateNextActionCard } from "@/components/recruiting/candidate-workspace/candidate-next-action-card";
import { CandidateNotesPanel } from "@/components/recruiting/candidate-workspace/candidate-notes-panel";
import { CandidatePaperworkPanel } from "@/components/recruiting/candidate-workspace/candidate-paperwork-panel";
import { CandidateQuestionnaireIntelligencePanel } from "@/components/recruiting/candidate-workspace/candidate-questionnaire-intelligence-panel";
import { CandidateRecruiterActionPanel } from "@/components/recruiting/candidate-workspace/candidate-recruiter-action-panel";
import { CandidateProgressionPanel } from "@/components/recruiting/candidate-workspace/candidate-progression-panel";
import { CandidateResumeIntelligencePanel } from "@/components/recruiting/candidate-workspace/candidate-resume-intelligence-panel";
import { CandidateTimeline } from "@/components/recruiting/candidate-workspace/candidate-timeline";
import { CandidateWorkspaceMilestoneTimeline } from "@/components/recruiting/candidate-workspace/candidate-workspace-milestone-timeline";
import { CandidateWorkspacePrimaryActions } from "@/components/recruiting/candidate-workspace/candidate-workspace-primary-actions";
import { CandidateWorkspaceQuickSummary } from "@/components/recruiting/candidate-workspace/candidate-workspace-quick-summary";
import { P193CandidateDetailPanel } from "@/components/recruiting/p193-candidate-detail-panel";
import { projectLegacyRowToStatusViewModel } from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import {
  advanceWorkflowOnComplete,
  buildCandidateTimeline,
  buildCommunicationLog,
  buildMelReadinessChecklist,
  resolveWorkspaceAction,
} from "@/lib/candidate-workspace";
import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { confidenceForQueueRow } from "@/lib/p199-candidate-queue-ux";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import { useEffect, useMemo, useRef } from "react";

function candidateDisplayName(candidate: CandidateDrawerRow): string {
  return formatCandidateDisplayName({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
  });
}

function formatAppliedDate(raw: string): string {
  if (!raw.trim()) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(raw));
  } catch {
    return raw;
  }
}

function buildBreezyCandidateUrl(input: {
  companyId: string | null;
  positionId: string | null;
  candidateId: string;
}): string | null {
  const companyId = input.companyId?.trim();
  const positionId = input.positionId?.trim();
  if (!companyId || !positionId) return null;
  return `https://app.breezy.hr/app/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}/candidates/${encodeURIComponent(input.candidateId)}`;
}

export type CandidateWorkspaceProps = {
  candidate: CandidateDrawerRow | null;
  open: boolean;
  onClose: () => void;
  matchScore: number | null;
  actingRecruiter: string;
  rosters: RecruiterRosters;
  sendBlockReason: SendPaperworkBlockReason | null;
  paperworkSending?: boolean;
  workspaceBusy?: boolean;
  breezyCompanyId?: string | null;
  breezyPositionId?: string | null;
  nearbyJobCount?: number;
  nearestDistanceMiles?: number | null;
  onAddNote: (note: string) => void;
  onSendPaperwork: (templateKey: OnboardingTemplateKey) => void;
  onRefreshPaperworkStatus: () => void;
  onAssignActingRecruiter: () => void;
  onAssignRecruiter: (recruiter: string) => void;
  onAdvanceWorkflow: (input: {
    statusChange?: CandidateDrawerRow["workflowStatus"];
    completeFollowUp?: boolean;
    note?: string;
    recruitingAction?: { type: import("@/lib/candidate-recruiting-actions").RecruitingActionType; enabled: boolean };
  }) => void;
};

export function CandidateWorkspace({
  candidate,
  open,
  onClose,
  matchScore,
  actingRecruiter,
  rosters,
  sendBlockReason,
  paperworkSending = false,
  workspaceBusy = false,
  breezyCompanyId = null,
  breezyPositionId = null,
  nearbyJobCount = 0,
  nearestDistanceMiles = null,
  onAddNote,
  onSendPaperwork,
  onRefreshPaperworkStatus,
  onAssignActingRecruiter,
  onAssignRecruiter,
  onAdvanceWorkflow,
}: CandidateWorkspaceProps) {
  const resumeRef = useRef<HTMLDivElement | null>(null);
  const questionnaireRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const p193ViewModel = useMemo(() => {
    if (!candidate) return null;
    return projectLegacyRowToStatusViewModel({
      candidateId: candidate.candidateId,
      workflowStatus: candidate.workflowStatus,
      recommendedStage: candidate.recommendedStage,
      paperworkStatus: candidate.paperworkStatus,
      signatureRequestId: candidate.signatureRequestId,
      notes: candidate.notes,
      paperworkViewedAt: null,
      paperworkSignedAt: candidate.paperworkSignedAt,
      paperworkSentAt: candidate.paperworkSentAt,
    });
  }, [candidate]);

  if (!open || !candidate) return null;

  const activeCandidate = candidate;

  const workspaceAction = resolveWorkspaceAction({
    candidate: activeCandidate,
    actingRecruiter,
    sendBlockReason,
    sendBusy: paperworkSending,
  });

  const timeline = buildCandidateTimeline({
    appliedDate: activeCandidate.appliedDate,
    history: activeCandidate.history,
  });
  const communicationLog = buildCommunicationLog(activeCandidate.history);
  const melReadiness = buildMelReadinessChecklist({
    workflowStatus: activeCandidate.workflowStatus,
    paperworkStatus: activeCandidate.paperworkStatus,
    recruitingActions: activeCandidate.recruitingActions,
  });
  const needsRecruiterAssignment = isUnassignedRecruiter(activeCandidate.assignedRecruiter);
  const assignmentBusy = workspaceBusy || paperworkSending;
  const location = [activeCandidate.city, activeCandidate.state].filter(Boolean).join(", ") || "—";
  const breezyUrl = buildBreezyCandidateUrl({
    companyId: breezyCompanyId,
    positionId: breezyPositionId,
    candidateId: activeCandidate.candidateId,
  });
  const confidence = confidenceForQueueRow({
    actionConfidence: activeCandidate.actionConfidence,
    recruiterAssignmentConfidence: activeCandidate.recruiterAssignmentConfidence,
    progressionConfidence: activeCandidate.progressionConfidence,
    aiNumericScore: activeCandidate.aiNumericScore,
  });
  const paperworkViewed =
    activeCandidate.paperworkStatus === "viewed" || activeCandidate.paperworkStatus === "signed";
  const paperworkSigned =
    activeCandidate.paperworkStatus === "signed" || Boolean(activeCandidate.paperworkSignedAt);
  const resolvedNearby =
    nearbyJobCount > 0
      ? nearbyJobCount
      : p193ViewModel && !p193ViewModel.missing
        ? p193ViewModel.nearbyJobCount
        : activeCandidate.matchedOpportunities.length;
  const resolvedDistance =
    nearestDistanceMiles ??
    (p193ViewModel && !p193ViewModel.missing ? p193ViewModel.nearestDistanceMiles : null);

  function runPrimaryAction() {
    switch (workspaceAction.kind) {
      case "send-paperwork":
        onSendPaperwork("onboarding_packet");
        break;
      case "assign-me":
        onAssignActingRecruiter();
        break;
      case "ready-for-mel":
        onAdvanceWorkflow({ statusChange: "Ready for MEL", note: "Moved to Ready for MEL from workspace." });
        break;
      case "follow-up-complete":
        onAdvanceWorkflow({ completeFollowUp: true, note: "Follow-up outreach started." });
        break;
      default:
        break;
    }
  }

  function runCompleteAction() {
    if (workspaceAction.kind === "assign-me") {
      onAssignActingRecruiter();
      return;
    }
    if (workspaceAction.kind === "send-paperwork") {
      onSendPaperwork("onboarding_packet");
      return;
    }

    const advancement = advanceWorkflowOnComplete(workspaceAction.kind, activeCandidate);
    onAdvanceWorkflow({
      statusChange: advancement.statusChange,
      completeFollowUp: advancement.completeFollowUp,
      note: advancement.note,
      recruitingAction: advancement.recruitingActions?.[0],
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close candidate workspace"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-workspace-title"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <header className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/90">
                Candidate workspace
              </p>
              <h2 id="candidate-workspace-title" className="mt-0.5 truncate text-lg font-semibold text-zinc-50">
                {candidateDisplayName(activeCandidate)}
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-400 sm:grid-cols-3">
                <div>
                  <dt className="text-zinc-600">City, State</dt>
                  <dd className="text-zinc-200">{location}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Phone</dt>
                  <dd className="text-zinc-200">{activeCandidate.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Email</dt>
                  <dd className="truncate text-zinc-200">{activeCandidate.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Applied</dt>
                  <dd className="text-zinc-200">{formatAppliedDate(activeCandidate.appliedDate)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Stage</dt>
                  <dd className="text-zinc-200">{activeCandidate.workflowStatus}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Owner</dt>
                  <dd className="text-zinc-200">{activeCandidate.assignedRecruiter || "Unassigned"}</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <CandidateWorkspacePrimaryActions
            paperworkStatus={activeCandidate.paperworkStatus}
            paperworkViewed={paperworkViewed}
            paperworkSigned={paperworkSigned}
            sending={paperworkSending}
            canSend={sendBlockReason === null && Boolean(activeCandidate.email?.trim())}
            breezyUrl={breezyUrl}
            hasResume={activeCandidate.resumeIntelligence.available}
            hasQuestionnaire={activeCandidate.questionnaireIntelligence.available}
            onOpenBreezy={() => {
              if (breezyUrl) window.open(breezyUrl, "_blank", "noopener,noreferrer");
            }}
            onScrollToResume={() =>
              resumeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            onScrollToQuestionnaire={() =>
              questionnaireRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            onSendPaperwork={() => onSendPaperwork("onboarding_packet")}
            onRefreshStatus={onRefreshPaperworkStatus}
          />

          <CandidateWorkspaceQuickSummary
            candidate={activeCandidate}
            nearbyJobCount={resolvedNearby}
            nearestDistanceMiles={resolvedDistance}
            confidence={confidence ?? matchScore}
          />

          <CandidateWorkspaceMilestoneTimeline candidate={activeCandidate} />

          <CandidateNextActionCard
            action={workspaceAction}
            busy={assignmentBusy}
            onPrimary={runPrimaryAction}
            onComplete={runCompleteAction}
          />

          <CandidateAssignmentPanel
            assignedRecruiter={activeCandidate.assignedRecruiter}
            actingRecruiter={actingRecruiter}
            rosters={rosters}
            busy={assignmentBusy}
            onAssignToMe={onAssignActingRecruiter}
            onAssignRecruiter={onAssignRecruiter}
          />

          <div ref={resumeRef}>
            <CandidateResumeIntelligencePanel intelligence={activeCandidate.resumeIntelligence} />
          </div>
          <div ref={questionnaireRef}>
            <CandidateQuestionnaireIntelligencePanel
              intelligence={activeCandidate.questionnaireIntelligence}
            />
          </div>

          <details className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
              Automation status
            </summary>
            <div className="mt-3 space-y-3">
              <CandidateAutomationStatusPanel
                automation={activeCandidate.funnelAutomation}
                assignmentSource={activeCandidate.recruiterAssignmentSource}
              />
              <CandidateRecruiterActionPanel
                requiredAction={activeCandidate.requiredAction}
                actionPriority={activeCandidate.actionPriority}
                actionReason={activeCandidate.actionReason}
                actionDueDate={activeCandidate.actionDueDate}
                actionConfidence={activeCandidate.actionConfidence}
              />
              <CandidateProgressionPanel
                recommendedStage={activeCandidate.recommendedStage}
                progressionPriority={activeCandidate.progressionPriority}
                progressionReason={activeCandidate.progressionReason}
                progressionConfidence={activeCandidate.progressionConfidence}
                progressionGeneratedAt={activeCandidate.progressionGeneratedAt}
              />
              <CandidateGradePanel grade={activeCandidate.candidateGrade} />
              <CandidateCopilotPanel
                copilot={activeCandidate.funnelAutomation.copilot}
                showAssignmentActions={needsRecruiterAssignment}
                actingRecruiter={actingRecruiter}
                rosters={rosters}
                busy={assignmentBusy}
                onAssignToMe={onAssignActingRecruiter}
                onAssignRecruiter={onAssignRecruiter}
              />
              <P193CandidateDetailPanel viewModel={p193ViewModel} />
            </div>
          </details>

          <CandidateNotesPanel notes={activeCandidate.notes} onAddNote={onAddNote} />

          <details className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              More details
            </summary>
            <div className="mt-3 space-y-3">
              <CandidatePaperworkPanel
                paperworkStatus={activeCandidate.paperworkStatus}
                sentAt={activeCandidate.paperworkSentAt}
                signedAt={activeCandidate.paperworkSignedAt}
                sending={paperworkSending}
                canSend={sendBlockReason === null && Boolean(activeCandidate.email?.trim())}
                onSend={() => onSendPaperwork("onboarding_packet")}
                onRefresh={onRefreshPaperworkStatus}
              />
              <CandidateTimeline entries={timeline} />
              <CandidateMelReadinessPanel items={melReadiness} />
              <CandidateOnboardingPreviewPanel candidate={activeCandidate} />
              <CandidateOnboardingPipelinePanel candidate={activeCandidate} />
              <CandidateWorkforcePlacementPreviewPanel candidate={activeCandidate} />
              <CandidateCommunicationLog entries={communicationLog} />
            </div>
          </details>
        </div>
      </aside>
    </>
  );
}
