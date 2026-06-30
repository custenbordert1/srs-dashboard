import type { HiringDecisionRules } from "@/lib/autonomous-hiring-decision-engine/types";

export const DEFAULT_HIRING_DECISION_RULES: HiringDecisionRules = {
  fastTrack: {
    allowedGrades: ["A", "B"],
    allowedConfidence: ["high", "medium"],
    requireResume: true,
    requireQuestionnaire: true,
    requireTransportationConfirmed: true,
    requireSmartphoneConfirmed: true,
    maxNegativeContributors: 2,
    requirePublishedJob: true,
  },
  reject: {
    disqualifyingGrades: ["D"],
    rejectOnNoTransportation: true,
    rejectTerminalStatuses: ["Not Qualified"],
  },
  hold: {
    holdOnClosedJob: true,
    holdOnMissingResume: true,
    holdOnMissingQuestionnaire: true,
    holdOnDuplicatePaperwork: true,
    holdOnAlreadyHired: ["Active Rep", "Loaded in MEL", "Ready for MEL"],
  },
  missingInformation: {
    requireBothResumeAndQuestionnaireUnavailable: true,
  },
  timeSavedMinutes: {
    fast_track: 45,
    recruiter_review: 15,
    hold: 20,
    reject: 30,
    missing_information: 10,
  },
};
