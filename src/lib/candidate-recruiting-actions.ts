/**
 * Local recruiting action flags — structured for future workflow API sync.
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

const STORAGE_KEY = "srs-candidate-recruiting-actions-v1";

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

function readStore(): Record<string, CandidateRecruitingActions> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CandidateRecruitingActions>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, CandidateRecruitingActions>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadRecruitingActionsMap(): Record<string, CandidateRecruitingActions> {
  return readStore();
}

export function getRecruitingActions(candidateId: string): CandidateRecruitingActions {
  return readStore()[candidateId] ?? emptyRecruitingActions();
}

export function toggleRecruitingAction(
  candidateId: string,
  type: RecruitingActionType,
  enabled?: boolean,
): CandidateRecruitingActions {
  const store = readStore();
  const current = store[candidateId] ?? emptyRecruitingActions();
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

  const updated: CandidateRecruitingActions = {
    ...current,
    dmReview: type === "dm-review" ? nextEnabled : current.dmReview,
    recommendInterview: type === "recommend-interview" ? nextEnabled : current.recommendInterview,
    needsFollowUp: type === "needs-follow-up" ? nextEnabled : current.needsFollowUp,
    priorityList: type === "priority-list" ? nextEnabled : current.priorityList,
    onboardingPacketPrep: type === "onboarding-packet" ? nextEnabled : current.onboardingPacketPrep,
    updatedAt: new Date().toISOString(),
  };

  store[candidateId] = updated;
  writeStore(store);
  return updated;
}

/** Payload shape for a future POST /api/candidates/recruiting-actions */
export function toRecruitingActionPayload(
  candidateId: string,
  actions: CandidateRecruitingActions,
): CandidateRecruitingActionRecord {
  return { candidateId, actions };
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
