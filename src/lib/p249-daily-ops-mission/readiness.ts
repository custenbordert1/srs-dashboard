import { buildBreezyEnvironmentValidation } from "@/lib/breezy-environment-validation/build-breezy-environment-validation";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { inspectLivePilotEnv } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { probeP185StorageConnectivity } from "@/lib/p185-production-paperwork-automation-runner";
import { loadP207DropboxDiagnosticsBase } from "@/lib/p207-autonomous-readiness-dashboard/dropboxDiagnostics";
import {
  checkP248ResendConfiguration,
  verifyResendSenderDomain,
} from "@/lib/p248-resend-live-reminder-campaign/config-check";
import {
  P249_OPS_DATE,
  P249_PHASE,
  type P249ChecklistItem,
  type P249ProductionReadiness,
} from "@/lib/p249-daily-ops-mission/types";

function present(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v) && !/^(placeholder|changeme|your-)/i.test(v);
}

function envItem(
  id: string,
  label: string,
  names: string[],
  required: boolean,
): P249ChecklistItem {
  const found = names.find((n) => present(n));
  const ok = Boolean(found);
  return {
    id,
    category: "env",
    label,
    status: ok ? "PASS" : required ? "FAIL" : "WARN",
    detail: ok
      ? `Present: ${found}`
      : `Missing: ${names.join(" or ")}`,
    automaticFix: false,
    manualAction: ok
      ? null
      : `Set ${names.join(" or ")} in .env.local (do not commit).`,
  };
}

