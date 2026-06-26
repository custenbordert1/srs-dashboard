import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildReadyForWorkReadiness } from "@/lib/autonomous-onboarding-engine/build-ready-for-work-readiness";
import { buildTrainingAssignmentPreview } from "@/lib/autonomous-onboarding-engine/build-welcome-and-training-preview";
import { resolveAutonomousOnboardingState } from "@/lib/autonomous-onboarding-engine/state-machine";
import type {
  PlacementCandidateInput,
  PlacementEligibilityRequirement,
  PlacementEligibilityResult,
} from "@/lib/workforce-placement-intelligence/types";

function hasGradeContributor(row: PlacementCandidateInput, fragment: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) =>
    item.label.toLowerCase().includes(fragment.toLowerCase()),
  );
}

function resolveReadyForWork(row: PlacementCandidateInput, onboarding: CandidateOnboardingRecord | null) {
  const training = buildTrainingAssignmentPreview({
    candidateId: row.candidateId,
    candidateName: `${row.firstName} ${row.lastName}`.trim(),
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
  });

  const readiness = buildReadyForWorkReadiness({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkError: row.paperworkError,
    onboardingStatus: onboarding?.status ?? null,
    training,
    acknowledgementsComplete: training.allRequiredComplete,
  });

  const currentState = resolveAutonomousOnboardingState({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkError: row.paperworkError,
    onboardingStatus: onboarding?.status ?? null,
    trainingComplete: training.allRequiredComplete,
    acknowledgementsComplete: training.allRequiredComplete,
  });

  const readyForWork =
    readiness.status === "ready_for_work" ||
    currentState === "ready_for_work" ||
    currentState === "assigned";

  return { readiness, currentState, readyForWork, training };
}

function resolveSmartphoneRequirement(row: PlacementCandidateInput): PlacementEligibilityRequirement {
  const access = row.questionnaireIntelligence.smartphoneAccess;
  if (access === true) {
    return {
      id: "smartphone",
      label: "Smartphone confirmed",
      complete: true,
      blocking: true,
      detail: null,
    };
  }
  if (access === false) {
    return {
      id: "smartphone",
      label: "Smartphone confirmed",
      complete: false,
      blocking: true,
      detail: "Smartphone access not confirmed.",
    };
  }
  return {
    id: "smartphone",
    label: "Smartphone confirmed",
    complete: false,
    blocking: true,
    detail: "Smartphone status unknown.",
  };
}

function resolveTransportationRequirement(row: PlacementCandidateInput): PlacementEligibilityRequirement {
  if (hasGradeContributor(row, "Transportation not confirmed")) {
    return {
      id: "transportation",
      label: "Reliable transportation confirmed",
      complete: false,
      blocking: true,
      detail: "Transportation not confirmed.",
    };
  }

  const travelConfirmed =
    row.skillTags.includes("travel_willing") ||
    (row.travelFitScore ?? 0) >= 50 ||
    row.intelligenceTravelRadius >= 70 ||
    row.distanceMiles != null;

  if (travelConfirmed) {
    return {
      id: "transportation",
      label: "Reliable transportation confirmed",
      complete: true,
      blocking: true,
      detail: null,
    };
  }

  if (!row.questionnaireIntelligence.available) {
    return {
      id: "transportation",
      label: "Reliable transportation confirmed",
      complete: false,
      blocking: true,
      detail: "Transportation status unknown.",
    };
  }

  return {
    id: "transportation",
    label: "Reliable transportation confirmed",
    complete: false,
    blocking: true,
    detail: "Transportation not confirmed from questionnaire.",
  };
}

function resolveExperienceRequirement(row: PlacementCandidateInput): PlacementEligibilityRequirement {
  const retailDetected =
    row.resumeIntelligence.merchandisingRetailExperience === true ||
    row.resumeIntelligence.signalBadges.some((badge) => badge.id === "retail" && badge.detected) ||
    row.skillTags.includes("retail_merchandising") ||
    (row.retailExperienceScore ?? 0) > 0 ||
    (row.merchandisingExperienceScore ?? 0) > 0 ||
    Boolean(row.questionnaireIntelligence.merchandisingExperience?.trim());

  if (retailDetected) {
    return {
      id: "retail_experience",
      label: "Retail or merchandising experience identified",
      complete: true,
      blocking: true,
      detail: null,
    };
  }

  return {
    id: "retail_experience",
    label: "Retail or merchandising experience identified",
    complete: false,
    blocking: true,
    detail: "Experience not identified from resume or questionnaire.",
  };
}

export function buildPlacementEligibility(input: {
  row: PlacementCandidateInput;
  onboarding?: CandidateOnboardingRecord | null;
}): PlacementEligibilityResult {
  const { readyForWork } = resolveReadyForWork(input.row, input.onboarding ?? null);

  const readyRequirement: PlacementEligibilityRequirement = {
    id: "ready_for_work",
    label: "Ready For Work",
    complete: readyForWork,
    blocking: true,
    detail: readyForWork ? null : "Onboarding requirements not yet satisfied.",
  };

  const requirements = [
    readyRequirement,
    resolveSmartphoneRequirement(input.row),
    resolveTransportationRequirement(input.row),
    resolveExperienceRequirement(input.row),
  ];

  const missingReasons = requirements
    .filter((row) => row.blocking && !row.complete)
    .map((row) => row.detail ?? row.label);

  if (!readyForWork) {
    return {
      candidateId: input.row.candidateId,
      status: "not_ready_for_work",
      requirements,
      missingReasons,
      readyForWork: false,
    };
  }

  const placementBlockers = requirements.filter(
    (row) => row.id !== "ready_for_work" && row.blocking && !row.complete,
  );

  if (placementBlockers.length > 0) {
    return {
      candidateId: input.row.candidateId,
      status: "human_review",
      requirements,
      missingReasons: placementBlockers.map((row) => row.detail ?? row.label),
      readyForWork: true,
    };
  }

  return {
    candidateId: input.row.candidateId,
    status: "eligible",
    requirements,
    missingReasons: [],
    readyForWork: true,
  };
}

export function isReadyForWorkCandidate(
  row: PlacementCandidateInput,
  onboarding?: CandidateOnboardingRecord | null,
) {
  return resolveReadyForWork(row, onboarding ?? null).readyForWork;
}
