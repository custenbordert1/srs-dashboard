/**
 * Shared production mail / Resend capability assessment.
 * Never prints secret values. Used by startup validation and P251 remediation.
 */

export const APPROVED_RECRUITING_FROM =
  "recruiting@strategicretailsolutions.com";

export type DeploymentTier = "production" | "preview" | "development";

export type MailCapabilityState = {
  mode: "log" | "resend";
  modeExplicit: boolean;
  hasResendApiKey: boolean;
  resendKeyLength: number;
  recruitingFromSet: boolean;
  recruitingReplyToSet: boolean;
  resolvedFrom: string;
  resolvedReplyTo: string;
  fromFallsBackToHr: boolean;
  canLiveDeliver: boolean;
  blockers: string[];
  warnings: string[];
};

export type ProductionConfigIssue = {
  id: string;
  severity: "FAIL" | "WARN";
  variable: string | null;
  file: string;
  why: string;
  expectedFormat: string;
  fixType: "config_only" | "code_change" | "vendor";
  remediation: string[];
};

export type ProductionConfigValidation = {
  tier: DeploymentTier;
  vercelEnv: string | null;
  nodeEnv: string | null;
  mail: MailCapabilityState;
  issues: ProductionConfigIssue[];
  failCount: number;
  warnCount: number;
  okForLiveEmail: boolean;
  humanSummary: string[];
};

function present(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v) && !/^(placeholder|changeme|your-|example)/i.test(v);
}

export function getDeploymentTier(): DeploymentTier {
  const vercel = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (vercel === "development") return "development";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function assessMailCapabilityState(): MailCapabilityState {
  const modeRaw = process.env.DIRECT_DEPOSIT_EMAIL_MODE?.trim().toLowerCase() ?? "";
  const modeExplicit = Boolean(modeRaw);
  const mode: "log" | "resend" = modeRaw === "resend" ? "resend" : "log";
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const hasResendApiKey = present("RESEND_API_KEY");
  const recruitingFrom = process.env.SRS_RECRUITING_FROM_EMAIL?.trim() || "";
  const recruitingReply = process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() || "";
  const ddFrom = process.env.DIRECT_DEPOSIT_FROM?.trim() || "";
  const ddReply = process.env.DIRECT_DEPOSIT_REPLY_TO?.trim() || "";

  const resolvedFrom =
    recruitingFrom ||
    ddFrom ||
    recruitingReply ||
    APPROVED_RECRUITING_FROM;
  const resolvedReplyTo = recruitingReply || ddReply || resolvedFrom;
  const fromFallsBackToHr =
    !recruitingFrom &&
    Boolean(ddFrom) &&
    ddFrom.toLowerCase().includes("humanresource");

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!modeExplicit) {
    warnings.push(
      "DIRECT_DEPOSIT_EMAIL_MODE unset — defaults to log (outbox only, no live Resend)",
    );
  }
  if (mode !== "resend") {
    blockers.push(
      `DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' for live email (currently '${modeRaw || "log"}')`,
    );
  }
  if (!hasResendApiKey) {
    blockers.push("RESEND_API_KEY is missing from the runtime environment (.env.local)");
  }
  if (!recruitingFrom) {
    blockers.push(
      fromFallsBackToHr
        ? "SRS_RECRUITING_FROM_EMAIL unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR)"
        : "SRS_RECRUITING_FROM_EMAIL unset; set recruiting From before live reminder sends",
    );
  }
  if (!recruitingReply) {
    warnings.push(
      "SRS_RECRUITING_REPLY_TO_EMAIL unset — reply-to falls back to From / DIRECT_DEPOSIT_REPLY_TO",
    );
  }

  const canLiveDeliver = mode === "resend" && hasResendApiKey && Boolean(recruitingFrom);

  return {
    mode,
    modeExplicit,
    hasResendApiKey,
    resendKeyLength: apiKey.length,
    recruitingFromSet: Boolean(recruitingFrom),
    recruitingReplyToSet: Boolean(recruitingReply),
    resolvedFrom,
    resolvedReplyTo,
    fromFallsBackToHr,
    canLiveDeliver,
    blockers,
    warnings,
  };
}

