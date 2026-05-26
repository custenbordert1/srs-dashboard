"use client";

import {
  CandidateActionsMenu,
  type CandidateRowAction,
} from "@/components/recruiting/candidate-actions-menu";
import type { CandidateRowPrimaryAction } from "@/lib/candidate-row-primary-action";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

type PaperworkTemplateOption = {
  key: OnboardingTemplateKey;
  label: string;
  configured: boolean;
};

type CandidateRowPrimaryActionProps = {
  primary: CandidateRowPrimaryAction;
  onPrimary: () => void;
  onFollowUp: () => void;
  onFollowUpDone: () => void;
  onSend: () => void;
  onNote: () => void;
  onAssignMe: () => void;
  followUpDisabled?: boolean;
  sendDisabled?: boolean;
  sendBusy?: boolean;
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

function primaryToneClass(tone: CandidateRowPrimaryAction["tone"]): string {
  switch (tone) {
    case "teal":
      return "border-teal-600/50 bg-teal-600/15 text-teal-100 hover:bg-teal-600/25";
    case "amber":
      return "border-amber-600/45 bg-amber-600/12 text-amber-100 hover:bg-amber-600/22";
    case "sky":
      return "border-sky-600/45 bg-sky-600/12 text-sky-100 hover:bg-sky-600/22";
    case "cyan":
      return "border-cyan-600/45 bg-cyan-600/12 text-cyan-100 hover:bg-cyan-600/22";
    default:
      return "border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800";
  }
}

export function CandidateRowPrimaryActionBar({
  primary,
  onPrimary,
  onFollowUp,
  onFollowUpDone,
  onSend,
  onNote,
  onAssignMe,
  followUpDisabled = false,
  sendDisabled = false,
  sendBusy = false,
  onOverflowAction,
  rosters,
  onRostersUpdated,
  onboardingConfigured = false,
  onboardingConfigLoaded = true,
  onboardingConfigError = null,
  templatesAvailable = false,
  paperworkTemplates = [],
  hasCandidateEmail = true,
}: CandidateRowPrimaryActionProps) {
  function runPrimary() {
    if (primary.disabled) return;
    switch (primary.kind) {
      case "send-packet":
        onSend();
        break;
      case "follow-up":
        onFollowUp();
        break;
      case "follow-up-done":
        onFollowUpDone();
        break;
      case "assign-me":
        onAssignMe();
        break;
      case "ready-for-mel":
        onOverflowAction({ kind: "change-workflow", status: "Ready for MEL" });
        break;
      case "review":
      case "open-drawer":
        onOverflowAction({ kind: "open-drawer" });
        break;
      default:
        onPrimary();
    }
  }

  return (
    <div
      className="flex h-7 min-w-[7.5rem] items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={primary.disabled}
        title={primary.title ?? primary.label}
        onClick={runPrimary}
        className={`inline-flex h-7 min-w-[4.5rem] max-w-[7.5rem] flex-1 items-center justify-center truncate rounded-md border px-2.5 text-[11px] font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-40 ${primaryToneClass(primary.tone)}`}
      >
        {primary.kind === "send-packet" && sendBusy ? "Sending…" : primary.label}
      </button>
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
        sendPaperworkDisabled={sendBusy || sendDisabled}
        excludePaperworkTemplateKey="onboarding_packet"
        overflowTriage={{
          onFollowUp,
          onFollowUpDone,
          onNote,
          onAssignMe,
          followUpDisabled,
          hideSendInOverflow: primary.kind === "send-packet",
        }}
      />
    </div>
  );
}
