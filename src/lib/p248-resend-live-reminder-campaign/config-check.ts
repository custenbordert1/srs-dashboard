import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveP246MailCapability } from "@/lib/p246-outstanding-paperwork-reminders/evaluate";
import {
  P248_APPROVED_FROM_FALLBACK,
  P248_PHASE,
  type P248ResendConfigCheck,
} from "@/lib/p248-resend-live-reminder-campaign/types";

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower === "placeholder" ||
    lower.startsWith("your-") ||
    lower.includes("example") ||
    lower.includes("changeme")
  );
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function keyCommittedToSourceControl(): boolean {
  // Scan common tracked env examples only — never print values.
  const tracked = [".env.example", ".env.local.example"];
  for (const rel of tracked) {
    try {
      const raw = readFileSync(path.join(process.cwd(), rel), "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("RESEND_API_KEY=")) continue;
        const v = t.slice("RESEND_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
        if (v && !isPlaceholder(v)) return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Probe Resend domains API (never logs the API key).
 */
export async function verifyResendSenderDomain(input: {
  apiKey: string;
  fromEmail: string;
}): Promise<{
  ok: boolean;
  accountMode: string | null;
  domainStatus: string | null;
  domainVerified: boolean | null;
  canSendExternal: boolean | null;
  detail: string;
}> {
  const domain = domainOf(input.fromEmail);
  if (!domain) {
    return {
      ok: false,
      accountMode: null,
      domainStatus: null,
      domainVerified: false,
      canSendExternal: false,
      detail: `Invalid From address: ${input.fromEmail}`,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      data?: Array<{ name?: string; status?: string; region?: string }>;
    };
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        accountMode: null,
        domainStatus: null,
        domainVerified: null,
        canSendExternal: null,
        detail: `Resend authentication failed (${res.status})`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        accountMode: null,
        domainStatus: null,
        domainVerified: null,
        canSendExternal: null,
        detail:
          typeof body.message === "string"
            ? body.message
            : `Resend domains lookup failed (${res.status})`,
      };
    }

    const domains = Array.isArray(body.data) ? body.data : [];
    const match = domains.find((d) => (d.name ?? "").toLowerCase() === domain);
    if (!match) {
      return {
        ok: false,
        accountMode: "api",
        domainStatus: "not_found",
        domainVerified: false,
        canSendExternal: false,
        detail: `From domain ${domain} is not registered in Resend. Registered: ${
          domains.map((d) => d.name).filter(Boolean).join(", ") || "(none)"
        }`,
      };
    }
    const status = (match.status ?? "").toLowerCase();
    const verified = status === "verified";
    return {
      ok: verified,
      accountMode: "api",
      domainStatus: status || null,
      domainVerified: verified,
      canSendExternal: verified,
      detail: verified
        ? `Domain ${domain} is verified in Resend`
        : `Domain ${domain} status is '${status || "unknown"}' — must be verified before live send`,
    };
  } catch (error) {
    return {
      ok: false,
      accountMode: null,
      domainStatus: null,
      domainVerified: null,
      canSendExternal: null,
      detail: error instanceof Error ? error.message : "Resend domains probe failed",
    };
  }
}

export async function checkP248ResendConfiguration(): Promise<P248ResendConfigCheck> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const modeRaw = process.env.DIRECT_DEPOSIT_EMAIL_MODE?.trim().toLowerCase() ?? "log";
  const mail = resolveP246MailCapability();

  // Prefer explicit recruiting sender; fall back through shared resolver.
  const recruitingFrom = process.env.SRS_RECRUITING_FROM_EMAIL?.trim() || null;
  const ddFrom = process.env.DIRECT_DEPOSIT_FROM?.trim() || null;
  const recruitingReply = process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() || null;
  const ddReply = process.env.DIRECT_DEPOSIT_REPLY_TO?.trim() || null;

  const resolvedFrom = recruitingFrom || mail.from || P248_APPROVED_FROM_FALLBACK;
  const resolvedReplyTo = recruitingReply || mail.replyTo || resolvedFrom;

  const blockers: string[] = [];
  if (!apiKey || isPlaceholder(apiKey)) {
    blockers.push("RESEND_API_KEY is missing from the runtime environment (.env.local)");
  }
  if (modeRaw !== "resend") {
    blockers.push(
      `DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently '${modeRaw || "log"}')`,
    );
  }
  if (!recruitingFrom && ddFrom && ddFrom.toLowerCase().includes("humanresource")) {
    blockers.push(
      "SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.",
    );
  }

  let senderVerification: P248ResendConfigCheck["senderVerification"] = {
    attempted: false,
    ok: false,
    accountMode: null,
    domainStatus: null,
    domainVerified: null,
    canSendExternal: null,
    detail: "Skipped — RESEND_API_KEY unavailable",
  };

  if (apiKey && !isPlaceholder(apiKey)) {
    const probed = await verifyResendSenderDomain({ apiKey, fromEmail: resolvedFrom });
    senderVerification = {
      attempted: true,
      ok: probed.ok,
      accountMode: probed.accountMode,
      domainStatus: probed.domainStatus,
      domainVerified: probed.domainVerified,
      canSendExternal: probed.canSendExternal,
      detail: probed.detail,
    };
    if (!probed.ok) {
      blockers.push(`Sender domain verification failed: ${probed.detail}`);
    }
  }

  const keyCommitted = keyCommittedToSourceControl();
  if (keyCommitted) {
    blockers.push("RESEND_API_KEY appears to be committed in a tracked env example file");
  }

  const readyForLive =
    blockers.length === 0 &&
    mail.canLiveDeliver &&
    senderVerification.ok;

  return {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    integrationPresent: true,
    transportFunction: "sendTransactionalEmail",
    requiredEnv: {
      RESEND_API_KEY: {
        present: Boolean(apiKey),
        length: apiKey.length,
        placeholder: apiKey ? isPlaceholder(apiKey) : false,
      },
      DIRECT_DEPOSIT_EMAIL_MODE: {
        value: modeRaw || "log",
        liveEnabled: modeRaw === "resend",
      },
      SRS_RECRUITING_FROM_EMAIL: {
        present: Boolean(recruitingFrom),
        value: recruitingFrom,
      },
      DIRECT_DEPOSIT_FROM: {
        present: Boolean(ddFrom),
        value: ddFrom,
      },
      SRS_RECRUITING_REPLY_TO_EMAIL: {
        present: Boolean(recruitingReply),
        value: recruitingReply,
      },
      DIRECT_DEPOSIT_REPLY_TO: {
        present: Boolean(ddReply),
        value: ddReply,
      },
    },
    resolvedFrom,
    resolvedReplyTo,
    fromDomain: domainOf(resolvedFrom),
    canLiveDeliver: mail.canLiveDeliver,
    secretsSafe: {
      keyNotLogged: true,
      keyNotInArtifacts: true,
      keyNotCommitted: !keyCommitted,
    },
    senderVerification,
    blockers,
    readyForLive,
  };
}

export function formatP248ResendConfigurationMarkdown(check: P248ResendConfigCheck): string {
  const lines = [
    `# P248 — Resend Configuration Check`,
    ``,
    `**Generated:** ${check.generatedAt}`,
    `**Ready for live:** ${check.readyForLive ? "yes" : "no"}`,
    ``,
    `## Integration`,
    ``,
    `- Transport: \`${check.transportFunction}()\``,
    `- Integration present in codebase: ${check.integrationPresent ? "yes" : "no"}`,
    `- Live delivery mode env: \`DIRECT_DEPOSIT_EMAIL_MODE\` (must be \`resend\`)`,
    `- API key env: \`RESEND_API_KEY\` (present: ${check.requiredEnv.RESEND_API_KEY.present}, length: ${check.requiredEnv.RESEND_API_KEY.length})`,
    ``,
    `## Sender identity`,
    ``,
    `- From: \`${check.resolvedFrom}\``,
    `- Reply-to: \`${check.resolvedReplyTo}\``,
    `- From domain: \`${check.fromDomain}\``,
    `- Domain verification attempted: ${check.senderVerification.attempted ? "yes" : "no"}`,
    `- Domain status: ${check.senderVerification.domainStatus ?? "—"}`,
    `- Domain verified: ${check.senderVerification.domainVerified ?? "—"}`,
    `- Detail: ${check.senderVerification.detail}`,
    ``,
    `## Secrets safety`,
    ``,
    `- Key not logged: yes`,
    `- Key not written to artifacts: yes`,
    `- Key not committed to source control examples: ${check.secretsSafe.keyNotCommitted ? "yes" : "NO"}`,
    ``,
    `## Blockers`,
    ``,
  ];
  if (check.blockers.length === 0) {
    lines.push(`_None — live delivery may proceed._`, ``);
  } else {
    for (const b of check.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }
  lines.push(`## Exact configuration required`, ``);
  lines.push(`Add to \`.env.local\` (do not commit):`, ``);
  lines.push("```bash");
  lines.push("RESEND_API_KEY=<paste Resend API key from https://resend.com/api-keys>");
  lines.push("DIRECT_DEPOSIT_EMAIL_MODE=resend");
  lines.push(`SRS_RECRUITING_FROM_EMAIL=${P248_APPROVED_FROM_FALLBACK}`);
  lines.push(`SRS_RECRUITING_REPLY_TO_EMAIL=${P248_APPROVED_FROM_FALLBACK}`);
  lines.push("```");
  lines.push(``);
  lines.push(
    `Then verify the From domain in the Resend dashboard, re-run the P248 script, complete the 3-candidate canary, and only then continue the full cohort.`,
  );
  lines.push(``);
  return lines.join("\n");
}
