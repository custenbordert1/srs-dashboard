"use client";

import {
  CandidateActionsMenu,
  type CandidateRowAction,
} from "@/components/recruiting/candidate-actions-menu";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

type PaperworkTemplateOption = {
  key: OnboardingTemplateKey;
  label: string;
  configured: boolean;
};

type CandidateRowTriageActionsProps = {
  onFollowUp: () => void;
  onFollowUpDone: () => void;
  onSend: () => void;
  onNote: () => void;
  onAssignMe: () => void;
  followUpDisabled?: boolean;
  sendDisabled?: boolean;
  sendBusy?: boolean;
  sendTitle?: string;
  onOverflowAction: (action: CandidateRowAction) => void;
  rosters: RecruiterRosters;
  onRostersUpdated?: (rosters: RecruiterRosters) => void;
  onboardingConfigured?: boolean;
  onboardingConfigLoaded?: boolean;
  onboardingConfigError?: string | null;
  templatesAvailable?: boolean;
  paperworkTemplates?: PaperworkTemplateOption[];
  hasCandidateEmail?: boolean;
};

function TriageChip({
  label,
  onClick,
  disabled,
  title,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "amber" | "teal";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-600/40 bg-amber-600/10 text-amber-100 hover:bg-amber-600/20"
      : tone === "teal"
        ? "border-teal-600/40 bg-teal-600/10 text-teal-100 hover:bg-teal-600/20"
        : "border-zinc-700 bg-zinc-950/80 text-zinc-200 hover:bg-zinc-800";
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex h-5 shrink-0 items-center justify-center rounded border px-1.5 text-[10px] font-medium leading-none disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {label}
    </button>
  );
}

export function CandidateRowTriageActions({
  onFollowUp,
  onFollowUpDone,
  onSend,
  onNote,
  onAssignMe,
  followUpDisabled = false,
  sendDisabled = false,
  sendBusy = false,
  sendTitle,
  onOverflowAction,
  rosters,
  onRostersUpdated,
  onboardingConfigured = false,
  onboardingConfigLoaded = true,
  onboardingConfigError = null,
  templatesAvailable = false,
  paperworkTemplates = [],
  hasCandidateEmail = true,
}: CandidateRowTriageActionsProps) {
  return (
    <div
      className="flex h-7 max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onClick={(event) => event.stopPropagation()}
    >
      <TriageChip
        label="Follow-up"
        tone="amber"
        disabled={followUpDisabled}
        title="Flag needs follow-up (48h due)"
        onClick={onFollowUp}
      />
      <TriageChip label="Done" title="Mark follow-up complete" onClick={onFollowUpDone} />
      <TriageChip
        label={sendBusy ? "…" : "Send"}
        tone="teal"
        disabled={sendDisabled || sendBusy}
        title={sendTitle ?? "Send onboarding packet"}
        onClick={onSend}
      />
      <TriageChip label="Note" title="Add a local workflow note" onClick={onNote} />
      <TriageChip label="Assign me" title="Assign to acting recruiter" onClick={onAssignMe} />
      <CandidateActionsMenu
        variant="overflow"
        rosters={rosters}
        onRostersUpdated={onRostersUpdated}
        onAction={onOverflowAction}
        onboardingConfigured={onboardingConfigured}
        onboardingConfigLoaded={onboardingConfigLoaded}
        onboardingConfigError={onboardingConfigError}
        templatesAvailable={templatesAvailable}
        paperworkTemplates={paperworkTemplates}
        hasCandidateEmail={hasCandidateEmail}
        sendPaperworkDisabled={sendBusy}
        excludePaperworkTemplateKey="onboarding_packet"
      />
    </div>
  );
}
