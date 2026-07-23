import type { P249ChecklistItem, P249ProductionReadiness } from "@/lib/p249-daily-ops-mission/types";
import { P248_APPROVED_FROM_FALLBACK } from "@/lib/p248-resend-live-reminder-campaign/types";
import {
  P250_OPS_DATE,
  P250_PHASE,
  type P250BlockerRemediation,
  type P250BlockersAndRemediation,
} from "@/lib/p250-go-live-preparation/types";

function remediationFor(item: P249ChecklistItem): string[] {
  switch (item.id) {
    case "resend_api_key":
      return [
        "Open https://resend.com/api-keys and create (or copy) an API key for the SRS Resend account.",
        "Add to `.env.local` (do not commit): `RESEND_API_KEY=<paste key>`",
        "Restart any running Node/tsx process so it picks up the new env.",
        "Re-run: `npx tsx scripts/p250-run-go-live-preparation.ts` and confirm this check PASS (length shown only; value never printed).",
      ];
    case "email_mode":
      return [
        "In `.env.local` set: `DIRECT_DEPOSIT_EMAIL_MODE=resend`",
        "Do not use `log` or `outbox` for live reminder delivery.",
        "Re-run P250 (or P248 config check) and confirm mode=`resend` and canLiveDeliver=true.",
      ];
    case "sender_from":
      return [
        `In \`.env.local\` set: \`SRS_RECRUITING_FROM_EMAIL=${P248_APPROVED_FROM_FALLBACK}\``,
        `Optionally set: \`SRS_RECRUITING_REPLY_TO_EMAIL=${P248_APPROVED_FROM_FALLBACK}\``,
        "Do not leave From falling back to DIRECT_DEPOSIT_FROM (HR) for recruiting reminders.",
        "Confirm the address is an approved mailbox on a Resend-verified domain.",
      ];
    case "sender_domain":
      return [
        "Ensure RESEND_API_KEY is set first (domain probe requires it).",
        "In Resend dashboard → Domains: add/verify the From domain (e.g. strategicretailsolutions.com).",
        "Complete SPF/DKIM/DMARC per Resend DNS instructions for that domain.",
        "Wait until Resend shows domain status `verified`.",
        "Re-run P250; sender domain check must PASS before live email.",
      ];
    case "spf_dkim":
      return [
        "Configure RESEND_API_KEY so Resend domain status (SPF/DKIM) can be probed.",
        "In Resend → Domains, confirm SPF and DKIM records are valid for the From domain.",
        "If public DNS SPF exists but Resend is unverified, finish Resend verification before live send.",
      ];
    case "dropbox_connectivity":
      return [
        "Production Dropbox Sign quota is 0 (vendor_blocked) — status probes still work.",
        "For reminder emails only: no Dropbox write required; proceed after Resend is ready.",
        "For initial paperwork packet sends: either restore production quota with Dropbox Sign support, or intentionally keep `DROPBOX_SIGN_TEST_MODE=true` and document that packets are test envelopes.",
        "Do not flip testMode to false while production quota remains 0.",
      ];
    case "feature_flags_pilot":
      return [
        "Only for live initial paperwork (P243), export before `--live --confirm-live`:",
        "  `export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true`",
        "  `export AUTONOMOUS_PAPERWORK_LIVE_MODE=true`",
        "  `export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true`",
        "Reminder campaign (P248) does not require these pilot flags.",
      ];
    default:
      if (item.manualAction) return [item.manualAction];
      return ["Review checklist detail and remediate using the owning runbook for this check."];
  }
}

function verificationFor(item: P249ChecklistItem): string | null {
  if (item.category === "resend" || item.id.startsWith("flag_") || item.id === "feature_flags_pilot") {
    return "npx tsx scripts/p250-run-go-live-preparation.ts";
  }
  if (item.category === "dropbox" || item.category === "breezy" || item.category === "database") {
    return "npx tsx scripts/p250-run-go-live-preparation.ts";
  }
  return item.manualAction ? null : "npx tsx scripts/p250-run-go-live-preparation.ts";
}

function present(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v) && !/^(placeholder|changeme|your-)/i.test(v);
}

export function buildP250BlockersAndRemediation(
  readiness: P249ProductionReadiness,
  p249ArtifactsReused: string[],
): P250BlockersAndRemediation {
  const mapItem = (item: P249ChecklistItem, severity: "blocker" | "warn"): P250BlockerRemediation => ({
    id: item.id,
    severity,
    category: item.category,
    check: item.label,
    status: item.status,
    observed: item.detail,
    remediationSteps: remediationFor(item),
    verificationCommand: verificationFor(item),
    automaticFix: false,
  });

  const blockers = readiness.checklist
    .filter((c) => c.status === "FAIL")
    .map((c) => mapItem(c, "blocker"));
  const warnings = readiness.checklist
    .filter((c) => c.status === "WARN")
    .map((c) => mapItem(c, "warn"));

  return {
    phase: P250_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P250_OPS_DATE,
    mode: "read_only",
    readinessOverall: readiness.overall,
    passCount: readiness.passCount,
    failCount: readiness.failCount,
    warnCount: readiness.warnCount,
    modes: readiness.modes,
    blockers,
    warnings,
    envPresence: [
      {
        name: "RESEND_API_KEY",
        present: present("RESEND_API_KEY"),
        notes: "Required for live email; value never printed",
      },
      {
        name: "DIRECT_DEPOSIT_EMAIL_MODE",
        present: present("DIRECT_DEPOSIT_EMAIL_MODE"),
        notes: `Current=${process.env.DIRECT_DEPOSIT_EMAIL_MODE?.trim() || "unset"}; must be resend for live`,
      },
      {
        name: "SRS_RECRUITING_FROM_EMAIL",
        present: present("SRS_RECRUITING_FROM_EMAIL"),
        notes: `Approved fallback when set: ${P248_APPROVED_FROM_FALLBACK}`,
      },
      {
        name: "DROPBOX_SIGN_API_KEY",
        present: present("DROPBOX_SIGN_API_KEY"),
        notes: "Present for status probes",
      },
      {
        name: "DROPBOX_SIGN_TEST_MODE",
        present: present("DROPBOX_SIGN_TEST_MODE"),
        notes: `Current=${process.env.DROPBOX_SIGN_TEST_MODE?.trim() || "unset"}`,
      },
      {
        name: "BREEZY_API_KEY",
        present: present("BREEZY_API_KEY"),
        notes: "Required for candidate/job reads",
      },
      {
        name: "DATABASE_URL / P185_DATABASE_URL",
        present: present("DATABASE_URL") || present("P185_DATABASE_URL") || present("POSTGRES_URL"),
        notes: "Neon/Postgres durable store",
      },
      {
        name: "SESSION_SECRET",
        present: present("SESSION_SECRET"),
        notes: "App session signing",
      },
      {
        name: "AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED",
        present: /^(1|true|yes)$/i.test(
          process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED?.trim() ?? "",
        ),
        notes: "Required only for live initial paperwork pilot",
      },
      {
        name: "AUTONOMOUS_PAPERWORK_LIVE_MODE",
        present: /^(1|true|yes)$/i.test(
          process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE?.trim() ?? "",
        ),
        notes: "Required only for live initial paperwork pilot",
      },
      {
        name: "AUTONOMOUS_PAPERWORK_OPERATOR_GO",
        present: /^(1|true|yes)$/i.test(
          process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO?.trim() ?? "",
        ),
        notes: "Required only for live initial paperwork pilot",
      },
    ],
    source: {
      readinessRefreshed: true,
      p249ArtifactsReused,
    },
  };
}
