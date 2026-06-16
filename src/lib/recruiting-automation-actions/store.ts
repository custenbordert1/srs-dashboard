import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import type {
  AutomationAuditLogEntry,
  AutomationSafetyMode,
  RecruitingAutomationRecord,
} from "@/lib/recruiting-automation-actions/types";
import { DEFAULT_AUTOMATION_SAFETY_MODE } from "@/lib/recruiting-automation-actions/types";

const storeDir = () => path.join(process.cwd(), ".data");
const storePath = () => path.join(storeDir(), "recruiting-automation-actions.json");

type AutomationStoreFile = {
  automations: RecruitingAutomationRecord[];
  safetyMode: AutomationSafetyMode;
  updatedAt: string;
};

function reviewerFromSession(session: AuthSession): { userId: string; userName: string } {
  return {
    userId: session.userId,
    userName: session.name || session.email,
  };
}

export async function readAutomationStore(): Promise<AutomationStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AutomationStoreFile>;
    return {
      automations: Array.isArray(parsed.automations) ? parsed.automations : [],
      safetyMode: parsed.safetyMode ?? DEFAULT_AUTOMATION_SAFETY_MODE,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return {
      automations: [],
      safetyMode: DEFAULT_AUTOMATION_SAFETY_MODE,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function writeAutomationStore(file: AutomationStoreFile): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(storePath(), JSON.stringify(file, null, 2), "utf8");
}

export async function listAutomationRecords(): Promise<RecruitingAutomationRecord[]> {
  const store = await readAutomationStore();
  return store.automations;
}

export async function getAutomationSafetyMode(): Promise<AutomationSafetyMode> {
  const store = await readAutomationStore();
  return store.safetyMode;
}

export async function setAutomationSafetyMode(mode: AutomationSafetyMode): Promise<AutomationSafetyMode> {
  const store = await readAutomationStore();
  const next = { ...store, safetyMode: mode, updatedAt: new Date().toISOString() };
  await writeAutomationStore(next);
  return mode;
}

export function appendAuditEntry(
  record: RecruitingAutomationRecord,
  session: AuthSession,
  input: Omit<
    AutomationAuditLogEntry,
    "id" | "automationId" | "userId" | "userName" | "timestamp" | "sourceRecommendationId"
  > & {
    timestamp?: string;
    sourceRecommendationId?: string | null;
  },
): RecruitingAutomationRecord {
  const entry: AutomationAuditLogEntry = {
    id: randomUUID(),
    automationId: record.id,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...reviewerFromSession(session),
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    note: input.note ?? null,
    sourceRecommendationId: input.sourceRecommendationId ?? record.sourceRecommendation?.recommendationId ?? null,
  };
  return {
    ...record,
    auditLog: [...record.auditLog, entry],
    updatedAt: entry.timestamp,
  };
}

export async function upsertAutomationRecord(record: RecruitingAutomationRecord): Promise<void> {
  const store = await readAutomationStore();
  const next = store.automations.filter((row) => row.id !== record.id);
  next.push(record);
  await writeAutomationStore({
    ...store,
    automations: next,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAutomationRecord(id: string): Promise<RecruitingAutomationRecord | null> {
  const store = await readAutomationStore();
  return store.automations.find((row) => row.id === id) ?? null;
}

export async function upsertAutomationRecords(records: RecruitingAutomationRecord[]): Promise<void> {
  const store = await readAutomationStore();
  const byId = new Map(store.automations.map((row) => [row.id, row]));
  for (const row of records) {
    byId.set(row.id, row);
  }
  await writeAutomationStore({
    ...store,
    automations: [...byId.values()],
    updatedAt: new Date().toISOString(),
  });
}

export function buildAutomationRecord(input: {
  actionType: RecruitingAutomationRecord["actionType"];
  owner: string;
  reason: string;
  expectedImpact: string;
  payload: RecruitingAutomationRecord["payload"];
  sourceRecommendation?: RecruitingAutomationRecord["sourceRecommendation"];
  territory?: string | null;
  dmName?: string | null;
  approvalStatus?: RecruitingAutomationRecord["approvalStatus"];
}): RecruitingAutomationRecord {
  const now = new Date().toISOString();
  const status = input.approvalStatus ?? "Draft";
  return {
    id: randomUUID(),
    actionType: input.actionType,
    owner: input.owner,
    reason: input.reason,
    expectedImpact: input.expectedImpact,
    sourceRecommendation: input.sourceRecommendation ?? null,
    approvalStatus: status,
    executionStatus: status,
    payload: input.payload,
    territory: input.territory ?? null,
    dmName: input.dmName ?? null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    executedBy: null,
    executedAt: null,
    failureReason: null,
    cancelledAt: null,
    auditLog: [],
  };
}
