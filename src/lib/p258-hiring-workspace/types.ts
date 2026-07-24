import type { PaperworkSendGate } from "@/lib/autonomous-paperwork-send-engine/types";
import type {
  CandidateWorkflowEvent,
  CandidateWorkflowStatus,
  PaperworkStatus,
} from "@/lib/candidate-workflow-types";
import type {
  JobCommandCenterActivityItem,
  JobCommandCenterOverview,
} from "@/lib/p257-job-command-center";

export type HiringEligibilityVerdict = "Eligible" | "Blocked" | "Needs Attention";

export type HiringScoreFactorId =
  | "distance"
  | "stage"
  | "recruiter"
  | "dm"
  | "phone"
  | "email"
  | "identity"
  | "duplicate"
  | "coverage"
  | "qualification"
  | "existingPaperwork"
  | "signed";

export type HiringScoreReason = {
  id: HiringScoreFactorId;
  label: string;
  points: number;
  weight: number;
  contribution: number;
  detail: string;
};

export type HiringScoreResult = {
  score: number;
  reasons: HiringScoreReason[];
};

export type HiringEligibilityPanel = {
  verdict: HiringEligibilityVerdict;
  eligible: boolean;
  gates: PaperworkSendGate[];
  blockingReasons: string[];
  attentionReasons: string[];
  templateKey: string | null;
};

export type HiringPipelineFilterId =
  | "Applied"
  | "Qualified"
  | "Interview"
  | "Paperwork Needed"
  | "Paperwork Sent"
  | "Signed"
  | "Ready for MEL"
  | "Rejected"
  | "Archived";

export type HiringPipelineBucket = {
  id: HiringPipelineFilterId;
  label: string;
  count: number;
};

export type HiringWorkspaceApplicantInput = {
  candidateId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  positionId: string;
  positionName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  stage?: string;
  appliedDate?: string;
  updatedDate?: string;
  workflowStatus: CandidateWorkflowStatus;
  distanceMiles?: number | null;
  assignedRecruiter?: string;
  assignedDM?: string;
  recruiterAssignmentSource?: import("@/lib/candidate-workflow-types").RecruiterAssignmentSource | null;
  recruiterAssignedAt?: string | null;
  recruiterAssignedBy?: string | null;
  recruiterConfirmationStatus?: import("@/lib/candidate-workflow-types").OwnershipConfirmationStatus | null;
  dmAssignmentSource?: import("@/lib/candidate-workflow-types").DmAssignmentSource | null;
  dmAssignedAt?: string | null;
  dmAssignedBy?: string | null;
  paperworkStatus?: PaperworkStatus;
  paperworkTemplateKey?: string | null;
  signatureRequestId?: string | null;
  paperworkSentAt?: string | null;
  paperworkSignedAt?: string | null;
  paperworkViewedAt?: string | null;
  paperworkError?: string | null;
  lastActionAt?: string | null;
  notes?: string[];
  history?: CandidateWorkflowEvent[];
  actionType?: string | null;
  nextActionNeeded?: string;
  source?: string;
  hasResume?: boolean;
  recommendInterview?: boolean;
};

export type HiringWorkspaceApplicantRow = {
  candidateId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  hiringScore: number;
  hiringScoreReasons: HiringScoreReason[];
  distanceMiles: number | null;
  appliedDate: string;
  breezyStage: string;
  workflowStatus: CandidateWorkflowStatus;
  paperworkStatus: PaperworkStatus;
  dropboxSignStatus: string;
  signatureRequestId: string | null;
  paperworkTemplateKey: string | null;
  recruiter: string;
  dm: string;
  recruiterAssignmentSource: import("@/lib/candidate-workflow-types").RecruiterAssignmentSource | null;
  recruiterAssignedAt: string | null;
  recruiterAssignedBy: string | null;
  recruiterConfirmationStatus: import("@/lib/candidate-workflow-types").OwnershipConfirmationStatus | null;
  dmAssignmentSource: import("@/lib/candidate-workflow-types").DmAssignmentSource | null;
  dmAssignedAt: string | null;
  dmAssignedBy: string | null;
  email: string;
  phone: string;
  lastActivity: string | null;
  city: string;
  state: string;
  zipCode: string;
  positionId: string;
  positionName: string;
  source: string;
  hasResume: boolean;
  nextActionNeeded: string;
  notes: string[];
  history: CandidateWorkflowEvent[];
  paperworkSentAt: string | null;
  paperworkSignedAt: string | null;
  paperworkViewedAt: string | null;
  paperworkError: string | null;
  readyForPaperwork: boolean;
  eligibility: HiringEligibilityPanel;
};

export type HiringSummaryRibbon = {
  applicants: number;
  qualified: number;
  paperworkNeeded: number;
  paperworkSent: number;
  signed: number;
  readyForMel: number;
  averageDistanceMiles: number | null;
  newestApplicantAt: string | null;
  oldestApplicantAt: string | null;
  lastSync: string | null;
};

export type PaperworkPreviewModel = {
  candidateId: string;
  candidateName: string;
  recipientEmail: string;
  templateKey: string;
  templateLabel: string;
  eligibility: HiringEligibilityPanel;
  action: "preview_only" | "preview_then_live_confirm";
  /** When true, confirm continues to P260 live send confirmation. */
  liveSendWired: boolean;
  confirmLabel: string;
  warning: string;
  details: Array<{ label: string; value: string }>;
};

export type HiringWorkspaceActivityItem = Omit<JobCommandCenterActivityItem, "kind"> & {
  kind: JobCommandCenterActivityItem["kind"] | "reminder" | "operator" | "email";
};

export type HiringWorkspaceModel = {
  overview: JobCommandCenterOverview;
  ribbon: HiringSummaryRibbon;
  pipeline: HiringPipelineBucket[];
  applicants: HiringWorkspaceApplicantRow[];
  activity: HiringWorkspaceActivityItem[];
  dataNotes: string[];
  source: {
    candidatesFromCache: boolean;
    workflowsLoaded: boolean;
    candidateCountConsidered: number;
  };
  /** Operator actions never auto-write; preview path only. */
  writePolicy: {
    autoWrites: false;
    paperworkSendMode: "preview_confirm_only";
  };
};
