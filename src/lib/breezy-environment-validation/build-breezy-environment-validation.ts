import { invalidateConfigCache, loadConfigSync } from "@/lib/config";
import {
  fetchBreezyCandidateEnrichmentPayload,
  fetchBreezyJobs,
  fetchBreezyPositionById,
  resolveBreezyCompany,
  wasBreezyRateLimitHit,
  resetBreezyRateLimitHit,
} from "@/lib/breezy-api";
import type {
  BreezyEndpointProbe,
  BreezyEnvVarCheck,
  BreezyEnvironmentValidationReport,
  BreezyLiveFetchCheck,
} from "@/lib/breezy-environment-validation/types";
import { P92_1_PREVIEW_MODE, P92_1_SOURCE_PHASE } from "@/lib/breezy-environment-validation/types";

export const P91_REFERENCE_POSITION_ID = "bcec23eed536";
export const P91_REFERENCE_CANDIDATE_ID = "6d548b240ab0";

const CLIENT_MAX_REQUESTS_PER_MINUTE = 40;

function checkEnvVars(): BreezyEnvVarCheck[] {
  const config = loadConfigSync();
  const checks: BreezyEnvVarCheck[] = [
    {
      name: "BREEZY_API_KEY",
      required: true,
      configured: config.breezyApiKey.length > 0,
      issue: config.breezyApiKey.length > 0 ? null : "Missing or placeholder BREEZY_API_KEY",
    },
    {
      name: "BREEZY_COMPANY_ID",
      required: false,
      configured: config.breezyCompanyId.length > 0,
      issue: null,
    },
    {
      name: "BREEZY_ADDED_DATE_TIMEZONE",
      required: false,
      configured: Boolean(process.env.BREEZY_ADDED_DATE_TIMEZONE?.trim()),
      issue: null,
    },
    {
      name: "BREEZY_SYNC_MAX_REQUESTS_PER_MINUTE",
      required: false,
      configured: Boolean(process.env.BREEZY_SYNC_MAX_REQUESTS_PER_MINUTE?.trim()),
      issue: null,
    },
  ];
  return checks;
}

function probeFromResult(
  endpoint: string,
  description: string,
  result: { ok: boolean; error?: string },
  httpStatus?: number | null,
): BreezyEndpointProbe {
  const error = result.ok ? null : (result.error ?? "Unknown error");
  const lower = (error ?? "").toLowerCase();
  const permissionDenied =
    lower.includes("http 403") ||
    lower.includes("forbidden") ||
    lower.includes("permission") ||
    lower.includes("not authorized");
  const statusMatch = error?.match(/HTTP (\d{3})/i);
  return {
    endpoint,
    description,
    success: result.ok,
    httpStatus: httpStatus ?? (statusMatch ? Number(statusMatch[1]) : null),
    error,
    permissionDenied,
  };
}

