import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowState,
  CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";

export const P223_PHASE = "P223" as const;

/** Stages that require continued Recruiter Inbox visibility when missing from ingestion. */
export const P223_ACTIVE_VISIBILITY_STAGES: readonly CandidateWorkflowStatus[] = [
  "Qualified",
  "Operator Approved",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Training Needed",
] as const;

/** Terminal / inactive stages — never restored into the Inbox list. */
export const P223_TERMINAL_STAGES: readonly CandidateWorkflowStatus[] = [
  "Not Qualified",
  "Loaded in MEL",
  "Active Rep",
] as const;

export type P223ListMembershipSource = "ingestion" | "workflow_restored";

export type P223ProfileHydration = {
  candidateId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  positionId?: string;
  positionName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  appliedDate?: string;
};

export type P223UnionInput = {
  ingestionCandidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  /** Optional durable profile hints keyed by candidateId (questionnaire, prior enrich, etc.). */
  profilesById?: Record<string, P223ProfileHydration>;
};

export type P223UnionResult = {
  candidates: BreezyCandidate[];
  ingestionCount: number;
  restoredCount: number;
  restoredCandidateIds: string[];
  skippedTerminalIds: string[];
  skippedAlreadyInIngestionIds: string[];
};

export function isP223TerminalWorkflowStage(status: string): boolean {
  return (P223_TERMINAL_STAGES as readonly string[]).includes(status);
}

export function isP223OperationallyActiveWorkflowStage(status: string): boolean {
  if (isP223TerminalWorkflowStage(status)) return false;
  return (P223_ACTIVE_VISIBILITY_STAGES as readonly string[]).includes(status);
}

export function p223ListMembershipSource(
  candidate: Pick<BreezyCandidate, "listMembershipSource">,
): P223ListMembershipSource {
  return candidate.listMembershipSource === "workflow_restored"
    ? "workflow_restored"
    : "ingestion";
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function isoDateOnly(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.length >= 10 ? value.slice(0, 10) : "";
  }
  return parsed.toISOString().slice(0, 10);
}

/**
 * Build a minimal BreezyCandidate stub for a workflow-only active record.
 * Display appliedDate prefers recent workflow activity so default MTD scope
 * does not hide operationally active restored rows.
 */
export function buildP223WorkflowRestoredCandidate(args: {
  workflow: CandidateWorkflowRecord;
  profile?: P223ProfileHydration | null;
}): BreezyCandidate {
  const { workflow, profile } = args;
  const email =
    profile?.email?.trim() ||
    workflow.onboardingContactEmail?.trim() ||
    "";
  let firstName = profile?.firstName?.trim() || "";
  let lastName = profile?.lastName?.trim() || "";
  if ((!firstName || !lastName) && profile?.firstName?.includes(" ")) {
    const split = splitName(profile.firstName);
    firstName = firstName || split.firstName;
    lastName = lastName || split.lastName;
  }
  if (!firstName) {
    firstName = email ? email.split("@")[0] || "Unknown" : "Unknown";
  }
  if (!lastName) {
    lastName = "Candidate";
  }

  const activityDate =
    isoDateOnly(workflow.paperworkSentAt) ||
    isoDateOnly(workflow.lastActionAt) ||
    isoDateOnly(workflow.updatedAt) ||
    isoDateOnly(profile?.appliedDate) ||
    new Date().toISOString().slice(0, 10);

  return {
    candidateId: workflow.candidateId,
    firstName,
    lastName,
    email,
    phone: profile?.phone?.trim() || "",
    source: "workflow_restored",
    stage: workflow.workflowStatus,
    appliedDate: activityDate,
    createdDate: activityDate,
    addedDate: activityDate,
    updatedDate: isoDateOnly(workflow.updatedAt) || activityDate,
    addedDateSource: "p223_workflow_restored",
    positionId: profile?.positionId?.trim() || "",
    positionName: profile?.positionName?.trim() || workflow.workflowStatus,
    city: profile?.city?.trim() || "",
    state: profile?.state?.trim() || "",
    zipCode: profile?.zipCode?.trim() || "",
    resumeText: "",
    hasResume: false,
    listMembershipSource: "workflow_restored",
  };
}

