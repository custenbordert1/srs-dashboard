import { readFile } from "node:fs/promises";
import path from "node:path";
import { DIRECT_DEPOSIT_EMAIL_SUBJECT } from "@/lib/direct-deposit-types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export type TransactionalEmailOutboxRow = {
  id: string;
  createdAt: string;
  to: string;
  bcc?: string;
  subject: string;
  meta?: {
    candidateId?: string;
    signatureRequestId?: string | null;
    kind?: string;
    deliveryMode?: string;
  };
};

function emailDataDir(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  return override ? path.resolve(override) : recruitingDataDir();
}

export function transactionalEmailOutboxPath(): string {
  return path.join(emailDataDir(), "transactional-email-outbox.jsonl");
}

export async function readTransactionalEmailOutbox(): Promise<TransactionalEmailOutboxRow[]> {
  const outboxPath = transactionalEmailOutboxPath();
  try {
    const raw = await readFile(outboxPath, "utf8");
    const rows: TransactionalEmailOutboxRow[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed) as TransactionalEmailOutboxRow);
      } catch {
        // skip malformed lines
      }
    }
    return rows;
  } catch {
    return [];
  }
}

function isDirectDepositOutboxRow(row: TransactionalEmailOutboxRow): boolean {
  if (row.meta?.kind === "direct_deposit_verification") return true;
  return row.subject === DIRECT_DEPOSIT_EMAIL_SUBJECT;
}

export function indexDirectDepositOutboxByCandidate(
  rows: TransactionalEmailOutboxRow[],
): Map<string, TransactionalEmailOutboxRow> {
  const map = new Map<string, TransactionalEmailOutboxRow>();
  for (const row of rows) {
    if (!isDirectDepositOutboxRow(row)) continue;
    const candidateId = row.meta?.candidateId?.trim();
    if (!candidateId) continue;
    const existing = map.get(candidateId);
    if (!existing || new Date(row.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      map.set(candidateId, row);
    }
  }
  return map;
}

export function getDirectDepositOutboxEntry(input: {
  candidateId: string;
  signatureRequestId?: string | null;
  rows?: TransactionalEmailOutboxRow[];
}): TransactionalEmailOutboxRow | null {
  const rows = input.rows ?? [];
  const indexed = indexDirectDepositOutboxByCandidate(rows);
  const hit = indexed.get(input.candidateId);
  if (!hit) return null;
  const sig = input.signatureRequestId?.trim();
  if (sig && hit.meta?.signatureRequestId && hit.meta.signatureRequestId !== sig) {
    return null;
  }
  return hit;
}

export function hasDirectDepositEmailInOutbox(input: {
  candidateId: string;
  signatureRequestId?: string | null;
  rows?: TransactionalEmailOutboxRow[];
}): { sent: boolean; sentAt: string | null; hrCopyIncluded: boolean; hrCopyAddress: string | null } {
  const hit = getDirectDepositOutboxEntry(input);
  if (!hit) {
    return { sent: false, sentAt: null, hrCopyIncluded: false, hrCopyAddress: null };
  }
  const hrCopyAddress = hit.bcc?.trim() || null;
  return {
    sent: true,
    sentAt: hit.createdAt,
    hrCopyIncluded: Boolean(hrCopyAddress),
    hrCopyAddress,
  };
}
