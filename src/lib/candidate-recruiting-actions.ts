/**
 * Recruiting action flags — persisted on server workflow overlay (see candidate-workflow-store).
 */

export type RecruitingActionType =
  | "dm-review"
  | "recommend-interview"
  | "needs-follow-up"
  | "priority-list"
  | "onboarding-packet";

export type CandidateRecruitingActions = {
  dmReview: boolean;
  recommendInterview: boolean;
  needsFollowUp: boolean;
  priorityList: boolean;
  onboardingPacketPrep: boolean;
  updatedAt: string;
};

export type CandidateRecruitingActionRecord = {
  candidateId: string;
  actions: CandidateRecruitingActions;
};

export const RECRUITING_ACTION_LABELS: Record<
  RecruitingActionType,
  { label: string; description: string }
> = {
  "dm-review": {
    label: "Mark for DM review",
    description: "Flag for district manager territory review",
  },
  "recommend-interview": {
    label: "Recommend interview",
    description: "Advance to interview scheduling queue",
  },
  "needs-follow-up": {
    label: "Needs follow-up",
    description: "Recruiter outreach required within 48h",
  },
  "priority-list": {
    label: "Add to priority list",
    description: "High-priority candidate for this territory",
  },
  "onboarding-packet": {
    label: "Prepare onboarding packet",
    description: "Placeholder — paperwork / HelloSign prep (coming soon)",
  },
};

export function emptyRecruitingActions(): CandidateRecruitingActions {
  return {
    dmReview: false,
    recommendInterview: false,
    needsFollowUp: false,
    priorityList: false,
    onboardingPacketPrep: false,
    updatedAt: new Date(0).toISOString(),
  };
}

export function applyRecruitingActionToggle(
  current: CandidateRecruitingActions,
  type: RecruitingActionType,
  enabled?: boolean,
): CandidateRecruitingActions {
  const nextEnabled =
    enabled ??
    !(type === "dm-review"
      ? current.dmReview
      : type === "recommend-interview"
        ? current.recommendInterview
        : type === "needs-follow-up"
          ? current.needsFollowUp
          : type === "priority-list"
            ? current.priorityList
            : current.onboardingPacketPrep);

  return {
    ...current,
    dmReview: type === "dm-review" ? nextEnabled : current.dmReview,
    recommendInterview: type === "recommend-interview" ? nextEnabled : current.recommendInterview,
    needsFollowUp: type === "needs-follow-up" ? nextEnabled : current.needsFollowUp,
    priorityList: type === "priority-list" ? nextEnabled : current.priorityList,
    onboardingPacketPrep: type === "onboarding-packet" ? nextEnabled : current.onboardingPacketPrep,
    updatedAt: new Date().toISOString(),
  };
}

export function toRecruitingActionPayload(
  candidateId: string,
  actions: CandidateRecruitingActions,
): CandidateRecruitingActionRecord {
  return { candidateId, actions };
}

const MS_PER_HOUR = 60 * 60 * 1000;

export function scheduleFollowUpDue(referenceMs = Date.now(), hours = 48): string {
  return new Date(referenceMs + hours * MS_PER_HOUR).toISOString();
}

/** Clears follow-up flag and due date after recruiter completes outreach. */
export function completeFollowUpActions(
  current: CandidateRecruitingActions,
  referenceMs = Date.now(),
): CandidateRecruitingActions {
  return {
    ...current,
    needsFollowUp: false,
    updatedAt: new Date(referenceMs).toISOString(),
  };
}

/** Enables follow-up with a fresh 48h due window. */
export function markNeedsFollowUp(
  current: CandidateRecruitingActions,
  referenceMs = Date.now(),
): CandidateRecruitingActions {
  return {
    ...current,
    needsFollowUp: true,
    updatedAt: new Date(referenceMs).toISOString(),
  };
}

export function deriveRecommendedNextAction(
  actions: CandidateRecruitingActions,
  workflowNextAction: string,
  intelligenceSummary?: string,
): string {
  if (actions.onboardingPacketPrep) return "Prepare onboarding packet (placeholder workflow)";
  if (actions.recommendInterview) return "Schedule recruiter interview — candidate flagged for interview";
  if (actions.dmReview) return "DM territory review — validate fit and coverage";
  if (actions.needsFollowUp) return "Recruiter follow-up within 48 hours";
  if (actions.priorityList) return "Priority outreach — top of recruiter queue";
  if (intelligenceSummary) return intelligenceSummary;
  return workflowNextAction || "Review candidate profile";
}
