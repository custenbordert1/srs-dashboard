import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { BreezyJob } from "@/lib/breezy-api";

export type CandidateAdvancementAction =
  | "send-paperwork"
  | "call-first"
  | "reject"
  | "hold"
  | "none";

export const ADVANCEMENT_ACTION_LABELS: Record<
  Exclude<CandidateAdvancementAction, "none">,
  string
> = {
  "send-paperwork": "Send Paperwork",
  "call-first": "Call First",
  reject: "Reject",
  hold: "Hold",
};

export type CandidateAdvancementDecision = {
  candidateId: string;
  action: CandidateAdvancementAction;
  reason: string;
  confidence: number;
  shouldAdvance: boolean;
  shouldPersist: boolean;
  requiresApproval: boolean;
};

export type CandidateAdvancementPolicy = {
  requireApproval: boolean;
};

export type CandidateAdvancementEngineOptions = {
  jobsByPositionId: Map<string, BreezyJob>;
  paperworkByGrade: PaperworkByGrade;
  requireApproval?: boolean;
};
