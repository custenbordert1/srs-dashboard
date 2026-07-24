import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

export type P243IdempotencyRecord = {
  candidateId: string;
  emailFingerprint: string | null;
  fingerprint: string;
  outcome: string;
  paperworkSent: boolean;
  signatureRequestId: string | null;
  processedAt: string;
  batchId: string;
};

export type P243IdempotencyStoreFile = {
  version: 2;
  updatedAt: string;
  lastCheckedAt: string | null;
  lastWebhookCursorAt: string | null;
  records: Record<string, P243IdempotencyRecord>;
  /** email fingerprint → candidateId for cross-id duplicate detection */
  emailIndex: Record<string, string>;
};

export function p243IdempotencyStorePath(): string {
  return path.join(recruitingDataDir(), "p243-autonomous-cycle-idempotency.json");
}

function emptyStore(): P243IdempotencyStoreFile {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastWebhookCursorAt: null,
    records: {},
    emailIndex: {},
  };
}

export function normalizeEmailFingerprint(email: string | null | undefined): string | null {
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!normalized.includes("@")) return null;
  return createHash("sha256").update(`p243-email:${normalized}`).digest("hex").slice(0, 16);
}

export async function loadP243IdempotencyStore(): Promise<P243IdempotencyStoreFile> {
  try {
    const raw = await readFile(p243IdempotencyStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P243IdempotencyStoreFile> & {
      version?: number;
      records?: Record<string, P243IdempotencyRecord>;
    };
    const base = emptyStore();
    return {
      ...base,
      ...parsed,
      version: 2,
      records: parsed.records ?? {},
      emailIndex: parsed.emailIndex ?? {},
      lastCheckedAt: parsed.lastCheckedAt ?? null,
      lastWebhookCursorAt: parsed.lastWebhookCursorAt ?? null,
    };
  } catch {
    return emptyStore();
  }
}

export async function saveP243IdempotencyStore(store: P243IdempotencyStoreFile): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  await mkdir(recruitingDataDir(), { recursive: true });
  store.updatedAt = new Date().toISOString();
  store.version = 2;
  await writeFile(p243IdempotencyStorePath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function buildP243Fingerprint(input: {
  candidateId: string;
  email?: string | null;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  recommendation: string;
}): string {
  const emailFp = normalizeEmailFingerprint(input.email);
  return createHash("sha256")
    .update(
      [
        input.candidateId,
        emailFp ?? "",
        input.workflowStatus,
        input.paperworkStatus,
        input.signatureRequestId ?? "",
        input.recommendation,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

/** Never re-process if paperwork already sent for this id or email. */
export function hasAlreadySentPaperwork(
  store: P243IdempotencyStoreFile,
  candidateId: string,
  email?: string | null,
): { blocked: boolean; reason: string | null } {
  const byId = store.records[candidateId];
  if (byId?.paperworkSent || byId?.signatureRequestId) {
    return { blocked: true, reason: "idempotency_store_already_sent" };
  }
  const emailFp = normalizeEmailFingerprint(email);
  if (emailFp) {
    const owner = store.emailIndex[emailFp];
    if (owner && owner !== candidateId) {
      const other = store.records[owner];
      if (other?.paperworkSent || other?.signatureRequestId) {
        return { blocked: true, reason: "email_fingerprint_already_sent" };
      }
    }
  }
  return { blocked: false, reason: null };
}

export function shouldSkipIdempotent(
  store: P243IdempotencyStoreFile,
  candidateId: string,
  fingerprint: string,
): boolean {
  const existing = store.records[candidateId];
  return Boolean(existing && existing.fingerprint === fingerprint);
}

export function recordIdempotent(
  store: P243IdempotencyStoreFile,
  record: P243IdempotencyRecord,
): P243IdempotencyStoreFile {
  const emailIndex = { ...store.emailIndex };
  if (record.emailFingerprint) {
    emailIndex[record.emailFingerprint] = record.candidateId;
  }
  return {
    ...store,
    records: { ...store.records, [record.candidateId]: record },
    emailIndex,
  };
}

export function touchLastChecked(
  store: P243IdempotencyStoreFile,
  at = new Date().toISOString(),
): P243IdempotencyStoreFile {
  return { ...store, lastCheckedAt: at };
}
