import { createHash, randomUUID } from "node:crypto";
import {
  P186_2_PAYLOAD_VERSION,
  type P186EventSourceSystem,
  type P186LifecycleEventType,
  type P186NormalizedLifecycleEvent,
} from "@/lib/p186-2-event-adapters/types";
import type { P186LifecycleState } from "@/lib/p186-1-lifecycle-state-machine/types";

export type NormalizeInput = {
  eventId?: string | null;
  candidateId?: string | null;
  eventType?: P186LifecycleEventType | string | null;
  sourceSystem?: P186EventSourceSystem | string | null;
  sourceTimestamp?: string | null;
  actor?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  redactedMetadata?: Record<string, unknown> | null;
};

export type NormalizeResult =
  | { ok: true; event: P186NormalizedLifecycleEvent }
  | { ok: false; code: "malformed"; detail: string };

function redactValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("@") || lower.includes("http") || lower.includes("password")) {
      return `[redacted:${createHash("sha256").update(value).digest("hex").slice(0, 8)}]`;
    }
    return value.slice(0, 120);
  }
  return String(value).slice(0, 80);
}

export function normalizeLifecycleEvent(input: NormalizeInput): NormalizeResult {
  const candidateId = input.candidateId?.trim() ?? "";
  const eventType = (input.eventType?.toString().trim() ?? "") as P186LifecycleEventType;
  const sourceSystem = (input.sourceSystem?.toString().trim() ?? "") as P186EventSourceSystem;

  if (!candidateId) {
    return { ok: false, code: "malformed", detail: "candidateId required" };
  }
  if (!eventType) {
    return { ok: false, code: "malformed", detail: "eventType required" };
  }
  if (!sourceSystem) {
    return { ok: false, code: "malformed", detail: "sourceSystem required" };
  }

  const sourceTimestamp = input.sourceTimestamp?.trim() || new Date().toISOString();
  const receivedTimestamp = new Date().toISOString();
  const eventId =
    input.eventId?.trim() ||
    `evt-${createHash("sha256")
      .update(`${sourceSystem}:${candidateId}:${eventType}:${sourceTimestamp}`)
      .digest("hex")
      .slice(0, 24)}`;
  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    createHash("sha256").update(eventId).digest("hex").slice(0, 32);
  const correlationId = input.correlationId?.trim() || `corr-${randomUUID().slice(0, 8)}`;
  const actor = input.actor?.trim() || `system:${sourceSystem}`;

  const redactedMetadata: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(input.redactedMetadata ?? {})) {
    if (/email|name|phone|url|token|secret|password/i.test(k)) {
      redactedMetadata[k] = redactValue(typeof v === "string" ? v : String(v));
    } else {
      redactedMetadata[k] = redactValue(v);
    }
  }

  return {
    ok: true,
    event: {
      eventId,
      candidateId,
      eventType,
      sourceSystem,
      sourceTimestamp,
      receivedTimestamp,
      actor,
      correlationId,
      idempotencyKey,
      payloadVersion: P186_2_PAYLOAD_VERSION,
      redactedMetadata,
    },
  };
}

/** Map normalized event type → intended lifecycle state (null = unmapped/no transition). */
export function targetStateForEvent(
  eventType: P186LifecycleEventType,
): P186LifecycleState | null {
  switch (eventType) {
    case "candidate_applied":
    case "breezy_stage_changed":
      return "APPLIED";
    case "recruiter_claimed":
      return "RECRUITER_REVIEW";
    case "recruiter_recommended":
      return "HIRING_RECOMMENDATION";
    case "recruiter_rejected":
      return "BLOCKED";
    case "operator_approved":
      return "OPERATOR_APPROVED";
    case "operator_denied":
      return "RECRUITER_REVIEW";
    case "paperwork_needed":
      return "PAPERWORK_NEEDED";
    case "confirmed_sent":
      return "PAPERWORK_SENT";
    case "viewed":
      return "VIEWED";
    case "signed":
      return "SIGNED";
    case "declined":
    case "canceled":
    case "failed":
      return "BLOCKED";
    case "onboarding_complete":
      return "ONBOARDING_COMPLETE";
    case "ready_for_mel":
      return "READY_FOR_MEL";
    case "mel_exported":
      return "EXPORTED";
    case "reconcile_tick":
    case "unmapped":
      return null;
    default:
      return null;
  }
}
