import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import type {
  OutcomeCheckpointDay,
  OutcomeMetrics,
  RecommendationRecord,
  RecommendationScope,
  RecommendationSource,
  RecommendationTrackingStatus,
  RecommendationType,
} from "@/lib/recommendation-intelligence/types";
import { RECOMMENDATION_TRACKING_EXPIRY_DAYS } from "@/lib/recommendation-intelligence/types";

const storeDir = () => path.join(process.cwd(), ".data");
const storePath = () => path.join(storeDir(), "recommendation-intelligence.json");

type RecommendationStoreFile = {
  records: RecommendationRecord[];
  updatedAt: string;
};

function emptyCheckpoints(): Record<OutcomeCheckpointDay, OutcomeMetrics | null> {
  return { day0: null, day7: null, day14: null, day30: null };
}

export async function readRecommendationStore(): Promise<RecommendationStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RecommendationStoreFile>;
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { records: [], updatedAt: new Date().toISOString() };
  }
}

export async function writeRecommendationStore(file: RecommendationStoreFile): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(storePath(), JSON.stringify(file, null, 2), "utf8");
}

export async function listRecommendationRecords(): Promise<RecommendationRecord[]> {
  const store = await readRecommendationStore();
  return store.records;
}

export async function upsertRecommendationRecords(records: RecommendationRecord[]): Promise<void> {
  const now = new Date().toISOString();
  const store = await readRecommendationStore();
  const byId = new Map(store.records.map((row) => [row.recommendationId, row]));
  for (const row of records) {
    byId.set(row.recommendationId, row);
  }
  await writeRecommendationStore({
    records: [...byId.values()],
    updatedAt: now,
  });
}

export function buildRecommendationRecord(input: {
  recommendationId: string;
  recommendationType: RecommendationType;
  source: RecommendationSource;
  createdDate: string;
  owner?: string | null;
  territory?: string | null;
  recruiter?: string | null;
  project?: string | null;
  dmName?: string | null;
  expectedOutcome: string;
  expectedImpactScore: number;
  expectedApplicantGain: number;
  scope: RecommendationScope;
  baselineMetrics?: OutcomeMetrics | null;
  status?: RecommendationTrackingStatus;
}): RecommendationRecord {
  const createdMs = Date.parse(input.createdDate);
  const expiresAt = new Date(
    createdMs + RECOMMENDATION_TRACKING_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    recommendationId: input.recommendationId,
    recommendationType: input.recommendationType,
    source: input.source,
    createdDate: input.createdDate,
    owner: input.owner ?? null,
    territory: input.territory ?? null,
    recruiter: input.recruiter ?? null,
    project: input.project ?? null,
    dmName: input.dmName ?? null,
    expectedOutcome: input.expectedOutcome,
    expectedImpactScore: input.expectedImpactScore,
    expectedApplicantGain: input.expectedApplicantGain,
    status: input.status ?? "Ignored",
    executionDate: null,
    expiresAt,
    effectiveness: null,
    effectivenessScoredAt: null,
    baselineMetrics: input.baselineMetrics ?? null,
    outcomeCheckpoints: emptyCheckpoints(),
    scope: input.scope,
  };
}

export async function executeRecommendationRecord(
  session: AuthSession,
  input: {
    recommendationId: string;
    owner: string;
    ownerKind?: "dm" | "recruiter" | "operations";
    baselineMetrics?: OutcomeMetrics | null;
  },
): Promise<RecommendationRecord | null> {
  const store = await readRecommendationStore();
  const existing = store.records.find((row) => row.recommendationId === input.recommendationId);
  const now = new Date().toISOString();
  const ownerName = input.owner.trim() || session.name || session.email;

  const record: RecommendationRecord =
    existing ??
    buildRecommendationRecord({
      recommendationId: input.recommendationId,
      recommendationType: "refresh-job-posting",
      source: "autopilot",
      createdDate: now,
      owner: ownerName,
      expectedOutcome: "Improve hiring outcomes",
      expectedImpactScore: 50,
      expectedApplicantGain: 5,
      scope: {
        territory: null,
        recruiter: input.ownerKind === "recruiter" ? ownerName : null,
        project: null,
        dmName: input.ownerKind === "dm" ? ownerName : null,
        entityId: null,
        entityType: null,
      },
      baselineMetrics: input.baselineMetrics ?? null,
      status: "In Progress",
    });

  const next: RecommendationRecord = {
    ...record,
    owner: ownerName,
    status: "In Progress",
    executionDate: now,
    baselineMetrics: input.baselineMetrics ?? record.baselineMetrics,
    outcomeCheckpoints: {
      ...record.outcomeCheckpoints,
      day0: input.baselineMetrics ?? record.baselineMetrics ?? record.outcomeCheckpoints.day0,
    },
  };

  const records = store.records.filter((row) => row.recommendationId !== input.recommendationId);
  records.push(next);
  await writeRecommendationStore({ records, updatedAt: now });
  return next;
}

export async function markRecommendationExecuted(
  recommendationId: string,
): Promise<RecommendationRecord | null> {
  const store = await readRecommendationStore();
  const existing = store.records.find((row) => row.recommendationId === recommendationId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: RecommendationRecord = {
    ...existing,
    status: "Executed",
    executionDate: existing.executionDate ?? now,
  };
  const records = store.records.map((row) =>
    row.recommendationId === recommendationId ? next : row,
  );
  await writeRecommendationStore({ records, updatedAt: now });
  return next;
}

export async function appendRecommendationAuditNote(
  session: AuthSession,
  recommendationId: string,
  note: string,
): Promise<{ id: string; recommendationId: string; note: string; at: string }> {
  const entry = {
    id: randomUUID(),
    recommendationId,
    note: note.trim(),
    at: new Date().toISOString(),
    reviewedBy: session.name || session.email,
    reviewedByUserId: session.userId,
  };
  const auditPath = path.join(storeDir(), "recommendation-intelligence-audit.jsonl");
  await mkdir(storeDir(), { recursive: true });
  const { appendFile } = await import("node:fs/promises");
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}