/** Exact remediation rows for every mail FAIL / WARN (config-only unless noted). */
export function buildMailRemediationIssues(
  mail: MailCapabilityState,
): ProductionConfigIssue[] {
  const issues: ProductionConfigIssue[] = [];

  if (!mail.hasResendApiKey) {
    issues.push({
      id: "resend_api_key",
      severity: "FAIL",
      variable: "RESEND_API_KEY",
      file: ".env.local",
      why: "Missing from runtime — Resend cannot authenticate; live email blocked",
      expectedFormat: "RESEND_API_KEY=<api key from https://resend.com/api-keys> (never commit)",
      fixType: "config_only",
      remediation: [
        "Open https://resend.com/api-keys and create/copy a key for the SRS Resend account",
        "Add to `.env.local` (do not commit): `RESEND_API_KEY=<paste key>`",
        "Leave placeholder empty in `.env.local.example` / `.env.example` documentation only",
        "Restart Node/tsx / Next.js so the process loads the new env",
      ],
    });
  }

  if (mail.mode !== "resend") {
    issues.push({
      id: "email_mode",
      severity: "FAIL",
      variable: "DIRECT_DEPOSIT_EMAIL_MODE",
      file: ".env.local",
      why: `Current mode is '${mail.mode}' — sendTransactionalEmail only logs to outbox`,
      expectedFormat: "DIRECT_DEPOSIT_EMAIL_MODE=resend",
      fixType: "config_only",
      remediation: [
        "In `.env.local` set: `DIRECT_DEPOSIT_EMAIL_MODE=resend`",
        "Do not use `log` or `outbox` for live reminder delivery",
      ],
    });
  }

  if (!mail.recruitingFromSet) {
    issues.push({
      id: "sender_from",
      severity: "FAIL",
      variable: "SRS_RECRUITING_FROM_EMAIL",
      file: ".env.local",
      why: mail.fromFallsBackToHr
        ? `Resolved From falls back to HR (${mail.resolvedFrom}) — unsafe for recruiting reminders`
        : `Recruiting From unset; resolved '${mail.resolvedFrom}' is not an explicit recruiting sender`,
      expectedFormat: `SRS_RECRUITING_FROM_EMAIL=${APPROVED_RECRUITING_FROM}`,
      fixType: "config_only",
      remediation: [
        `In \`.env.local\` set: \`SRS_RECRUITING_FROM_EMAIL=${APPROVED_RECRUITING_FROM}\``,
        "Confirm the mailbox is on a Resend-verified domain",
      ],
    });
  }

  if (!mail.recruitingReplyToSet) {
    issues.push({
      id: "sender_reply_to",
      severity: "WARN",
      variable: "SRS_RECRUITING_REPLY_TO_EMAIL",
      file: ".env.local",
      why: "Reply-To not explicitly set for recruiting reminders",
      expectedFormat: `SRS_RECRUITING_REPLY_TO_EMAIL=${APPROVED_RECRUITING_FROM}`,
      fixType: "config_only",
      remediation: [
        `In \`.env.local\` set: \`SRS_RECRUITING_REPLY_TO_EMAIL=${APPROVED_RECRUITING_FROM}\``,
      ],
    });
  }

  if (!mail.hasResendApiKey) {
    issues.push({
      id: "sender_domain",
      severity: "FAIL",
      variable: "RESEND_API_KEY",
      file: "Resend dashboard + .env.local",
      why: "Sender domain verification skipped — RESEND_API_KEY unavailable",
      expectedFormat: "Domain must show status=verified in Resend for the From domain",
      fixType: "vendor",
      remediation: [
        "Set RESEND_API_KEY first (required to probe domains)",
        "In Resend → Domains: verify strategicretailsolutions.com (SPF/DKIM/DMARC)",
        "Re-run `npx tsx scripts/p252-run-production-email-validation.ts`",
      ],
    });
  }

  return issues;
}

