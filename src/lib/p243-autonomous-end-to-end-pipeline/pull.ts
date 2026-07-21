import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { normalizeEmailFingerprint } from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import type { AutonomousCycleReport } from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const TERMINAL = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Withdrawn",
  "Archived",
]);

const EARLY_FUNNEL = new Set(["Applied", "Needs Review", "Qualified", "Paperwork Needed"]);

const WEBHOOK_INBOX_STALE_MS = 30 * 60 * 1000;
const SMART_POLL_MAX_ATTEMPTS = 3;
const SMART_POLL_RETRY_BASE_MS = 400;

export type P243IngestionMeta = AutonomousCycleReport["ingestion"];

export type PullPendingResult = {
  rows: ScoredCandidateWorkflowRow[];
  pulled: number;
  notes: string[];
  ingestion: P243IngestionMeta;
  breezyLiveCandidates: BreezyCandidate[];
};

type WebhookInboxFile = {
  updatedAt?: string;
  events?: Array<{
    candidateId?: string;
    receivedAt?: string;
    candidate?: Partial<BreezyCandidate> & { _id?: string; candidateId?: string; email?: string };
  }>;
};

function candidateKey(c: BreezyCandidate | { _id?: string; candidateId?: string }): string {
  return String(c.candidateId || (c as { _id?: string })._id || "").trim();
}

function appliedMs(c: BreezyCandidate): number {
  const raw = c.appliedDate || c.createdDate || c.addedDate || "";
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBreezyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("unavailable") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed")
  );
}

function breezyWebhookInboxPath(): string {
  return path.join(recruitingDataDir(), "breezy-webhook-inbox.json");
}

/**
 * Soft-read optional Breezy webhook inbox (durable events written by a webhook handler).
 * Returns empty when the inbox is missing or stale — callers fall back to smart poll.
 */
export async function readBreezyWebhookInbox(input?: {
  maxAgeMs?: number;
}): Promise<{ candidates: BreezyCandidate[]; hits: number; note: string; cursorAt: string | null }> {
  const maxAgeMs = input?.maxAgeMs ?? WEBHOOK_INBOX_STALE_MS;
  try {
    const raw = await readFile(breezyWebhookInboxPath(), "utf8");
    const parsed = JSON.parse(raw) as WebhookInboxFile;
    const updatedAt = parsed.updatedAt ?? null;
    const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
    if (Number.isFinite(updatedMs) && Date.now() - updatedMs > maxAgeMs) {
      return {
        candidates: [],
        hits: 0,
        note: `Webhook inbox stale (updatedAt=${updatedAt}); ignoring for this cycle.`,
        cursorAt: updatedAt,
      };
    }

    const byId = new Map<string, BreezyCandidate>();
    for (const event of parsed.events ?? []) {
      const id = String(
        event.candidate?.candidateId ?? event.candidate?._id ?? event.candidateId ?? "",
      ).trim();
      if (!id) continue;
      const partial = event.candidate ?? {};
      const existing = byId.get(id);
      const merged = {
        ...(existing ?? {}),
        ...partial,
        candidateId: id,
        email: String(partial.email ?? existing?.email ?? ""),
      } as BreezyCandidate;
      byId.set(id, merged);
    }

    const candidates = [...byId.values()];
    return {
      candidates,
      hits: candidates.length,
      note:
        candidates.length > 0
          ? `Webhook inbox returned ${candidates.length} candidate(s).`
          : "Webhook inbox present but empty.",
      cursorAt: updatedAt,
    };
  } catch {
    return {
      candidates: [],
      hits: 0,
      note: "Webhook inbox unavailable — falling back to smart poll / durable store.",
      cursorAt: null,
    };
  }
}

/**
 * Deduplicate by Breezy candidate id, with email-fingerprint collision merge.
 */
export function dedupeBreezyCandidates(candidates: BreezyCandidate[]): {
  candidates: BreezyCandidate[];
  deduped: number;
} {
  const byId = new Map<string, BreezyCandidate>();
  const emailOwner = new Map<string, string>();
  let deduped = 0;

  for (const c of candidates) {
    const id = candidateKey(c);
    if (!id) {
      deduped += 1;
      continue;
    }
    const emailFp = normalizeEmailFingerprint(c.email);
    if (emailFp) {
      const owner = emailOwner.get(emailFp);
      if (owner && owner !== id) {
        // Prefer the earlier owner; drop this duplicate identity.
        deduped += 1;
        const existing = byId.get(owner);
        if (existing) {
          byId.set(owner, { ...existing, ...c, candidateId: owner });
        }
        continue;
      }
      emailOwner.set(emailFp, id);
    }

    const existing = byId.get(id);
    if (existing) {
      deduped += 1;
      byId.set(id, { ...existing, ...c, candidateId: id });
    } else {
      byId.set(id, { ...c, candidateId: id });
    }
  }

  return { candidates: [...byId.values()], deduped };
}

