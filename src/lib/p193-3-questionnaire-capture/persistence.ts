import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  compareAndSetDocument,
  getDocument,
  putDocument,
} from "@/lib/p185-5-vercel-durable-storage/adapter";
import type {
  P1933CaptureAuditEntry,
  P1933Checkpoint,
  P1933QuestionnaireRecord,
} from "@/lib/p193-3-questionnaire-capture/types";
import { P193_3_SCHEMA_VERSION } from "@/lib/p193-3-questionnaire-capture/types";

const DOC_KEY_PREFIX = "p1933:questionnaire:";
const DOC_KEY_CHECKPOINT = "p1933:checkpoint";
const DOC_KEY_HEALTH = "p1933:capture_health";

function localStorePath(): string {
  return path.join(recruitingDataDir(), "p193-3-questionnaire-store.json");
}

function auditPath(): string {
  return path.join(recruitingDataDir(), "p193-3-questionnaire-capture-audit.json");
}

function checkpointPath(): string {
  return path.join(recruitingDataDir(), "p193-3-questionnaire-checkpoint.json");
}

export type P1933LocalQuestionnaireStore = {
  schemaVersion: typeof P193_3_SCHEMA_VERSION;
  updatedAt: string;
  records: Record<string, P1933QuestionnaireRecord>;
};

async function ensureDataDir(): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
}

export async function readLocalQuestionnaireStore(): Promise<P1933LocalQuestionnaireStore> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P1933LocalQuestionnaireStore>;
    return {
      schemaVersion: P193_3_SCHEMA_VERSION,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    };
  } catch {
    return { schemaVersion: P193_3_SCHEMA_VERSION, updatedAt: new Date(0).toISOString(), records: {} };
  }
}

export async function writeLocalQuestionnaireStore(
  store: P1933LocalQuestionnaireStore,
): Promise<void> {
  await ensureDataDir();
  const next = { ...store, updatedAt: new Date().toISOString(), schemaVersion: P193_3_SCHEMA_VERSION };
  await writeFile(localStorePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function appendCaptureAudit(entries: P1933CaptureAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureDataDir();
  let existing: P1933CaptureAuditEntry[] = [];
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as { entries?: P1933CaptureAuditEntry[] };
    existing = Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    existing = [];
  }
  const next = [...existing, ...entries].slice(-50_000);
  await writeFile(
    auditPath(),
    `${JSON.stringify({ schemaVersion: P193_3_SCHEMA_VERSION, updatedAt: new Date().toISOString(), entries: next }, null, 2)}\n`,
    "utf8",
  );
}

export async function readCheckpoint(): Promise<P1933Checkpoint | null> {
  try {
    const raw = await readFile(checkpointPath(), "utf8");
    return JSON.parse(raw) as P1933Checkpoint;
  } catch {
    try {
      const doc = await getDocument(DOC_KEY_CHECKPOINT);
      if (doc?.value) return doc.value as P1933Checkpoint;
    } catch {
      // optional neon
    }
    return null;
  }
}

export async function writeCheckpoint(checkpoint: P1933Checkpoint): Promise<void> {
  await ensureDataDir();
  await writeFile(checkpointPath(), `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  // Best-effort Neon mirror — never block capture on durable adapter latency.
  void putDocument(DOC_KEY_CHECKPOINT, checkpoint).catch(() => undefined);
}

/**
 * Persist questionnaire record with checksum idempotency and stale protection.
 * Does not touch workflow stage, recruiter, paperwork, or MEL.
 */
export async function upsertQuestionnaireRecord(input: {
  record: P1933QuestionnaireRecord;
  existing?: P1933QuestionnaireRecord | null;
}): Promise<{ written: boolean; reason: string }> {
  const existing = input.existing ?? (await readLocalQuestionnaireStore()).records[input.record.candidateId] ?? null;

  if (existing && existing.contentChecksum === input.record.contentChecksum) {
    return { written: false, reason: "unchanged_checksum" };
  }
  if (
    existing?.sourceTimestamp &&
    input.record.sourceTimestamp &&
    existing.sourceTimestamp > input.record.sourceTimestamp &&
    existing.flatAnswers.length >= input.record.flatAnswers.length
  ) {
    return { written: false, reason: "stale_incoming_skipped" };
  }

  const local = await readLocalQuestionnaireStore();
  local.records[input.record.candidateId] = input.record;
  await writeLocalQuestionnaireStore(local);

  try {
    const key = `${DOC_KEY_PREFIX}${input.record.candidateId}`;
    // Fire-and-forget Neon mirror so Breezy fetch throughput is not stalled.
    void (async () => {
      try {
        const current = await getDocument(key);
        if (current) await compareAndSetDocument(key, current.version, input.record);
        else await putDocument(key, input.record);
      } catch {
        // Local store remains authoritative
      }
    })();
  } catch {
    // Local store remains authoritative backup if Neon write fails
  }

  return { written: true, reason: "persisted" };
}

/**
 * Narrowly patch ingestion candidate questionnaire fields only.
 */
export async function patchIngestionQuestionnaireFields(input: {
  candidateId: string;
  flatAnswers: BreezyCandidate["questionnaireAnswers"];
  hasQuestionnaire: boolean;
  attemptedAt: string;
}): Promise<{ patched: boolean; recruiterUntouched: true; stageUntouched: true }> {
  const result = await patchIngestionQuestionnaireFieldsBatch([input]);
  return {
    patched: result.patchedIds.includes(input.candidateId),
    recruiterUntouched: true,
    stageUntouched: true,
  };
}

/** Batch questionnaire-only ingestion patches (single store rewrite). */
export async function patchIngestionQuestionnaireFieldsBatch(
  patches: Array<{
    candidateId: string;
    flatAnswers: BreezyCandidate["questionnaireAnswers"];
    hasQuestionnaire: boolean;
    attemptedAt: string;
  }>,
): Promise<{ patchedIds: string[]; recruiterUntouched: true; stageUntouched: true }> {
  if (patches.length === 0) {
    return { patchedIds: [], recruiterUntouched: true, stageUntouched: true };
  }
  const store = await readIngestionStore();
  const patchedIds: string[] = [];
  for (const input of patches) {
    const existing = store.candidates[input.candidateId];
    if (!existing) continue;
    store.candidates[input.candidateId] = {
      ...existing,
      questionnaireAnswers: input.flatAnswers,
      hasQuestionnaire: input.hasQuestionnaire,
      questionnaireEnrichmentAttemptedAt: input.attemptedAt,
    };
    patchedIds.push(input.candidateId);
  }
  if (patchedIds.length > 0) await writeIngestionStore(store);
  return { patchedIds, recruiterUntouched: true, stageUntouched: true };
}

export async function writeCaptureHealthDoc(health: unknown): Promise<void> {
  await ensureDataDir();
  await writeFile(
    path.join(recruitingDataDir(), "p193-3-capture-health.json"),
    `${JSON.stringify(health, null, 2)}\n`,
    "utf8",
  );
  void putDocument(DOC_KEY_HEALTH, health).catch(() => undefined);
}

export { DOC_KEY_PREFIX, DOC_KEY_CHECKPOINT, DOC_KEY_HEALTH };