export function validateProductionConfig(): ProductionConfigValidation {
  const tier = getDeploymentTier();
  const mail = assessMailCapabilityState();
  const issues = buildMailRemediationIssues(mail);

  // Production / preview: treat unset mode as a louder production concern
  if ((tier === "production" || tier === "preview") && !mail.modeExplicit) {
    issues.push({
      id: "email_mode_implicit_default",
      severity: tier === "production" ? "FAIL" : "WARN",
      variable: "DIRECT_DEPOSIT_EMAIL_MODE",
      file: ".env.local / Vercel env",
      why: "Mode unset in deployed environment — silent default to log is not allowed for production clarity",
      expectedFormat: "DIRECT_DEPOSIT_EMAIL_MODE=resend (live) or =log (intentionally outbox-only)",
      fixType: "config_only",
      remediation: [
        "Set DIRECT_DEPOSIT_EMAIL_MODE explicitly in the deployment environment",
      ],
    });
  }

  const failCount = issues.filter((i) => i.severity === "FAIL").length;
  const warnCount = issues.filter((i) => i.severity === "WARN").length;
  const okForLiveEmail = mail.canLiveDeliver && failCount === 0;

  const humanSummary: string[] = [
    `Deployment tier: ${tier} (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
    `Mail mode: ${mail.mode}${mail.modeExplicit ? "" : " (implicit default)"}`,
    `RESEND_API_KEY: ${mail.hasResendApiKey ? `present (length=${mail.resendKeyLength})` : "MISSING"}`,
    `Recruiting From: ${mail.recruitingFromSet ? mail.resolvedFrom : `UNSET → resolved ${mail.resolvedFrom}`}`,
    `Live email capability: ${okForLiveEmail ? "READY" : "BLOCKED"}`,
  ];
  if (!okForLiveEmail) {
    for (const b of mail.blockers) humanSummary.push(`  FAIL: ${b}`);
  }
  for (const w of mail.warnings) humanSummary.push(`  WARN: ${w}`);

  return {
    tier,
    vercelEnv: process.env.VERCEL_ENV?.trim() || null,
    nodeEnv: process.env.NODE_ENV?.trim() || null,
    mail,
    issues,
    failCount,
    warnCount,
    okForLiveEmail,
    humanSummary,
  };
}

/**
 * Live send paths must call this (or pass requireLiveDelivery to sendTransactionalEmail).
 * Refuses silent log/outbox success when live delivery is required.
 */
export function assertLiveMailReadyForSend(): {
  ok: boolean;
  error?: string;
  mail: MailCapabilityState;
} {
  const mail = assessMailCapabilityState();
  if (mail.canLiveDeliver) return { ok: true, mail };
  return {
    ok: false,
    mail,
    error:
      mail.blockers.join("; ") ||
      "Live mail not ready — set RESEND_API_KEY, DIRECT_DEPOSIT_EMAIL_MODE=resend, SRS_RECRUITING_FROM_EMAIL",
  };
}

export function formatProductionConfigDiagnostics(
  report: ProductionConfigValidation,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push(`[env] ${report.tier.toUpperCase()} — transactional mail capability`);
  lines.push("══════════════════════════════════════════════════════════════");
  for (const line of report.humanSummary) {
    lines.push(line.startsWith("  ") ? line : `  ${line}`);
  }
  if (report.issues.length > 0) {
    lines.push("");
    lines.push("Remediation (secrets never printed):");
    for (const issue of report.issues) {
      lines.push(`  [${issue.severity}] ${issue.id}`);
      lines.push(`      Variable: ${issue.variable ?? "(n/a)"}`);
      lines.push(`      File: ${issue.file}`);
      lines.push(`      Why: ${issue.why}`);
      lines.push(`      Expected: ${issue.expectedFormat}`);
      lines.push(`      Fix type: ${issue.fixType}`);
      for (const step of issue.remediation) {
        lines.push(`        → ${step}`);
      }
    }
  }
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}