export async function buildBreezyEnvironmentValidation(input?: {
  knownJobId?: string;
  knownCandidateId?: string;
  knownPositionId?: string;
  rerunP92OnSuccess?: boolean;
}): Promise<BreezyEnvironmentValidationReport> {
  resetBreezyRateLimitHit();
  invalidateConfigCache();

  const knownPositionId = input?.knownPositionId ?? P91_REFERENCE_POSITION_ID;
  const knownCandidateId = input?.knownCandidateId ?? P91_REFERENCE_CANDIDATE_ID;
  const knownJobId = input?.knownJobId ?? knownPositionId;
  const rerunP92OnSuccess = input?.rerunP92OnSuccess ?? true;

  const environmentVariables = checkEnvVars();
  const missingRequired = environmentVariables
    .filter((v) => v.required && !v.configured)
    .map((v) => v.name);

  const endpointProbes: BreezyEndpointProbe[] = [];
  const liveFetches: BreezyLiveFetchCheck[] = [];

  if (missingRequired.length > 0) {
    return {
      sourcePhase: P92_1_SOURCE_PHASE,
      previewMode: P92_1_PREVIEW_MODE,
      generatedAt: new Date().toISOString(),
      authentication: {
        status: "not_attempted",
        companyId: null,
        companyName: null,
        error: `Missing required environment: ${missingRequired.join(", ")}`,
      },
      environmentVariables,
      missingRequired,
      rateLimits: {
        clientMaxRequestsPerMinute: CLIENT_MAX_REQUESTS_PER_MINUTE,
        rateLimitHitDuringValidation: false,
        notes: ["Authentication skipped — BREEZY_API_KEY not configured."],
      },
      permissions: {
        readCompanies: false,
        readPositionsList: false,
        readPositionById: false,
        readCandidateById: false,
        missingScopes: ["companies", "positions", "position_detail", "candidate_detail"],
        unavailableEndpoints: [],
      },
      endpointProbes,
      liveFetches,
      overallOk: false,
      failureReason: `Set ${missingRequired.join(", ")} in .env.local and restart.`,
      p92RerunTriggered: false,
      p92RerunSummary: {
        ran: false,
        jobsReviewed: 0,
        candidatesUnlockedIfApproved: 0,
        statusCounts: {},
        artifactPath: null,
        error: "Skipped — authentication not configured",
      },
    };
  }

  const companyResult = await resolveBreezyCompany();
  endpointProbes.push(
    probeFromResult("/companies", "List companies (authentication)", companyResult),
  );

  if (!companyResult.ok) {
    const lower = companyResult.error.toLowerCase();
    const permissionDenied = lower.includes("403") || lower.includes("forbidden");
    return {
      sourcePhase: P92_1_SOURCE_PHASE,
      previewMode: P92_1_PREVIEW_MODE,
      generatedAt: new Date().toISOString(),
      authentication: {
        status: "failed",
        companyId: null,
        companyName: null,
        error: companyResult.error,
      },
      environmentVariables,
      missingRequired,
      rateLimits: {
        clientMaxRequestsPerMinute: CLIENT_MAX_REQUESTS_PER_MINUTE,
        rateLimitHitDuringValidation: wasBreezyRateLimitHit(),
        notes: wasBreezyRateLimitHit() ? ["Breezy rate limit (429) observed during validation."] : [],
      },
      permissions: {
        readCompanies: false,
        readPositionsList: false,
        readPositionById: false,
        readCandidateById: false,
        missingScopes: permissionDenied ? ["companies.read"] : [],
        unavailableEndpoints: ["/companies"],
      },
      endpointProbes,
      liveFetches,
      overallOk: false,
      failureReason: lower.includes("401") || lower.includes("unauthorized")
        ? "BREEZY_API_KEY is invalid or expired."
        : companyResult.error,
      p92RerunTriggered: false,
      p92RerunSummary: {
        ran: false,
        jobsReviewed: 0,
        candidatesUnlockedIfApproved: 0,
        statusCounts: {},
        artifactPath: null,
        error: "Skipped — authentication failed",
      },
    };
  }

  const { companyId, companyName } = companyResult;

  const publishedJobs = await fetchBreezyJobs("published");
  endpointProbes.push(
    probeFromResult(
      `/company/${companyId}/positions?state=published`,
      "List published positions",
      publishedJobs,
    ),
  );

  const positionResult = await fetchBreezyPositionById(knownPositionId);
  endpointProbes.push(
    probeFromResult(
      `/company/${companyId}/position/${knownPositionId}`,
      "Fetch P91 reference position by ID",
      positionResult.ok ? { ok: true } : positionResult,
    ),
  );

  if (positionResult.ok && positionResult.found) {
    liveFetches.push({
      kind: "p91_position",
      id: knownPositionId,
      success: true,
      error: null,
      summary: `${positionResult.job.name} — status: ${positionResult.job.status}`,
    });
  } else if (positionResult.ok && !positionResult.found) {
    liveFetches.push({
      kind: "p91_position",
      id: knownPositionId,
      success: false,
      error: "Position not found (404)",
      summary: null,
    });
  } else if (!positionResult.ok) {
    liveFetches.push({
      kind: "p91_position",
      id: knownPositionId,
      success: false,
      error: positionResult.error,
      summary: null,
    });
  }

  const jobFetchId = knownJobId;
  const jobPositionResult =
    jobFetchId === knownPositionId ? positionResult : await fetchBreezyPositionById(jobFetchId);
  if (jobPositionResult.ok && jobPositionResult.found) {
    liveFetches.push({
      kind: "job",
      id: jobFetchId,
      success: true,
      error: null,
      summary: `${jobPositionResult.job.name} — status: ${jobPositionResult.job.status}`,
    });
  } else if (jobPositionResult.ok && !jobPositionResult.found) {
    liveFetches.push({
      kind: "job",
      id: jobFetchId,
      success: false,
      error: "Job/position not found",
      summary: null,
    });
  } else if (!jobPositionResult.ok) {
    liveFetches.push({
      kind: "job",
      id: jobFetchId,
      success: false,
      error: jobPositionResult.error,
      summary: null,
    });
  }

  const candidateResult = await fetchBreezyCandidateEnrichmentPayload({
    companyId,
    positionId: knownPositionId,
    candidateId: knownCandidateId,
  });
  endpointProbes.push(
    probeFromResult(
      `/company/${companyId}/position/${knownPositionId}/candidate/${knownCandidateId}`,
      "Fetch candidate detail (P91 reference)",
      candidateResult,
    ),
  );

  if (candidateResult.ok) {
    const name =
      typeof candidateResult.payload.detail?.name === "string"
        ? candidateResult.payload.detail.name
        : "Candidate";
    liveFetches.push({
      kind: "candidate",
      id: knownCandidateId,
      positionId: knownPositionId,
      success: true,
      error: null,
      summary: name,
    });
  } else {
    liveFetches.push({
      kind: "candidate",
      id: knownCandidateId,
      positionId: knownPositionId,
      success: false,
      error: candidateResult.error,
      summary: null,
    });
  }

  const missingScopes: string[] = [];
  const unavailableEndpoints: string[] = [];
  if (!endpointProbes[0]?.success) {
    missingScopes.push("companies.read");
    unavailableEndpoints.push("/companies");
  }
  if (!endpointProbes[1]?.success) {
    missingScopes.push("positions.list");
    unavailableEndpoints.push(`/company/${companyId}/positions`);
  }
  if (!endpointProbes[2]?.success) {
    missingScopes.push("positions.read");
    unavailableEndpoints.push(`/company/${companyId}/position/{id}`);
  }
  if (!endpointProbes[3]?.success) {
    missingScopes.push("candidates.read");
    unavailableEndpoints.push(`/company/${companyId}/position/{id}/candidate/{id}`);
  }

  const authOk = companyResult.ok;
  const liveOk =
    liveFetches.some((f) => f.kind === "p91_position" && f.success) &&
    liveFetches.some((f) => f.kind === "candidate" && f.success);

  const overallOk = authOk && publishedJobs.ok && liveOk;

  let p92RerunSummary: BreezyEnvironmentValidationReport["p92RerunSummary"] = {
    ran: false,
    jobsReviewed: 0,
    candidatesUnlockedIfApproved: 0,
    statusCounts: {},
    artifactPath: null,
    error: overallOk ? null : "Skipped — validation did not pass",
  };

  let p92RerunTriggered = false;
  if (overallOk && rerunP92OnSuccess) {
    p92RerunTriggered = true;
    try {
      const { writeFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const { recruitingDataDir, safeRecruitingMkdir } = await import("@/lib/recruiting-data-dir");
      const { buildBreezyJobStatusReconciliationFromStores } = await import(
        "@/lib/breezy-job-status-reconciliation"
      );
      const report = await buildBreezyJobStatusReconciliationFromStores({ mtdOnly: true });
      const outDir = recruitingDataDir();
      await safeRecruitingMkdir(outDir);
      const artifactPath = path.join(outDir, "p92-breezy-job-status-reconciliation.json");
      await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      p92RerunSummary = {
        ran: true,
        jobsReviewed: report.metrics.totalJobsReviewed,
        candidatesUnlockedIfApproved: report.metrics.candidatesUnlockedIfApproved,
        statusCounts: report.metrics.statusCounts,
        artifactPath,
        error: null,
      };
    } catch (err) {
      p92RerunSummary = {
        ran: false,
        jobsReviewed: 0,
        candidatesUnlockedIfApproved: 0,
        statusCounts: {},
        artifactPath: null,
        error: err instanceof Error ? err.message : "P92 rerun failed",
      };
    }
  }

  return {
    sourcePhase: P92_1_SOURCE_PHASE,
    previewMode: P92_1_PREVIEW_MODE,
    generatedAt: new Date().toISOString(),
    authentication: {
      status: authOk ? "success" : "failed",
      companyId,
      companyName: companyName ?? null,
      error: null,
    },
    environmentVariables,
    missingRequired,
    rateLimits: {
      clientMaxRequestsPerMinute: CLIENT_MAX_REQUESTS_PER_MINUTE,
      rateLimitHitDuringValidation: wasBreezyRateLimitHit(),
      notes: [
        `Client-side throttle: ${CLIENT_MAX_REQUESTS_PER_MINUTE} GET requests/minute.`,
        ...(wasBreezyRateLimitHit() ? ["Breezy returned HTTP 429 during validation."] : []),
      ],
    },
    permissions: {
      readCompanies: endpointProbes[0]?.success ?? false,
      readPositionsList: endpointProbes[1]?.success ?? false,
      readPositionById: endpointProbes[2]?.success ?? false,
      readCandidateById: endpointProbes[3]?.success ?? false,
      missingScopes,
      unavailableEndpoints,
    },
    endpointProbes,
    liveFetches,
    overallOk,
    failureReason: overallOk
      ? null
      : !authOk
        ? "Authentication failed."
        : !publishedJobs.ok
          ? `Cannot list positions: ${publishedJobs.error}`
          : "One or more live fetches failed (position or candidate).",
    p92RerunTriggered,
    p92RerunSummary,
  };
}