function filterSince(
  candidates: BreezyCandidate[],
  lastCheckedAt: string | null | undefined,
): BreezyCandidate[] {
  if (!lastCheckedAt) return candidates;
  const sinceMs = Date.parse(lastCheckedAt);
  if (!Number.isFinite(sinceMs)) return candidates;
  // Include a small lookback window so clock skew / late-indexed rows are not missed.
  const floor = sinceMs - 5 * 60 * 1000;
  const filtered = candidates.filter((c) => appliedMs(c) >= floor);
  // If the "since" filter would empty a non-empty poll, keep recent candidates instead.
  if (filtered.length === 0 && candidates.length > 0) {
    return [...candidates].sort((a, b) => appliedMs(b) - appliedMs(a)).slice(0, 50);
  }
  return filtered;
}

/**
 * Smart Breezy poll with pagination-aware fast scan, rate-limit / transient retries.
 * Never writes durable ingestion — in-memory enrichment only.
 */
export async function smartPollBreezy(input?: {
  positionIds?: string[];
  lastCheckedAt?: string | null;
}): Promise<{ candidates: BreezyCandidate[]; note: string; rateLimited: boolean }> {
  const notes: string[] = [];
  let rateLimited = false;

  for (let attempt = 0; attempt < SMART_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const {
        fetchBreezyCandidates,
        wasBreezyRateLimitHit,
        resetBreezyRateLimitHit,
      } = await import("@/lib/breezy-api");
      resetBreezyRateLimitHit();

      const result = await fetchBreezyCandidates({
        scanMode: "fast",
        force: true,
        maxPages: 2,
        ...(input?.positionIds?.length === 1
          ? { positionId: input.positionIds[0] }
          : {}),
      });

      if (wasBreezyRateLimitHit()) {
        rateLimited = true;
      }

      if (!result.ok) {
        const err = result.error;
        if (isRetryableBreezyMessage(err) && attempt < SMART_POLL_MAX_ATTEMPTS - 1) {
          rateLimited = rateLimited || /429|rate limit/i.test(err);
          await sleep(SMART_POLL_RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return {
          candidates: [],
          note: `Breezy smart poll failed: ${err}`,
          rateLimited,
        };
      }

      let candidates = result.candidates;
      if (input?.positionIds?.length) {
        const allow = new Set(input.positionIds);
        candidates = candidates.filter((c) => allow.has(c.positionId ?? ""));
      }
      const beforeSince = candidates.length;
      candidates = filterSince(candidates, input?.lastCheckedAt);
      if (input?.lastCheckedAt) {
        notes.push(
          `Smart poll since=${input.lastCheckedAt}: ${candidates.length}/${beforeSince} after timestamp filter.`,
        );
      }
      if (result.truncated) {
        notes.push("Breezy scan truncated (time budget / pagination cap).");
      }
      if (rateLimited) {
        notes.push("Breezy rate-limit flag observed during poll.");
      }

      return {
        candidates,
        note: `Breezy smart poll returned ${candidates.length} candidate(s) (in-memory only). ${notes.join(" ")}`.trim(),
        rateLimited,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRetryableBreezyMessage(message) && attempt < SMART_POLL_MAX_ATTEMPTS - 1) {
        await sleep(SMART_POLL_RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      return {
        candidates: [],
        note: `Breezy smart poll skipped: ${message}`,
        rateLimited,
      };
    }
  }

  return { candidates: [], note: "Breezy smart poll exhausted retries.", rateLimited };
}

/**
 * Optional read-only Breezy poll for fresher profiles. Never merges to disk here.
 * Prefer {@link smartPollBreezy} for production cycles.
 */
export async function pollBreezyLivePreview(input?: {
  positionIds?: string[];
  lastCheckedAt?: string | null;
}): Promise<{ candidates: BreezyCandidate[]; note: string }> {
  const result = await smartPollBreezy(input);
  return { candidates: result.candidates, note: result.note };
}

function isPendingCandidate(
  stage: string,
  paperwork: string,
  sig: string,
): boolean {
  if (TERMINAL.has(stage)) return false;
  if (["Paperwork Sent", "Signed", "Ready for MEL"].includes(stage)) return false;
  if (paperwork === "sent" || paperwork === "viewed" || paperwork === "signed") return false;
  if (sig) return false;
  return EARLY_FUNNEL.has(stage);
}

/**
 * Pull pending candidates from durable ingestion + workflow (source of truth).
 * Prefer webhook inbox when available; fall back to smart Breezy poll.
 * Does not write. Live Breezy profiles enrich in-memory only.
 */
export async function pullPendingCandidates(input: {
  limit: number;
  positionIds?: string[];
  breezyLiveCandidates?: BreezyCandidate[];
  preferWebhooks?: boolean;
  enableSmartPoll?: boolean;
  lastCheckedAt?: string | null;
}): Promise<PullPendingResult> {
  const notes: string[] = [];
  const preferWebhooks = input.preferWebhooks !== false;
  const enableSmartPoll = input.enableSmartPoll !== false;

  let webhookHits = 0;
  let pollHits = 0;
  let source: P243IngestionMeta["source"] = "durable_only";
  let lastCheckedAt = input.lastCheckedAt ?? null;
  const liveById = new Map<string, BreezyCandidate>();

  if (preferWebhooks) {
    const inbox = await readBreezyWebhookInbox();
    notes.push(inbox.note);
    if (inbox.cursorAt) lastCheckedAt = inbox.cursorAt;
    if (inbox.hits > 0) {
      webhookHits = inbox.hits;
      source = "webhook";
      for (const c of inbox.candidates) {
        const id = candidateKey(c);
        if (id) liveById.set(id, c);
      }
    }
  }

  if (input.breezyLiveCandidates?.length) {
    for (const c of input.breezyLiveCandidates) {
      const id = candidateKey(c);
      if (id) liveById.set(id, c);
    }
    pollHits += input.breezyLiveCandidates.length;
    source = webhookHits > 0 ? "mixed" : "smart_poll";
  } else if (enableSmartPoll && webhookHits === 0) {
    // Prefer webhook inbox when it has hits; otherwise smart-poll Breezy.
    const poll = await smartPollBreezy({
      positionIds: input.positionIds,
      lastCheckedAt,
    });
    notes.push(poll.note);
    pollHits = poll.candidates.length;
    for (const c of poll.candidates) {
      const id = candidateKey(c);
      if (id) liveById.set(id, c);
    }
    if (pollHits > 0) {
      source = "smart_poll";
    }
  } else if (webhookHits > 0) {
    source = "webhook";
  }

  const store = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  let candidates = listIngestedCandidates(store);

  if (liveById.size > 0) {
    const byId = new Map<string, BreezyCandidate>();
    for (const c of candidates) {
      const id = candidateKey(c);
      if (id) byId.set(id, c);
    }
    for (const live of liveById.values()) {
      const id = candidateKey(live);
      if (!id) continue;
      const existing = byId.get(id);
      byId.set(id, existing ? { ...existing, ...live, candidateId: id } : live);
    }
    candidates = [...byId.values()];
    notes.push(
      `Merged ${liveById.size} live Breezy profile(s) in-memory (no durable ingestion write).`,
    );
  }

  const beforeDedup = candidates.length;
  const dedupedBundle = dedupeBreezyCandidates(candidates);
  candidates = dedupedBundle.candidates;
  const deduped = dedupedBundle.deduped + Math.max(0, beforeDedup - candidates.length);

  if (input.positionIds?.length) {
    const allow = new Set(input.positionIds);
    candidates = candidates.filter((c) => allow.has(c.positionId ?? ""));
  }

  const pending = candidates
    .map((c) => {
      const id = candidateKey(c);
      const wf = workflows[id] as CandidateWorkflowRecord | undefined;
      const stage = wf?.workflowStatus ?? c.stage ?? "Applied";
      const paperwork = wf?.paperworkStatus ?? "not_sent";
      const sig = String(wf?.signatureRequestId ?? "").trim();
      return { c, wf, stage, paperwork, sig };
    })
    .filter(({ stage, paperwork, sig }) => isPendingCandidate(stage, paperwork, sig))
    .sort((a, b) => appliedMs(b.c) - appliedMs(a.c))
    .slice(0, Math.max(1, input.limit));

  const rows = pending.map(({ c, wf }) => buildScoredWorkflowRow(c, wf));
  notes.push(
    `Pulled ${rows.length} pending candidate(s) from durable ingestion/workflow (limit=${input.limit}, source=${source}).`,
  );

  return {
    rows,
    pulled: rows.length,
    notes,
    breezyLiveCandidates: [...liveById.values()],
    ingestion: {
      source,
      webhookHits,
      pollHits,
      deduped,
      lastCheckedAt,
      notes: [...notes],
    },
  };
}
