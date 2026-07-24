import type { P214CoverageTier } from "@/lib/p214-unsent-test-batch/types";
import type { P223ListMembershipSource } from "@/lib/p223-recruiter-inbox-restoration";

export const P224_PHASE = "P224" as const;
export const P224_MAX_COHORT_SIZE = 20 as const;
export const P224_REQUIRED_STAGE = "Paperwork Needed" as const;
export const P224_REQUIRED_PAPERWORK_STATUS = "not_sent" as const;
export const P224_EXPECTED_TEMPLATE = "onboarding_packet" as const;

/** P221 regression targets — never included in the P224 preview cohort. */
export const P224_EXCLUDED_P221_IDS = ["0f25dd13d4ed", "bc2111302660"] as const;

export type P224ExclusionReason =
  | "p221_excluded"
  | "not_in_inbox_union"
  | "stage_not_paperwork_needed"
  | "paperwork_already_sent"
  | "signature_request_present"
  | "dm_unassigned_or_missing"
  | "missing_email"
  | "missing_identity"
  | "terminal_or_inactive"
  | "p214_gate_failed"
  | "duplicate_candidate_id";

export type P224PreviewCandidate = {
  candidateId: string;
  name: string;
  email: string;
  location: string;
  city: string;
  state: string;
  assignedDM: string;
  assignedRecruiter: string;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  listMembershipSource: P223ListMembershipSource;
  nearestActiveWorkMiles: number | null;
  coverageTier: P214CoverageTier;
  eligibilityResult: "eligible" | "ineligible";
  eligibilityBlockers: string[];
  expectedTemplate: typeof P224_EXPECTED_TEMPLATE;
  approvedAt: string;
  positionLabel: string;
  dmCorrect: boolean;
  hasGeoPosting: boolean;
};

export type P224FrozenPreview = {
  phase: typeof P224_PHASE;
  previewOnly: true;
  cohortId: string;
  fingerprint: string;
  authorizedAt: string;
  maxCohortSize: typeof P224_MAX_COHORT_SIZE;
  members: P224PreviewCandidate[];
};

export type P224SelectionAbort = {
  aborted: true;
  reason: string;
  details?: string[];
};

export type P224SelectionSuccess = {
  aborted: false;
  evaluatedCount: number;
  eligibleCount: number;
  selected: P224PreviewCandidate[];
  exclusionsByReason: Partial<Record<P224ExclusionReason, number>>;
  cohort: P224FrozenPreview;
};
