import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { ExecutionStatus, RecommendationType } from "@/lib/autonomous-recruiting-execution/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function correlationPath(): string {
  return path.join(recruitingDataDir(), "autopilot-execution-correlation.json");
}

export type ExecutionCorrelation = {
  id: string;
  recommendationId: string;
  territory: string;
  type: RecommendationType;
  priority: "high" | "medium" | "low";
  status: ExecutionStatus;
  createdAt: string;
  approvedBy?: string;
  completedAt?: string;
  jobDraftId?: string;
  automationRunId?: string;
  accountabilityActionId?: string;
  candidateId?: string;
  displayTitle?: string;
  adType?: "create-new-ad" | "close-pause-ad" | "refresh-ad";
  hiringAction?: string;
  placementProjectId?: string;
  placementMatchLabel?: string;
  refreshCount?: number;
  positionId?: string;
  breezyJobId?: string;
  city?: string;
  state?: string;
  reason?: string;
};

type CorrelationStoreFile = {
  correlations: ExecutionCorrelation[];
  updatedAt: string;
};

async function readCorrelationFile(): Promise<CorrelationStoreFile> {
  try {
    const raw = await readFile(correlationPath(), "utf8");
    const parsed = JSON.parse(raw) as CorrelationStoreFile;
    return {
      correlations: Array.isArray(parsed.correlations) ? parsed.correlations : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { correlations: [], updatedAt: new Date().toISOString() };
  }
}

async function writeCorrelationFile(file: CorrelationStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(correlationPath(), JSON.stringify(file, null, 2), "utf8");
}

function initialStatus(
  approvalStatus?: "pending" | "approved" | "auto-approved",
): ExecutionStatus {
  if (approvalStatus === "approved" || approvalStatus === "auto-approved") return "recommended";
  return "detected";
}

export async function listCorrelations(): Promise<ExecutionCorrelation[]> {
  return (await readCorrelationFile()).correlations.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getCorrelation(id: string): Promise<ExecutionCorrelation | null> {
  return (await readCorrelationFile()).correlations.find((row) => row.id === id) ?? null;
}

export async function getCorrelationByRecommendationId(
  recommendationId: string,
): Promise<ExecutionCorrelation | null> {
  return (
    (await readCorrelationFile()).correlations.find(
      (row) => row.recommendationId === recommendationId && row.status !== "archived",
    ) ?? null
  );
}

export async function upsertCorrelations(
  incoming: ExecutionCorrelation[],
): Promise<ExecutionCorrelation[]> {
  const file = await readCorrelationFile();
  const now = new Date().toISOString();
  const byRecommendation = new Map(
    file.correlations
      .filter((row) => row.status !== "archived")
      .map((row) => [row.recommendationId, row]),
  );

  for (const row of incoming) {
    const existing = byRecommendation.get(row.recommendationId);
    if (existing) continue;
    file.correlations.unshift(row);
    byRecommendation.set(row.recommendationId, row);
  }

  file.updatedAt = now;
  await writeCorrelationFile(file);
  return file.correlations;
}

export async function planCorrelationsFromSnapshot(
  snapshot: AutonomousRecruitingSnapshot,
): Promise<ExecutionCorrelation[]> {
  const file = await readCorrelationFile();
  const existingByRecommendation = new Map(
    file.correlations
      .filter((row) => row.status !== "archived")
      .map((row) => [row.recommendationId, row]),
  );
  const now = new Date().toISOString();
  let changed = false;
  const planned: ExecutionCorrelation[] = [];

  for (const ad of snapshot.postingRecommendations) {
    const existing = existingByRecommendation.get(ad.id);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const correlation: ExecutionCorrelation = {
      id: randomUUID(),
      recommendationId: ad.id,
      territory: ad.territory,
      type: "posting",
      priority: ad.priority,
      createdAt: now,
      status: initialStatus(ad.approvalStatus),
      displayTitle: ad.title,
      adType: ad.adType,
      city: ad.city,
      state: ad.state,
      breezyJobId: ad.breezyJobId,
      positionId: ad.positionId,
      reason: ad.reason,
      refreshCount: ad.adType === "refresh-ad" ? 1 : 0,
    };
    file.correlations.unshift(correlation);
    existingByRecommendation.set(ad.id, correlation);
    planned.push(correlation);
    changed = true;
  }

  for (const hire of snapshot.hiringRecommendations) {
    if (hire.recommendedAction === "Reject") continue;

    const recommendationId = `hire-${hire.candidateId}`;
    const existing = existingByRecommendation.get(recommendationId);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const priority =
      hire.recommendedAction === "Hire Now"
        ? "high"
        : hire.recommendedAction === "Interview"
          ? "medium"
          : "low";

    const correlation: ExecutionCorrelation = {
      id: randomUUID(),
      recommendationId,
      territory: hire.territory,
      type: "hiring",
      priority,
      createdAt: now,
      status: "detected",
      candidateId: hire.candidateId,
      displayTitle: `${hire.recommendedAction}: ${hire.candidateName}`,
      hiringAction: hire.recommendedAction,
      reason: hire.reasons.join("; "),
    };
    file.correlations.unshift(correlation);
    existingByRecommendation.set(recommendationId, correlation);
    planned.push(correlation);
    changed = true;
  }

  for (const coverage of snapshot.coverageNeeds) {
    if (coverage.coverageStatus !== "Critical") continue;

    const recommendationId = `coverage-${coverage.territoryKey}`;
    const existing = existingByRecommendation.get(recommendationId);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const correlation: ExecutionCorrelation = {
      id: randomUUID(),
      recommendationId,
      territory: coverage.territoryLabel,
      type: "coverage",
      priority: "high",
      createdAt: now,
      status: "detected",
      displayTitle: `Critical coverage: ${coverage.territoryLabel}`,
      reason: coverage.recommendedAction,
    };
    file.correlations.unshift(correlation);
    existingByRecommendation.set(recommendationId, correlation);
    planned.push(correlation);
    changed = true;
  }

  if (changed) {
    file.updatedAt = now;
    await writeCorrelationFile(file);
  }

  return planned.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function approveCorrelation(
  id: string,
  actor?: string,
): Promise<ExecutionCorrelation | null> {
  const file = await readCorrelationFile();
  const index = file.correlations.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const existing = file.correlations[index]!;
  if (!["detected", "recommended"].includes(existing.status)) return null;

  const updated: ExecutionCorrelation = {
    ...existing,
    status: "approved",
    approvedBy: actor,
  };
  file.correlations[index] = updated;
  file.updatedAt = new Date().toISOString();
  await writeCorrelationFile(file);
  return updated;
}

export async function markCorrelationStatus(
  id: string,
  status: ExecutionStatus,
  patch?: Partial<Pick<ExecutionCorrelation, "completedAt" | "approvedBy">>,
): Promise<ExecutionCorrelation | null> {
  const file = await readCorrelationFile();
  const index = file.correlations.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const updated: ExecutionCorrelation = {
    ...file.correlations[index]!,
    ...patch,
    status,
    completedAt:
      status === "completed"
        ? patch?.completedAt ?? new Date().toISOString()
        : file.correlations[index]!.completedAt,
  };
  file.correlations[index] = updated;
  file.updatedAt = new Date().toISOString();
  await writeCorrelationFile(file);
  return updated;
}

export async function rejectCorrelation(
  id: string,
  actor?: string,
  reason?: string,
): Promise<ExecutionCorrelation | null> {
  const file = await readCorrelationFile();
  const index = file.correlations.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const existing = file.correlations[index]!;
  const updated: ExecutionCorrelation = {
    ...existing,
    status: "archived",
    approvedBy: actor,
    reason: reason ? `${existing.reason ?? ""} · Rejected: ${reason}`.trim() : existing.reason,
    completedAt: new Date().toISOString(),
  };
  file.correlations[index] = updated;
  file.updatedAt = new Date().toISOString();
  await writeCorrelationFile(file);
  return updated;
}

export async function markCorrelationForReview(
  id: string,
  actor?: string,
  note?: string,
): Promise<ExecutionCorrelation | null> {
  const file = await readCorrelationFile();
  const index = file.correlations.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const existing = file.correlations[index]!;
  const updated: ExecutionCorrelation = {
    ...existing,
    status: "recommended",
    approvedBy: actor,
    reason: note ? `${existing.reason ?? ""} · Needs review: ${note}`.trim() : existing.reason,
  };
  file.correlations[index] = updated;
  file.updatedAt = new Date().toISOString();
  await writeCorrelationFile(file);
  return updated;
}

export async function updateCorrelationLinks(
  id: string,
  links: Partial<
    Pick<
      ExecutionCorrelation,
      "jobDraftId" | "automationRunId" | "accountabilityActionId" | "candidateId"
    >
  >,
): Promise<ExecutionCorrelation | null> {
  const file = await readCorrelationFile();
  const index = file.correlations.findIndex((row) => row.id === id);
  if (index < 0) return null;

  file.correlations[index] = { ...file.correlations[index]!, ...links };
  file.updatedAt = new Date().toISOString();
  await writeCorrelationFile(file);
  return file.correlations[index]!;
}

/** @deprecated Use planCorrelationsFromSnapshot */
export const planExecutionsFromSnapshot = planCorrelationsFromSnapshot;

/** @deprecated Use listCorrelations */
export const listExecutions = listCorrelations;

/** @deprecated Use getCorrelation */
export const getExecution = getCorrelation;

/** @deprecated Use approveCorrelation */
export const approveExecution = approveCorrelation;
