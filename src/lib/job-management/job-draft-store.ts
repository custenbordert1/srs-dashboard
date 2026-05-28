import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import type {
  JobDraft,
  JobPushAuditEntry,
  JobVariantMeta,
  JobVariantQueueStatus,
} from "@/lib/job-management/job-draft-types";
import { normalizeJobDraft, normalizeJobDraftStatus } from "@/lib/job-management/job-draft-status";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORE_DIR = path.join(process.cwd(), ".data");
const DRAFTS_PATH = path.join(STORE_DIR, "job-drafts.json");
const PUSH_AUDIT_PATH = path.join(STORE_DIR, "job-push-audit.jsonl");

type JobDraftStoreFile = {
  drafts: JobDraft[];
  updatedAt: string;
};

async function readDrafts(): Promise<JobDraftStoreFile> {
  try {
    const raw = await readFile(DRAFTS_PATH, "utf8");
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
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(DRAFTS_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function listJobDrafts(): Promise<JobDraft[]> {
  return (await readDrafts()).drafts.map(normalizeJobDraft).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getJobDraft(id: string): Promise<JobDraft | null> {
  const draft = (await readDrafts()).drafts.find((d) => d.id === id) ?? null;
  return draft ? normalizeJobDraft(draft) : null;
}

/** Reuse an open local draft cloned from the same Breezy position (prevents duplicate drafts). */
export async function findOpenDraftByClonedBreezyJobId(breezyJobId: string): Promise<JobDraft | null> {
  return (
    (await readDrafts()).drafts.find(
      (draft) => draft.clonedFromBreezyJobId === breezyJobId && draft.status === "draft",
    ) ?? null
  );
}

export async function createJobDrafts(
  inputs: Array<
    Omit<JobDraft, "id" | "status" | "createdAt" | "updatedAt"> & { status?: JobDraft["status"] }
  >,
): Promise<JobDraft[]> {
  const now = new Date().toISOString();
  const created = inputs.map((input) => ({
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
    variant: input.variant,
    breezyJobId: input.breezyJobId,
    pushedAt: input.pushedAt,
    pushError: input.pushError,
    createdAt: now,
    updatedAt: now,
  })) satisfies JobDraft[];

  const file = await readDrafts();
  file.drafts.unshift(...created);
  file.updatedAt = now;
  await writeDrafts(file);
  return created;
}

export async function createJobDraft(
  input: Omit<JobDraft, "id" | "status" | "createdAt" | "updatedAt"> & { status?: JobDraft["status"] },
): Promise<JobDraft> {
  const [draft] = await createJobDrafts([input]);
  return draft!;
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
      | "pushedBy"
      | "pushError"
      | "lastSyncAt"
      | "lastVerificationResult"
      | "variant"
    >
  >,
): Promise<JobDraft | null> {
  const file = await readDrafts();
  const index = file.drafts.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const existing = normalizeJobDraft(file.drafts[index]!);
  const variantQueueOnly =
    patch.variant?.queueStatus !== undefined &&
    Object.keys(patch).every((key) => key === "variant");
  const lifecycleOnly =
    patch.status !== undefined &&
    Object.keys(patch).every((key) =>
      ["status", "breezyJobId", "pushedAt", "pushedBy", "pushError", "lastSyncAt", "lastVerificationResult", "variant"].includes(
        key,
      ),
    );
  const editableContent =
    normalizeJobDraftStatus(existing.status) === "draft" ||
    normalizeJobDraftStatus(existing.status) === "push_failed";
  if (!editableContent && patch.status === undefined && !variantQueueOnly && !lifecycleOnly) {
    return existing;
  }
  const updated: JobDraft = normalizeJobDraft({
    ...existing,
    ...patch,
    variant:
      patch.variant && existing.variant
        ? { ...existing.variant, ...patch.variant }
        : patch.variant ?? existing.variant,
    updatedAt: new Date().toISOString(),
  });
  file.drafts[index] = updated;
  file.updatedAt = updated.updatedAt;
  await writeDrafts(file);
  return updated;
}

export async function updateJobVariantQueueStatus(
  id: string,
  queueStatus: JobVariantQueueStatus,
): Promise<JobDraft | null> {
  const draft = await getJobDraft(id);
  if (!draft?.variant) return null;
  return updateJobDraft(id, {
    variant: { ...draft.variant, queueStatus },
  });
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
  await mkdir(STORE_DIR, { recursive: true });
  await appendFile(PUSH_AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}
