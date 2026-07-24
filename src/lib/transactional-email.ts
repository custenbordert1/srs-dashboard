import { appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  assertLiveMailReadyForSend,
  getDeploymentTier,
} from "@/lib/production-mail-config";

export type TransactionalEmailPayload = {
  from: string;
  replyTo: string;
  to: string;
  /** Optional BCC for HR visibility (not shown in candidate body). */
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
};

export type TransactionalEmailResult = {
  ok: boolean;
  mode: "log" | "resend" | "skipped";
  messageId?: string;
  error?: string;
};

export type SendTransactionalEmailOptions = {
  /**
   * When true, refuse log/outbox "success" — live Resend delivery is required.
   * Production live reminder / paperwork paths must set this (or call assertLiveMailReadyForSend).
   */
  requireLiveDelivery?: boolean;
};

function emailDataDir(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  return override ? path.resolve(override) : recruitingDataDir();
}

export async function appendTransactionalEmailOutbox(
  payload: TransactionalEmailPayload,
  meta: Record<string, unknown>,
): Promise<void> {
  const storeDir = emailDataDir();
  const outboxPath = path.join(storeDir, "transactional-email-outbox.jsonl");
  await safeRecruitingMkdir(storeDir);
  const row = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
    meta,
  };
  await appendFile(outboxPath, `${JSON.stringify(row)}\n`, "utf8");
}

export function getTransactionalEmailMode(): "log" | "resend" {
  const raw = process.env.DIRECT_DEPOSIT_EMAIL_MODE?.trim().toLowerCase() ?? "log";
  return raw === "resend" ? "resend" : "log";
}

async function sendViaResend(payload: TransactionalEmailPayload): Promise<TransactionalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { ok: false, mode: "resend", error: "RESEND_API_KEY not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      reply_to: payload.replyTo,
      to: [payload.to],
      ...(payload.bcc ? { bcc: [payload.bcc] } : {}),
      subject: payload.subject,
      text: payload.text,
      html: payload.html ?? undefined,
      tags: payload.tags?.map((name) => ({ name, value: "srs-dashboard" })),
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    return {
      ok: false,
      mode: "resend",
      error: typeof body.message === "string" ? body.message : `Resend failed (${res.status})`,
    };
  }
  return { ok: true, mode: "resend", messageId: body.id };
}

/**
 * Sends transactional email (log outbox always; optional Resend when configured).
 * When requireLiveDelivery is true, never treats log/outbox as success.
 */
export async function sendTransactionalEmail(
  payload: TransactionalEmailPayload,
  meta: Record<string, unknown> = {},
  options: SendTransactionalEmailOptions = {},
): Promise<TransactionalEmailResult> {
  const mode = getTransactionalEmailMode();
  const tier = getDeploymentTier();
  const requireLive = Boolean(options.requireLiveDelivery);

  if (requireLive) {
    const gate = assertLiveMailReadyForSend();
    if (!gate.ok) {
      await appendTransactionalEmailOutbox(payload, {
        ...meta,
        deliveryMode: mode,
        blockedLiveDelivery: true,
        deploymentTier: tier,
      });
      return {
        ok: false,
        mode: "skipped",
        error: gate.error ?? "Live mail not ready",
      };
    }
  }

  await appendTransactionalEmailOutbox(payload, {
    ...meta,
    deliveryMode: mode,
    deploymentTier: tier,
    requireLiveDelivery: requireLive,
  });

  if (mode === "log") {
    if (requireLive) {
      return {
        ok: false,
        mode: "skipped",
        error:
          "DIRECT_DEPOSIT_EMAIL_MODE is log — live delivery required; refusing silent outbox success",
      };
    }
    console.info("[transactional-email] logged", {
      to: payload.to,
      bcc: payload.bcc ?? null,
      subject: payload.subject,
      tags: payload.tags,
      deploymentTier: tier,
      ...meta,
    });
    return { ok: true, mode: "log", messageId: "logged" };
  }

  return sendViaResend(payload);
}
