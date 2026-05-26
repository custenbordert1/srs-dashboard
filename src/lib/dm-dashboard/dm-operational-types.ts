import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import type { PipelineStageBucket } from "@/lib/dm-dashboard/candidate-pipeline";

export type DmCandidateStageCounts = Record<PipelineStageBucket, number>;

export type DmJobOperationalDetail = {
  jobId: string;
  title: string;
  city: string;
  state: string;
  cityKey: string;
  jobAgeDays: number | null;
  applicantCount: number;
  interviewingCount: number;
  lastApplicantAt: string | null;
  daysSinceLastApplicant: number | null;
  payRange: string | null;
  assignedRecruiter: string | null;
  priority: DmPrioritizedAlert["priority"] | null;
  priorityScore: number | null;
  recommendedAction: string | null;
  relatedAlertIds: string[];
  candidateCounts: DmCandidateStageCounts;
};

export type DmCityOperationalSummary = {
  cityKey: string;
  label: string;
  city: string;
  state: string;
  openJobs: number;
  demandLevel: "Critical" | "High" | "Medium" | "Low";
  demandScore: number;
  jobIds: string[];
  relatedAlertIds: string[];
};

export type DmStateOperationalSummary = {
  state: string;
  openJobs: number;
  alertCount: number;
  demandLevel: "Critical" | "High" | "Medium" | "Low";
  jobIds: string[];
};

export type DmOperationalIndex = {
  jobsById: Record<string, DmJobOperationalDetail>;
  citiesByKey: Record<string, DmCityOperationalSummary>;
  statesByCode: Record<string, DmStateOperationalSummary>;
  alertsById: Record<string, DmPrioritizedAlert>;
};

export type DmOperationalDrawerTarget =
  | { type: "job"; jobId: string }
  | { type: "city"; cityKey: string }
  | { type: "state"; state: string }
  | { type: "alert"; alertId: string };

export type DmEscalationActionType =
  | "escalate-recruiting"
  | "request-repost"
  | "request-pay-review"
  | "expand-radius";

export const DM_ESCALATION_ACTION_LABELS: Record<DmEscalationActionType, string> = {
  "escalate-recruiting": "Escalate to recruiting",
  "request-repost": "Request repost",
  "request-pay-review": "Request pay review",
  "expand-radius": "Expand radius",
};

export type DmEscalationLogEntry = {
  id: string;
  actionType: DmEscalationActionType;
  label: string;
  jobId?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  dmUserId: string;
  dmUserName: string;
  territoryStates: string[];
  createdAt: string;
};
