import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import type { JobDraft, JobPushAuditEntry } from "@/lib/job-management/job-draft-types";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function draftsPath(): string {
  return path.join(recruitingDataDir(), "job-drafts.json");
}

function pushAuditPath(): string {
  return path.join(recruitingDataDir(), "job-push-audit.jsonl");
}

type JobDraftStoreFile = {
  drafts: JobDraft[];
  updatedAt: string;
};

async function readDrafts(): Promise<JobDraftStoreFile> {
  try {
    const raw = await readFile(draftsPath(), "utf8");
    const parsed = JSON.parse(raw) as JobDraftStoreFile;
    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { drafts: [], updatedAt: new Date().toISOString() };
  }
}

async function writeDrafts(file: JobDraftStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(draftsPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function listJobDrafts(): Promise<JobDraft[]> {
  return (await readDrafts()).drafts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getJobDraft(id: string): Promise<JobDraft | null> {
  return (await readDrafts()).drafts.find((d) => d.id === id) ?? null;
}

/** Reuse an open local draft cloned from the same Breezy position (prevents duplicate drafts). */
export async function findOpenDraftByClonedBreezyJobId(breezyJobId: string): Promise<JobDraft | null> {
  return (
    (await readDrafts()).drafts.find(
      (draft) => draft.clonedFromBreezyJobId === breezyJobId && draft.status === "draft",
    ) ?? null
  );
}

export async function createJobDraft(
  input: Omit<JobDraft, "id" | "status" | "createdAt" | "updatedAt"> & { status?: JobDraft["status"] },
): Promise<JobDraft> {
  const now = new Date().toISOString();
  const draft: JobDraft = {
    id: randomUUID(),
    status: input.status ?? "draft",
    clonedFromBreezyJobId: input.clonedFromBreezyJobId,
    title: input.title,
    description: input.description,
    city: input.city,
    usState: input.usState,
    payRate: input.payRate,
    department: input.department,
    source: input.source,
    metadata: input.metadata,
    breezyJobId: input.breezyJobId,
    pushedAt: input.pushedAt,
    pushError: input.pushError,
    createdAt: now,
    updatedAt: now,
  };
  const file = await readDrafts();
  file.drafts.unshift(draft);
  file.updatedAt = now;
  await writeDrafts(file);
  return draft;
}

export async function updateJobDraft(
  id: string,
  patch: Partial<
    Pick<
      JobDraft,
      | "title"
      | "description"
      | "city"
      | "usState"
      | "payRate"
      | "department"
      | "source"
      | "metadata"
      | "status"
      | "breezyJobId"
      | "pushedAt"
      | "pushError"
    >
  >,
): Promise<JobDraft | null> {
  const file = await readDrafts();
  const index = file.drafts.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const existing = file.drafts[index]!;
  if (existing.status !== "draft" && patch.status === undefined) {
    return existing;
  }
  const updated: JobDraft = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  file.drafts[index] = updated;
  file.updatedAt = updated.updatedAt;
  await writeDrafts(file);
  return updated;
}

export async function deleteJobDraft(id: string): Promise<boolean> {
  const file = await readDrafts();
  const index = file.drafts.findIndex((d) => d.id === id);
  if (index < 0) return false;
  const draft = file.drafts[index]!;
  if (draft.status !== "draft") return false;
  file.drafts.splice(index, 1);
  file.updatedAt = new Date().toISOString();
  await writeDrafts(file);
  return true;
}

export async function appendJobPushAudit(entry: JobPushAuditEntry): Promise<void> {
  await safeRecruitingMkdir();
  await appendFile(pushAuditPath(), `${JSON.stringify(entry)}\n`, "utf8");
}
