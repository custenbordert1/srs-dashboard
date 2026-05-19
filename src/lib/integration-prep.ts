import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export type IntegrationPrepCandidate = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionName: string;
  city: string;
  state: string;
};

export type IntegrationPrepStatus = {
  id: "hellosign" | "mel" | "training";
  label: string;
  ready: boolean;
  statusLabel: string;
  missingFields: string[];
  message: string;
};

function missingFields(candidate: IntegrationPrepCandidate): string[] {
  const required: Array<[keyof IntegrationPrepCandidate, string]> = [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["positionName", "Position"],
    ["city", "City"],
    ["state", "State"],
  ];
  return required.filter(([key]) => !String(candidate[key] ?? "").trim()).map(([, label]) => label);
}

export function buildIntegrationPrep(
  candidate: IntegrationPrepCandidate,
  workflowStatus: CandidateWorkflowStatus,
): IntegrationPrepStatus[] {
  const missing = missingFields(candidate);
  const paperworkReady =
    missing.length === 0 &&
    (workflowStatus === "Qualified" ||
      workflowStatus === "Paperwork Needed" ||
      workflowStatus === "Paperwork Sent" ||
      workflowStatus === "Signed");

  const melReady =
    missing.length === 0 &&
    (workflowStatus === "Signed" || workflowStatus === "Ready for MEL" || workflowStatus === "Loaded in MEL");

  const trainingReady =
    missing.length === 0 &&
    (workflowStatus === "Ready for MEL" ||
      workflowStatus === "Loaded in MEL" ||
      workflowStatus === "Training Needed" ||
      workflowStatus === "Active Rep");

  return [
    {
      id: "hellosign",
      label: "HelloSign paperwork",
      ready: paperworkReady,
      statusLabel: paperworkReady ? "Ready for packet prep" : "Missing requirements",
      missingFields: missing,
      message: paperworkReady
        ? "Candidate profile is complete enough for HelloSign packet staging (send still disabled)."
        : "Complete profile fields and qualify candidate before paperwork prep.",
    },
    {
      id: "mel",
      label: "MEL rep creation",
      ready: melReady,
      statusLabel: melReady ? "Ready for MEL load prep" : "Not ready",
      missingFields: missing,
      message: melReady
        ? "Signed paperwork path detected — ready for MEL rep creation staging."
        : "Move candidate to Signed / Ready for MEL before MEL prep.",
    },
    {
      id: "training",
      label: "Training assignment",
      ready: trainingReady,
      statusLabel: trainingReady ? "Ready for training prep" : "Not ready",
      missingFields: missing,
      message: trainingReady
        ? "Candidate is in post-MEL lifecycle — ready for training assignment automation prep."
        : "Load into MEL before training automation prep.",
    },
  ];
}
