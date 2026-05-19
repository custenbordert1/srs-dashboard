/**
 * Automation integration stubs — wire providers without coupling UI to vendors.
 */
export type AutomationHookId =
  | "candidate-sms"
  | "candidate-email"
  | "interview-schedule"
  | "paperwork-workflow"
  | "mel-rep-load";

export type AutomationHookStatus = "ready" | "stub" | "disabled";

export type AutomationHook = {
  id: AutomationHookId;
  label: string;
  description: string;
  status: AutomationHookStatus;
  /** Example payload keys for downstream workers / MEL. */
  payloadFields: string[];
};

export const AUTOMATION_HOOKS: AutomationHook[] = [
  {
    id: "candidate-sms",
    label: "Auto text candidates",
    description: "Trigger SMS outreach from ranked candidate queues.",
    status: "stub",
    payloadFields: ["candidateId", "phone", "templateId", "territoryStates"],
  },
  {
    id: "candidate-email",
    label: "Auto email candidates",
    description: "Drip and one-off email sequences from territory alerts.",
    status: "stub",
    payloadFields: ["candidateId", "email", "templateId", "jobId"],
  },
  {
    id: "interview-schedule",
    label: "Auto interview scheduling",
    description: "Calendar holds for high-score applicants in interview stages.",
    status: "stub",
    payloadFields: ["candidateId", "recruiterEmail", "positionId", "preferredSlots"],
  },
  {
    id: "paperwork-workflow",
    label: "Auto paperwork workflows",
    description: "HelloSign packet staging when qualified + profile complete.",
    status: "ready",
    payloadFields: ["candidateId", "workflowStatus", "packetType"],
  },
  {
    id: "mel-rep-load",
    label: "MEL integration",
    description: "Rep creation payload when signed / ready for MEL.",
    status: "stub",
    payloadFields: ["candidateId", "melProjectId", "territory", "startDate"],
  },
];

export type AutomationDispatchRequest = {
  hookId: AutomationHookId;
  candidateId: string;
  metadata?: Record<string, string>;
};