/**
 * Safe union: ingestion candidates + operationally active workflow-only rows.
 * - No duplicates (ingestion wins for profile identity).
 * - Workflow state is applied later by buildScoredWorkflowRow / buildBaselineWorkflowRow.
 * - Terminal workflow stages are never restored.
 */
export function unionP223InboxCandidates(input: P223UnionInput): P223UnionResult {
  const ingestion = input.ingestionCandidates.map((candidate) => ({
    ...candidate,
    listMembershipSource:
      candidate.listMembershipSource === "workflow_restored"
        ? ("workflow_restored" as const)
        : ("ingestion" as const),
  }));
  const ingestionIds = new Set(ingestion.map((candidate) => candidate.candidateId));

  const restored: BreezyCandidate[] = [];
  const restoredCandidateIds: string[] = [];
  const skippedTerminalIds: string[] = [];
  const skippedAlreadyInIngestionIds: string[] = [];

  for (const [candidateId, workflow] of Object.entries(input.workflows)) {
    if (!workflow) continue;
    if (ingestionIds.has(candidateId)) {
      skippedAlreadyInIngestionIds.push(candidateId);
      continue;
    }
    if (isP223TerminalWorkflowStage(workflow.workflowStatus)) {
      skippedTerminalIds.push(candidateId);
      continue;
    }
    if (!isP223OperationallyActiveWorkflowStage(workflow.workflowStatus)) {
      continue;
    }
    const profile = input.profilesById?.[candidateId] ?? null;
    restored.push(
      buildP223WorkflowRestoredCandidate({
        workflow,
        profile,
      }),
    );
    restoredCandidateIds.push(candidateId);
  }

  return {
    candidates: [...ingestion, ...restored],
    ingestionCount: ingestion.length,
    restoredCount: restored.length,
    restoredCandidateIds,
    skippedTerminalIds,
    skippedAlreadyInIngestionIds,
  };
}

/**
 * After scope filtering, re-attach operationally restored rows so MTD/historical
 * scope cannot hide active paperwork/interview/MEL work.
 * Generic so scored Inbox rows keep their enriched type (not narrowed to BreezyCandidate).
 */
export function retainP223RestoredThroughScope<
  T extends Pick<BreezyCandidate, "candidateId" | "listMembershipSource">,
>(args: {
  allCandidates: T[];
  scopedCandidates: T[];
}): T[] {
  const scopedIds = new Set(args.scopedCandidates.map((c) => c.candidateId));
  const extras = args.allCandidates.filter(
    (candidate) =>
      p223ListMembershipSource(candidate) === "workflow_restored" &&
      !scopedIds.has(candidate.candidateId),
  );
  if (extras.length === 0) return args.scopedCandidates;
  return [...args.scopedCandidates, ...extras];
}

/** Active workflow IDs missing from the current ingestion snapshot. */
export function selectP223RestorableWorkflowIds(
  workflows: CandidateWorkflowState,
  ingestionIds: Set<string>,
): string[] {
  const ids: string[] = [];
  for (const [candidateId, workflow] of Object.entries(workflows)) {
    if (!workflow) continue;
    if (ingestionIds.has(candidateId)) continue;
    if (!isP223OperationallyActiveWorkflowStage(workflow.workflowStatus)) continue;
    ids.push(candidateId);
  }
  return ids;
}

/** Cache key helpers — bust when durable workflow store updatedAt advances. */
export const P223_WORKFLOW_CACHE_KEY_PREFIX = "candidates:workflows";

export function p223WorkflowCacheKey(updatedAt?: string | null): string {
  const stamp = updatedAt?.trim() || "unknown";
  return `${P223_WORKFLOW_CACHE_KEY_PREFIX}:v2:${stamp}`;
}
