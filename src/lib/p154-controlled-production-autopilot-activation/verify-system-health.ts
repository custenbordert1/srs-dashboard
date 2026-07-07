import { fetchBreezyJobs } from "@/lib/breezy-api";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { loadPipelineAdvancementAuditLog } from "@/lib/p151-autonomous-candidate-advancement/p151-advancement-audit-store";
import { CANONICAL_RECRUITER_ROSTER } from "@/lib/recruiter-assignment-engine/recruiter-territory-eligibility";
import type {
  AutopilotDependencyCheck,
  AutopilotSystemHealthReport,
} from "@/lib/p154-controlled-production-autopilot-activation/types";

function check(
  id: string,
  label: string,
  status: AutopilotDependencyCheck["status"],
  detail: string,
): AutopilotDependencyCheck {
  return { id, label, status, detail };
}

function overallStatus(checks: AutopilotDependencyCheck[]): AutopilotSystemHealthReport["overallStatus"] {
  if (checks.some((c) => c.status === "unhealthy")) return "unhealthy";
  if (checks.some((c) => c.status === "degraded")) return "degraded";
  return "healthy";
}

export async function verifyAutopilotSystemHealth(): Promise<AutopilotSystemHealthReport> {
  const generatedAt = new Date().toISOString();
  const checks: AutopilotDependencyCheck[] = [];

  const breezyApiKey = process.env.BREEZY_API_KEY?.trim();
  if (!breezyApiKey) {
    checks.push(check("breezy_api", "Breezy API", "unhealthy", "BREEZY_API_KEY not configured."));
  } else {
    try {
      const jobs = await fetchBreezyJobs("published");
      if (jobs.ok) {
        checks.push(
          check(
            "breezy_api",
            "Breezy API",
            "healthy",
            `Breezy API reachable (${jobs.jobs.length} published jobs).`,
          ),
        );
      } else {
        checks.push(
          check("breezy_api", "Breezy API", "unhealthy", jobs.error || "Breezy jobs fetch failed."),
        );
      }
    } catch (error) {
      checks.push(
        check(
          "breezy_api",
          "Breezy API",
          "unhealthy",
          error instanceof Error ? error.message : "Breezy API check failed.",
        ),
      );
    }
  }

  const dropboxKey = process.env.DROPBOX_SIGN_API_KEY?.trim();
  checks.push(
    dropboxKey
      ? check("dropbox_sign_api", "Dropbox Sign API", "healthy", "DROPBOX_SIGN_API_KEY configured.")
      : check("dropbox_sign_api", "Dropbox Sign API", "unhealthy", "DROPBOX_SIGN_API_KEY not configured."),
  );

  try {
    const bundle = await getCandidateWorkflowBundle();
    const workflowCount = Object.keys(bundle.workflows).length;
    checks.push(
      check(
        "workflow_store",
        "Workflow store",
        "healthy",
        `Workflow store readable (${workflowCount} records).`,
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "workflow_store",
        "Workflow store",
        "unhealthy",
        error instanceof Error ? error.message : "Workflow store unreadable.",
      ),
    );
  }

  try {
    const store = await readIngestionStore();
    const ageMs = Date.now() - Date.parse(store.updatedAt || store.lastChunkAt || "1970-01-01");
    const stale = ageMs > 24 * 60 * 60 * 1000;
    checks.push(
      check(
        "candidate_ingestion",
        "Candidate ingestion",
        stale ? "degraded" : "healthy",
        stale
          ? `Ingestion store stale (${Math.round(ageMs / 3600000)}h since update).`
          : `Ingestion store fresh (${store.scannedPositionIds.length} positions scanned).`,
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "candidate_ingestion",
        "Candidate ingestion",
        "unhealthy",
        error instanceof Error ? error.message : "Ingestion store unreadable.",
      ),
    );
  }

  checks.push(
    CANONICAL_RECRUITER_ROSTER.length >= 5
      ? check(
          "recruiter_assignment_engine",
          "Recruiter assignment engine",
          "healthy",
          `${CANONICAL_RECRUITER_ROSTER.length} canonical recruiters configured.`,
        )
      : check(
          "recruiter_assignment_engine",
          "Recruiter assignment engine",
          "unhealthy",
          "Canonical recruiter roster incomplete.",
        ),
  );

  checks.push(
    check(
      "webhook_listener",
      "Webhook listeners",
      "healthy",
      "Dropbox Sign webhook route registered at /api/dropbox-sign/webhook (passive listener).",
    ),
  );

  try {
    const [paperworkAudit, pipelineAudit] = await Promise.all([
      loadPaperworkAutomationAuditLog(),
      loadPipelineAdvancementAuditLog(),
    ]);
    checks.push(
      check(
        "audit_logging",
        "Audit logging",
        "healthy",
        `Audit stores readable (P145: ${paperworkAudit.length}, P151: ${pipelineAudit.length} events).`,
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "audit_logging",
        "Audit logging",
        "unhealthy",
        error instanceof Error ? error.message : "Audit log unreadable.",
      ),
    );
  }

  const status = overallStatus(checks);
  const unhealthy = checks.filter((c) => c.status === "unhealthy");
  return {
    generatedAt,
    overallStatus: status,
    healthy: unhealthy.length === 0,
    checks,
    abortReason:
      unhealthy.length > 0
        ? `Unhealthy dependencies: ${unhealthy.map((c) => c.label).join(", ")}`
        : null,
  };
}