async function probeSpfDkim(domain: string): Promise<P249ChecklistItem> {
  if (!domain) {
    return {
      id: "spf_dkim",
      category: "resend",
      label: "SPF/DKIM (DNS / Resend)",
      status: "SKIP",
      detail: "No From domain resolved",
      automaticFix: false,
      manualAction: null,
    };
  }

  // Prefer Resend domain status (covers DKIM/SPF setup in Resend).
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (apiKey && !/^(placeholder|changeme|your-)/i.test(apiKey)) {
    const probed = await verifyResendSenderDomain({
      apiKey,
      fromEmail: `ops@${domain}`,
    });
    return {
      id: "spf_dkim",
      category: "resend",
      label: "SPF/DKIM (Resend domain)",
      status: probed.ok ? "PASS" : "FAIL",
      detail: probed.detail,
      automaticFix: false,
      manualAction: probed.ok
        ? null
        : `Verify SPF/DKIM for ${domain} in the Resend dashboard.`,
    };
  }

  // Best-effort public DNS TXT for SPF only (no API key).
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`,
      { headers: { Accept: "application/dns-json" } },
    );
    const body = (await res.json()) as {
      Answer?: Array<{ data?: string }>;
    };
    const txt = (body.Answer ?? []).map((a) => a.data ?? "").join(" ");
    const hasSpf = /v=spf1/i.test(txt);
    return {
      id: "spf_dkim",
      category: "resend",
      label: "SPF (public DNS)",
      status: hasSpf ? "WARN" : "FAIL",
      detail: hasSpf
        ? `SPF TXT found for ${domain}; DKIM not verified without RESEND_API_KEY`
        : `No SPF TXT found for ${domain}; DKIM unchecked (RESEND_API_KEY missing)`,
      automaticFix: false,
      manualAction:
        "Configure RESEND_API_KEY and verify domain SPF/DKIM in Resend before live email.",
    };
  } catch (error) {
    return {
      id: "spf_dkim",
      category: "resend",
      label: "SPF/DKIM",
      status: "WARN",
      detail: error instanceof Error ? error.message : "DNS probe failed",
      automaticFix: false,
      manualAction: "Manually verify SPF/DKIM in Resend dashboard.",
    };
  }
}

export async function buildP249ProductionReadiness(): Promise<P249ProductionReadiness> {
  const checklist: P249ChecklistItem[] = [];

  const resend = await checkP248ResendConfiguration();
  checklist.push({
    id: "resend_api_key",
    category: "resend",
    label: "RESEND_API_KEY present",
    status: resend.requiredEnv.RESEND_API_KEY.present &&
      !resend.requiredEnv.RESEND_API_KEY.placeholder
      ? "PASS"
      : "FAIL",
    detail: resend.requiredEnv.RESEND_API_KEY.present
      ? `Present (length=${resend.requiredEnv.RESEND_API_KEY.length}; value not shown)`
      : "Missing from runtime environment",
    automaticFix: false,
    manualAction: "Add RESEND_API_KEY to .env.local from https://resend.com/api-keys",
  });
  checklist.push({
    id: "email_mode",
    category: "resend",
    label: "DIRECT_DEPOSIT_EMAIL_MODE=resend",
    status: resend.requiredEnv.DIRECT_DEPOSIT_EMAIL_MODE.liveEnabled ? "PASS" : "FAIL",
    detail: `Current mode: ${resend.requiredEnv.DIRECT_DEPOSIT_EMAIL_MODE.value}`,
    automaticFix: false,
    manualAction: "Set DIRECT_DEPOSIT_EMAIL_MODE=resend in .env.local",
  });
  checklist.push({
    id: "sender_from",
    category: "resend",
    label: "Recruiting From address",
    status: resend.requiredEnv.SRS_RECRUITING_FROM_EMAIL.present ? "PASS" : "FAIL",
    detail: `Resolved From: ${resend.resolvedFrom}`,
    automaticFix: false,
    manualAction:
      "Set SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com",
  });
  checklist.push({
    id: "sender_domain",
    category: "resend",
    label: "Sender domain verification",
    status: !resend.senderVerification.attempted
      ? "FAIL"
      : resend.senderVerification.ok
        ? "PASS"
        : "FAIL",
    detail: resend.senderVerification.detail,
    automaticFix: false,
    manualAction: "Verify From domain in Resend dashboard",
  });
  checklist.push(await probeSpfDkim(resend.fromDomain));
  checklist.push({
    id: "resend_secrets_safe",
    category: "resend",
    label: "RESEND_API_KEY not committed",
    status: resend.secretsSafe.keyNotCommitted ? "PASS" : "FAIL",
    detail: resend.secretsSafe.keyNotCommitted
      ? "Key not found in tracked env example files"
      : "Key appears committed — rotate immediately",
    automaticFix: false,
    manualAction: resend.secretsSafe.keyNotCommitted
      ? null
      : "Remove key from tracked files and rotate in Resend",
  });

  checklist.push(
    envItem("dropbox_api_key", "DROPBOX_SIGN_API_KEY", ["DROPBOX_SIGN_API_KEY"], true),
  );
  checklist.push(
    envItem("breezy_api_key", "BREEZY_API_KEY", ["BREEZY_API_KEY"], true),
  );
  checklist.push(
    envItem(
      "database_url",
      "Database URL (Neon/Postgres)",
      ["P185_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL"],
      false,
    ),
  );
  checklist.push(
    envItem("session_secret", "SESSION_SECRET", ["SESSION_SECRET"], false),
  );

  const dropboxCfg = readDropboxSignConfig();
  const dropboxDiag = await loadP207DropboxDiagnosticsBase();
  const dropboxVendorBlocked =
    dropboxDiag.configurationStatus === "vendor_blocked" ||
    /vendor blocked|quota=0/i.test(dropboxDiag.detail);
  checklist.push({
    id: "dropbox_connectivity",
    category: "dropbox",
    label: "Dropbox Sign connectivity (read-only)",
    status:
      dropboxDiag.apiStatus === "ok"
        ? dropboxVendorBlocked
          ? "WARN"
          : "PASS"
        : dropboxCfg
          ? "WARN"
          : "FAIL",
    detail: `${dropboxDiag.detail} (apiStatus=${dropboxDiag.apiStatus}, config=${dropboxDiag.configurationStatus})`,
    automaticFix: false,
    manualAction: dropboxVendorBlocked
      ? "Production Dropbox quota is 0 — reminder status probes OK; live production packet sends blocked unless testMode is intentionally used"
      : dropboxCfg
        ? null
        : "Configure DROPBOX_SIGN_API_KEY and retry probe",
  });
  checklist.push({
    id: "dropbox_test_mode",
    category: "dropbox",
    label: "Dropbox testMode",
    status: dropboxCfg ? "PASS" : "FAIL",
    detail: dropboxCfg
      ? `testMode=${dropboxCfg.testMode} (explicit env DROPBOX_SIGN_TEST_MODE=${process.env.DROPBOX_SIGN_TEST_MODE ?? "unset"})`
      : "Dropbox config missing",
    automaticFix: false,
    manualAction:
      "Confirm intentional test vs production mode before live packet sends",
  });

  const breezy = await buildBreezyEnvironmentValidation({
    rerunP92OnSuccess: false,
  });
  const breezyOk = breezy.overallOk;
  checklist.push({
    id: "breezy_connectivity",
    category: "breezy",
    label: "Breezy connectivity (read-only)",
    status: breezyOk ? "PASS" : "FAIL",
    detail: breezyOk
      ? `Company=${breezy.authentication.companyName ?? breezy.authentication.companyId ?? "ok"}; probes ok=${breezy.endpointProbes.filter((p) => p.success).length}/${breezy.endpointProbes.length}`
      : `Breezy validation failed: ${breezy.failureReason ?? "unknown"}; missing=${breezy.missingRequired.join(", ") || "n/a"}`,
    automaticFix: false,
    manualAction: breezyOk ? null : "Fix BREEZY_API_KEY / company access and re-probe",
  });

  const storage = await probeP185StorageConnectivity();
  checklist.push({
    id: "database_connectivity",
    category: "database",
    label: "Database / Neon connectivity",
    status: storage.configuredPostgres
      ? storage.connectivityOk
        ? "PASS"
        : "FAIL"
      : "WARN",
    detail: storage.detail,
    automaticFix: false,
    manualAction: storage.configuredPostgres
      ? storage.connectivityOk
        ? null
        : "Fix DATABASE_URL / Neon connectivity before live durable writes"
      : "Optional for dry-run; set P185_DATABASE_URL or DATABASE_URL for durable live path",
  });

  const pilot = inspectLivePilotEnv();
  checklist.push({
    id: "feature_flags_pilot",
    category: "flags",
    label: "Live pilot feature flags",
    status: pilot.ok ? "PASS" : "WARN",
    detail: pilot.ok
      ? "LIVE_PILOT_ENABLED + LIVE_MODE + OPERATOR_GO are true"
      : `Not set for live paperwork: ${pilot.missing.join(", ") || "n/a"}`,
    automaticFix: false,
    manualAction: pilot.ok
      ? null
      : "Export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED / LIVE_MODE / OPERATOR_GO before live sends",
  });

  for (const flag of [
    "P151_ENABLED",
    "P184_ENABLED",
    "P185_ENABLED",
    "P186_READY_FOR_MEL_REVIEW_ACTIONS",
  ]) {
    const on = /^(1|true|yes)$/i.test(process.env[flag]?.trim() ?? "");
    checklist.push({
      id: `flag_${flag.toLowerCase()}`,
      category: "flags",
      label: flag,
      status: on ? "PASS" : "WARN",
      detail: on ? "enabled" : "unset/false (informational)",
      automaticFix: false,
      manualAction: null,
    });
  }

  const passCount = checklist.filter((c) => c.status === "PASS").length;
  const failCount = checklist.filter((c) => c.status === "FAIL").length;
  const warnCount = checklist.filter((c) => c.status === "WARN").length;

  // Prefer Resend-specific blockers; append unique FAIL checklist lines only when new.
  const blockers: string[] = [...resend.blockers];
  for (const c of checklist.filter((item) => item.status === "FAIL")) {
    const line = `${c.label}: ${c.detail}`;
    const already = blockers.some(
      (b) =>
        b.includes(c.label) ||
        (c.id === "resend_api_key" && b.includes("RESEND_API_KEY")) ||
        (c.id === "email_mode" && b.includes("DIRECT_DEPOSIT_EMAIL_MODE")) ||
        (c.id === "sender_from" && b.includes("SRS_RECRUITING_FROM")) ||
        (c.id === "sender_domain" && b.toLowerCase().includes("sender domain")),
    );
    if (!already) blockers.push(line);
  }

  return {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    mode: "read_only",
    overall: failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS",
    checklist,
    passCount,
    failCount,
    warnCount,
    blockers,
    modes: {
      emailMode: resend.requiredEnv.DIRECT_DEPOSIT_EMAIL_MODE.value,
      dropboxTestMode: dropboxCfg?.testMode ?? null,
      resendReady: resend.readyForLive,
      pilotLiveEnvOk: pilot.ok,
    },
  };
}
