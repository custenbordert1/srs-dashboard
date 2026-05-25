export type DirectDepositStatus = "not_requested" | "requested" | "received" | "approved";

export const DIRECT_DEPOSIT_STATUSES: DirectDepositStatus[] = [
  "not_requested",
  "requested",
  "received",
  "approved",
];

export const DIRECT_DEPOSIT_HR_EMAIL = "humanresource@srsmerchandising.com";

export const DIRECT_DEPOSIT_EMAIL_SUBJECT = "Direct Deposit Verification Needed";

export function normalizeDirectDepositStatus(value: unknown): DirectDepositStatus {
  if (typeof value === "string" && DIRECT_DEPOSIT_STATUSES.includes(value as DirectDepositStatus)) {
    return value as DirectDepositStatus;
  }
  return "not_requested";
}

export function directDepositPipelineStep(
  paperworkStatus: string,
  directDepositStatus: DirectDepositStatus,
): {
  paperworkSigned: boolean;
  ddRequested: boolean;
  ddReceived: boolean;
  ddApproved: boolean;
} {
  const paperworkSigned = paperworkStatus === "signed";
  return {
    paperworkSigned,
    ddRequested:
      directDepositStatus === "requested" ||
      directDepositStatus === "received" ||
      directDepositStatus === "approved",
    ddReceived: directDepositStatus === "received" || directDepositStatus === "approved",
    ddApproved: directDepositStatus === "approved",
  };
}

export function directDepositStatusLabel(status: DirectDepositStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "received":
      return "Received";
    case "approved":
      return "Approved";
    default:
      return "Not requested";
  }
}
