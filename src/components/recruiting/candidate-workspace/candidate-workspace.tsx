"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import { CandidateCommunicationLog } from "@/components/recruiting/candidate-workspace/candidate-communication-log";
import { CandidateMelReadinessPanel } from "@/components/recruiting/candidate-workspace/candidate-mel-readiness-panel";
import { CandidateNextActionCard } from "@/components/recruiting/candidate-workspace/candidate-next-action-card";
import { CandidateNotesPanel } from "@/components/recruiting/candidate-workspace/candidate-notes-panel";
import { CandidatePaperworkPanel } from "@/components/recruiting/candidate-workspace/candidate-paperwork-panel";
import { CandidateSummary } from "@/components/recruiting/candidate-workspace/candidate-summary";
import { CandidateTimeline } from "@/components/recruiting/candidate-workspace/candidate-timeline";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import {
  advanceWorkflowOnComplete,
  buildCandidateTimeline,
  buildCommunicationLog,
  buildMelReadinessChecklist,
  resolveWorkspaceAction,
} from "@/lib/candidate-workspace";
import { useEffect } from "react";

function candidateDisplayName(candidate: CandidateDrawerRow): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email || "Candidate";
}

export type CandidateWorkspaceProps = {
  candidate: CandidateDrawerRow | null;
  open: boolean;
  onClose: () => void;
  matchScore: number | null;
  actingRecruiter: string;
  sendBlockReason: SendPaperworkBlockReason | null;
  paperworkSending?: boolean;
  workspaceBusy?: boolean;
  onAddNote: (note: string) => void;
  onSendPaperwork: (templateKey: OnboardingTemplateKey) => void;
  onRefreshPaperworkStatus: () => void;
  onAssignActingRecruiter: () => void;
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
  sendBlockReason,
  paperworkSending = false,
  workspaceBusy = false,
  onAddNote,
  onSendPaperwork,
  onRefreshPaperworkStatus,
  onAssignActingRecruiter,
  onAdvanceWorkflow,
}: CandidateWorkspaceProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/90">
                Candidate workspace
              </p>
              <h2 id="candidate-workspace-title" className="mt-0.5 text-lg font-semibold text-zinc-50">
                {candidateDisplayName(activeCandidate)}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {activeCandidate.email || "No email"} · {activeCandidate.phone || "No phone"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <CandidateSummary candidate={activeCandidate} matchScore={matchScore} />

          <CandidateNextActionCard
            action={workspaceAction}
            busy={workspaceBusy || paperworkSending}
            onPrimary={runPrimaryAction}
            onComplete={runCompleteAction}
          />

          <CandidateTimeline entries={timeline} />
          <CandidateNotesPanel notes={activeCandidate.notes} onAddNote={onAddNote} />
          <CandidatePaperworkPanel
            paperworkStatus={activeCandidate.paperworkStatus}
            sentAt={activeCandidate.paperworkSentAt}
            signedAt={activeCandidate.paperworkSignedAt}
            sending={paperworkSending}
            canSend={sendBlockReason === null && Boolean(activeCandidate.email?.trim())}
            onSend={() => onSendPaperwork("onboarding_packet")}
            onRefresh={onRefreshPaperworkStatus}
          />
          <CandidateMelReadinessPanel items={melReadiness} />
          <CandidateCommunicationLog entries={communicationLog} />
        </div>
      </aside>
    </>
  );
}
