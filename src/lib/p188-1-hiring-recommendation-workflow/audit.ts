import { randomUUID } from "node:crypto";
import type {
  P1881AuditRecord,
  P1881ValidationGate,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

/** In-memory audit store for tests; production uses append + injectable fail. */
const memoryAudits: P1881AuditRecord[] = [];

export function resetP1881AuditMemoryForTests(): void {
  memoryAudits.length = 0;
}

export function listP1881AuditMemoryForTests(): P1881AuditRecord[] {
  return [...memoryAudits];
}

export type AppendRecommendHireAudit = (record: Omit<P1881AuditRecord, "id" | "at"> & {
  id?: string;
  at?: string;
}) => Promise<string>;

/**
 * Default audit append — memory + optional hook. Fails closed when injector throws.
 */
export async function appendRecommendHireAudit(
  input: Omit<P1881AuditRecord, "id" | "at"> & { id?: string; at?: string },
  deps?: { append?: AppendRecommendHireAudit; fail?: boolean },
): Promise<string> {
  if (deps?.fail) {
    throw new Error("P188.1 audit persistence failed");
  }
  if (deps?.append) {
    return deps.append(input);
  }
  const id = input.id ?? `p1881-aud-${randomUUID().slice(0, 10)}`;
  const record: P1881AuditRecord = {
    ...input,
    id,
    at: input.at ?? new Date().toISOString(),
  };
  memoryAudits.push(record);
  return id;
}

export function summarizeValidation(gates: P1881ValidationGate[]): string {
  const failed = gates.filter((g) => !g.ok);
  if (!failed.length) return "all gates passed";
  return failed.map((g) => g.gateId).join(",");
}
