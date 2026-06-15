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

const ROW_ACTION_BUTTON_CLASS =
  "inline-flex h-8 w-[5.25rem] shrink-0 items-center justify-center rounded-md border px-2 text-xs font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-40";

type CandidateRowPrimaryActionProps = {
  assignedToMe: boolean;
  onAssignMe: () => void;
  onReview: () => void;
  onFollowUp: () => void;
  onFollowUpDone: () => void;
  onSend: () => void;
  onNote: () => void;
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
  hideSendInOverflow?: boolean;
};

export function CandidateRowPrimaryActionBar({
  assignedToMe,
  onAssignMe,
  onReview,
  onFollowUp,
  onFollowUpDone,
  onSend,
  onNote,
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
  hideSendInOverflow = false,
}: CandidateRowPrimaryActionProps) {
  return (
    <div
      className="flex w-[13.75rem] shrink-0 items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={assignedToMe}
        title={assignedToMe ? "Already assigned to you" : "Assign this candidate to me"}
        onClick={onAssignMe}
        className={`${ROW_ACTION_BUTTON_CLASS} border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800`}
      >
        Assign Me
      </button>
      <button
        type="button"
        title="Open candidate workspace"
        onClick={onReview}
        className={`${ROW_ACTION_BUTTON_CLASS} border-sky-600/45 bg-sky-600/12 text-sky-100 hover:bg-sky-600/22`}
      >
        Review
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
          hideSendInOverflow,
        }}
      />
    </div>
  );
}
