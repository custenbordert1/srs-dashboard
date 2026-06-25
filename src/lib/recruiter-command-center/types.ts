import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import type { RecruiterActionType, RecruiterActionPriority } from "@/lib/recruiter-action-engine/types";
import type { RecruiterPriorityLevel } from "@/lib/recruiter-priority";

export type RecruiterWorkCategoryId =
  | "new-applicants"
  | "needs-review"
  | "ready-for-interview"
  | "ready-for-paperwork"
  | "awaiting-signature"
  | "ready-for-mel"
  | "overdue-actions"
  | "sla-risks";

export const RECRUITER_WORK_CATEGORY_ORDER: RecruiterWorkCategoryId[] = [
  "overdue-actions",
  "sla-risks",
  "awaiting-signature",
  "ready-for-mel",
  "ready-for-paperwork",
  "ready-for-interview",
  "needs-review",
  "new-applicants",
];

export const RECRUITER_WORK_CATEGORY_LABELS: Record<RecruiterWorkCategoryId, string> = {
  "new-applicants": "New applicants",
  "needs-review": "Needs review",
  "ready-for-interview": "Ready for interview",
  "ready-for-paperwork": "Ready for paperwork",
  "awaiting-signature": "Awaiting signature",
  "ready-for-mel": "Ready for MEL",
  "overdue-actions": "Overdue actions",
  "sla-risks": "SLA risks",
};

export type RecruiterCommandCenterKpi = {
  id: string;
  label: string;
  value: number;
  alert?: boolean;
  hint?: string;
};

export type RecruiterCommandCenterWorkItem = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  recruiter: string;
  assignedDm: string;
  positionName: string;
  positionId: string;
  grade: AiLetterGrade;
  confidencePercent: number | null;
  workflowStatus: string;
  category: RecruiterWorkCategoryId;
  categoryLabel: string;
  nextAction: string;
  actionType: RecruiterActionType;
  actionPriority: RecruiterActionPriority;
  actionDueDate: string | null;
  actionOverdue: boolean;
  priorityScore: number;
  priorityLevel: RecruiterPriorityLevel;
  priorityReasons: string[];
  positionUrgency: CoverageStatus;
  slaRisk: boolean;
  slaStatus: string;
  coverageUrgent: boolean;
  queueAgeHours: number | null;
  followUpDueDate: string | null;
  paperworkStatus: PaperworkStatus;
  paperworkStatusLabel: string;
  readyForMel: boolean;
  lastActivityDate: string | null;
  notesText: string;
};

export type RecruiterCommandCenterRecruiterSummary = {
  recruiter: string;
  totalWorkItems: number;
  highPriorityCount: number;
  overdueCount: number;
  slaRiskCount: number;
  categoryCounts: Record<RecruiterWorkCategoryId, number>;
};

export type RecruiterCommandCenterQueueCounts = Record<RecruiterWorkCategoryId, number> & {
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  overdue: number;
  slaRisk: number;
};

export type RecruiterCommandCenter = {
  fetchedAt: string;
  scope: "mtd";
  readOnly: true;
  kpis: RecruiterCommandCenterKpi[];
  recruiterSummaries: RecruiterCommandCenterRecruiterSummary[];
  workQueue: RecruiterCommandCenterWorkItem[];
  topPriorities: RecruiterCommandCenterWorkItem[];
  queueCounts: RecruiterCommandCenterQueueCounts;
};
