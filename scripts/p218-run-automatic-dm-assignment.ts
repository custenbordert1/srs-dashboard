/**
 * P218 — Automatic DM Assignment Engine
 *
 * Default (and P218 execution in this task):
 *   node --import tsx scripts/p218-run-automatic-dm-assignment.ts
 *   node --import tsx scripts/p218-run-automatic-dm-assignment.ts --preview
 *
 * Supported but NOT executed by P218:
 *   node --import tsx scripts/p218-run-automatic-dm-assignment.ts \
 *     --live --operator-approved --approved-by=<operator>
 *
 * Position.Location is authoritative. Job-title parsing is never used.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BreezyJob } from "@/lib/breezy-api";
import type {
  P218AssignmentDecision,
  P218AssignmentInput,
} from "@/lib/p218-automatic-dm-assignment";

function loadEnvLocal(): void {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const equals = value.indexOf("=");
    if (equals < 0) continue;
    const key = value.slice(0, equals).trim();
    let content = value.slice(equals + 1).trim();
    if (
      (content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith("'") && content.endsWith("'"))
    ) {
      content = content.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = content;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeArtifact(name: string, value: unknown): void {
  mkdirSync("artifacts", { recursive: true });
  const target = path.join("artifacts", name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  console.log(`[artifact] ${target}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

type CandidateEvidence = {
  name?: string;
  email?: string;
  city?: string;
  state?: string;
  positionId?: string;
  positionName?: string;
  candidateStage?: string;
};

function buildEvidence(): Map<string, CandidateEvidence> {
  const byId = new Map<string, CandidateEvidence>();
  const merge = (candidateId: string, patch: CandidateEvidence): void => {
    const current = byId.get(candidateId) ?? {};
    byId.set(candidateId, {
      name: current.name || patch.name,
      email: current.email || patch.email,
      city: current.city || patch.city,
      state: current.state || patch.state,
      positionId: current.positionId || patch.positionId,
      positionName: current.positionName || patch.positionName,
      candidateStage: current.candidateStage || patch.candidateStage,
    });
  };
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, any>;
    if (!Array.isArray(value) && typeof record.candidateId === "string") {
      merge(record.candidateId, {
        name:
          typeof record.name === "string"
            ? record.name
            : [record.firstName, record.lastName].filter(Boolean).join(" "),
        email: typeof record.email === "string" ? record.email : undefined,
        city: typeof record.city === "string" ? record.city : undefined,
        state: typeof record.state === "string" ? record.state : undefined,
        positionId:
          typeof record.positionId === "string" ? record.positionId : undefined,
        positionName:
          typeof record.positionName === "string" ? record.positionName : undefined,
        candidateStage:
          typeof record.stage === "string" ? record.stage : undefined,
      });
    }
    for (const child of Object.values(record)) walk(child);
  };

  const ingestion = readJson<{ candidates: Record<string, any> }>(
    ".data/candidate-ingestion.json",
  );
  for (const [candidateId, candidate] of Object.entries(
    ingestion.candidates ?? {},
  )) {
    merge(candidateId, {
      name: `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim(),
      email: candidate.email,
      city: candidate.city,
      state: candidate.state,
      positionId: candidate.positionId,
      positionName: candidate.positionName,
      candidateStage: candidate.stage,
    });
  }

  for (const file of [
    ".data/p205-operator-local.json",
    ".data/p204-1-supervised-pilot-operator-local.json",
    ".data/p193-3-questionnaire-store.json",
    ".data/p200-2-zip-capture-store.json",
  ]) {
    if (!existsSync(file)) continue;
    try {
      walk(readJson(file));
    } catch {
      // Optional historical evidence is best-effort and read-only.
    }
  }
  return byId;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const {
    authorizeP218Mode,
    assertP218LiveAuthorized,
    evaluateP218Assignment,
    executeP218Assignments,
    isP218WorkflowActive,
    summarizeP218Decisions,
  } = await import("@/lib/p218-automatic-dm-assignment");
  const authorization = authorizeP218Mode(process.argv.slice(2));
  assertP218LiveAuthorized(authorization);
  const mode = authorization.mode;
  console.log(
    `P218 mode=${mode}${
      mode === "live" ? ` approvedBy=${authorization.approvedBy}` : " (default safe mode)"
    }`,
  );

  const workflowRawBefore = readFileSync(".data/candidate-workflows.json", "utf8");
  const ingestionRawBefore = readFileSync(".data/candidate-ingestion.json", "utf8");
  const workflowHashBefore = sha256(workflowRawBefore);
  const ingestionHashBefore = sha256(ingestionRawBefore);
  const workflows = (JSON.parse(workflowRawBefore) as {
    workflows: Record<string, any>;
  }).workflows;
  const evidence = buildEvidence();

  const { getDmForState } = await import("@/lib/dm-territory-map");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");

  // Read-only position catalogs cover current and historical applications.
  const positionCatalog = new Map<string, BreezyJob>();
  const catalogErrors: string[] = [];
  for (const state of ["published", "closed", "archived", "draft"]) {
    const result = await fetchBreezyJobs(state);
    if (!result.ok) {
      catalogErrors.push(`${state}: ${result.error}`);
      continue;
    }
    for (const job of result.jobs) {
      positionCatalog.set(job.jobId, job);
      if (job.friendlyId) positionCatalog.set(job.friendlyId, job);
    }
  }

  const activeIds = Object.keys(workflows).filter((candidateId) =>
    isP218WorkflowActive(String(workflows[candidateId]?.workflowStatus ?? "")),
  );
  const inputs: P218AssignmentInput[] = activeIds.map((candidateId) => {
    const workflow = workflows[candidateId] ?? {};
    const candidate = evidence.get(candidateId) ?? {};
    const positionId = candidate.positionId?.trim() ?? "";
    const position = positionId ? positionCatalog.get(positionId) ?? null : null;
    const expectedDm = position?.state
      ? String(getDmForState(position.state) ?? "")
      : "";
    return {
      candidateId,
      workflowStage: String(workflow.workflowStatus ?? ""),
      candidateStage: String(candidate.candidateStage ?? ""),
      currentAssignedDm: workflow.assignedDM,
      // Any named DM is protected independently by the decision engine. The
      // current schema has no durable DM-specific source field.
      manuallyAssigned:
        Boolean(String(workflow.assignedDM ?? "").trim()) &&
        !/^unassigned$/i.test(String(workflow.assignedDM ?? "").trim()) &&
        workflow.recruiterAssignmentSource === "manual",
      positionId: positionId || null,
      positionLookupAttempted: Boolean(positionId),
      position: position
        ? {
            positionId: position.jobId,
            name: position.name,
            status: position.status,
            city: position.city,
            state: position.state,
            zip: position.zip,
            displayLocation: position.displayLocation,
            locationSource: position.locationSource,
          }
        : null,
      dmCandidates: expectedDm ? [expectedDm] : [],
    };
  });

  const previewDecisions = inputs.map(evaluateP218Assignment);
  let decisions: P218AssignmentDecision[];
  if (mode === "live") {
    const { assignCandidateDmIfUnassigned } = await import(
      "@/lib/candidate-workflow-store"
    );
    decisions = await executeP218Assignments({
      decisions: previewDecisions,
      authorization,
      persist: async (request) => {
        const result = await assignCandidateDmIfUnassigned(request);
        return { assigned: result.assigned, reason: result.reason };
      },
    });
  } else {
    decisions = await executeP218Assignments({
      decisions: previewDecisions,
      authorization,
    });
  }
  const summary = summarizeP218Decisions(decisions);

  // P218 eligibility simulation: remove only blocked_dm_unassigned from the
  // fresh P216 gate evidence; every other coverage/paperwork blocker remains.
  const p216 = readJson<{
    candidates: Array<{
      redactedCandidateId: string;
      position: string;
      positionLocation: { city: string; state: string; source: string } | null;
      nearestWork: string | null;
      distanceMiles: number | null;
      coverageTier: string;
      blockers: string[];
      workflowStage?: string;
    }>;
  }>("artifacts/p216-candidate-comparison.json");
  const decisionsByRedacted = new Map(
    decisions.map((decision) => [
      sha256(decision.candidateId).slice(0, 12),
      decision,
    ]),
  );
  const eligibilitySimulation = (p216.candidates ?? []).map((candidate) => {
    const decision = decisionsByRedacted.get(candidate.redactedCandidateId);
    const simulatedBlockers = candidate.blockers.filter(
      (blocker) =>
        !(
          blocker === "blocked_dm_unassigned" &&
          (decision?.action === "would_assign" || decision?.action === "assigned")
        ),
    );
    const newlyEligible =
      candidate.blockers.includes("blocked_dm_unassigned") &&
      Boolean(decision?.expectedAssignedDm) &&
      simulatedBlockers.length === 0;
    return {
      redactedCandidateId: candidate.redactedCandidateId,
      position: candidate.position,
      positionLocation: candidate.positionLocation,
      nearestWork: candidate.nearestWork,
      distanceMiles: candidate.distanceMiles,
      coverageTier: candidate.coverageTier,
      expectedAssignedDm: decision?.expectedAssignedDm ?? null,
      blockersBefore: candidate.blockers,
      blockersAfterSimulatedAssignment: simulatedBlockers,
      coverageGatePasses: !simulatedBlockers.some((blocker) =>
        /coverage|miles|active_work/.test(blocker),
      ),
      paperworkEligibilityAfterAssignment: newlyEligible
        ? "ELIGIBLE"
        : "BLOCKED",
      newlyEligible,
    };
  });
  const newlyEligible = eligibilitySimulation.filter(
    (candidate) => candidate.newlyEligible,
  );
  const stillBlocked = eligibilitySimulation.filter(
    (candidate) => !candidate.newlyEligible,
  );

  const workflowRawAfter = readFileSync(".data/candidate-workflows.json", "utf8");
  const workflowStoreUnchanged =
    sha256(workflowRawAfter) === workflowHashBefore;
  const workflowsAfter = (JSON.parse(workflowRawAfter) as {
    workflows: Record<string, any>;
  }).workflows;
  const evaluatedWorkflowFieldsUnchanged = activeIds.every((candidateId) => {
    const before = workflows[candidateId] ?? {};
    const after = workflowsAfter[candidateId] ?? {};
    return (
      before.assignedDM === after.assignedDM &&
      before.assignedRecruiter === after.assignedRecruiter &&
      before.workflowStatus === after.workflowStatus &&
      before.paperworkStatus === after.paperworkStatus &&
      before.signatureRequestId === after.signatureRequestId
    );
  });
  const safety = {
    mode,
    previewOnly: mode === "preview",
    liveOperatorApprovalProvided:
      mode === "live" && authorization.approved,
    approvedBy: authorization.approvedBy,
    workflowWrites: mode === "live" ? summary.assigned : 0,
    workflowStageChanges: 0,
    paperworkSent: 0,
    dropboxWrites: 0,
    melWrites: 0,
    breezyWrites: 0,
    evaluatedWorkflowFieldsUnchanged,
    workflowsFileUnchanged: workflowStoreUnchanged,
    concurrentExternalWorkflowStoreActivityObserved:
      mode === "preview" && !workflowStoreUnchanged,
    ingestionFileUnchanged:
      sha256(readFileSync(".data/candidate-ingestion.json", "utf8")) ===
      ingestionHashBefore,
  };
  const generatedAt = new Date().toISOString();
  const publicDecisions = decisions.map((decision) => ({
    redactedCandidateId: sha256(decision.candidateId).slice(0, 12),
    currentAssignedDm: decision.currentAssignedDm,
    expectedAssignedDm: decision.expectedAssignedDm,
    positionId: decision.positionId,
    positionName: decision.positionName,
    positionStatus: decision.positionStatus,
    positionLocation: decision.positionLocation,
    market: decision.market,
    territory: decision.territory,
    reason: decision.reason,
    assignmentAction: decision.action,
  }));

  writeArtifact("p218-dm-assignment.json", {
    phase: "P218",
    generatedAt,
    mode,
    defaultMode: "preview",
    liveRequirements: [
      "--live",
      "--operator-approved",
      "--approved-by=<operator>",
    ],
    authority:
      "Applied Position ID → Breezy Position.Location → market/state → territory/state → existing getDmForState map",
    titleParsingUsed: false,
    decisions: publicDecisions,
    safety,
  });

  writeArtifact("p218-assignment-summary.json", {
    phase: "P218",
    generatedAt,
    mode,
    ...summary,
    catalog: {
      positionsLoaded: positionCatalog.size,
      errors: catalogErrors,
    },
    newlyEligibleAfterSimulatedAssignment: newlyEligible.length,
    paperworkCandidatesStillBlocked: stillBlocked.length,
    safety,
  });

  writeArtifact("p218-newly-eligible.json", {
    phase: "P218",
    generatedAt,
    simulationOnly: true,
    evidenceSource: "artifacts/p216-candidate-comparison.json",
    rule:
      "Remove blocked_dm_unassigned only when P218 would assign a unique DM; retain every other coverage and paperwork blocker.",
    newlyEligibleCount: newlyEligible.length,
    stillBlockedCount: stillBlocked.length,
    candidates: eligibilitySimulation,
    safety,
  });

  const reasonRows = Object.entries(summary.reasonDistribution)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `| ${reason} | ${count} |`);
  const report = [
    "# P218 — Automatic DM Assignment Engine Preview",
    "",
    `Generated: ${generatedAt} · Mode: **${mode.toUpperCase()}**.`,
    "",
    "## Assignment summary",
    "",
    "| Metric | Count |",
    "| --- | --- |",
    `| Candidates evaluated | ${summary.candidatesEvaluated} |`,
    `| Already assigned (never overwritten) | ${summary.alreadyAssigned} |`,
    `| Would receive assignedDM | ${summary.wouldAssign} |`,
    `| Unable to assign | ${summary.unableToAssign} |`,
    `| Actually assigned | ${summary.assigned} |`,
    `| Concurrent assignments skipped | ${summary.skippedRace} |`,
    "",
    "## Reason distribution",
    "",
    "| Reason | Count |",
    "| --- | --- |",
    ...reasonRows,
    "",
    "## Candidate audit",
    "",
    "| Candidate | Current DM | Expected DM | Position.Location | Market | Territory | Reason | Action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...publicDecisions.map(
      (decision) =>
        `| \`${decision.redactedCandidateId}\` | ${decision.currentAssignedDm} | ${
          decision.expectedAssignedDm ?? "—"
        } | ${
          decision.positionLocation
            ? `${decision.positionLocation.city}, ${decision.positionLocation.state}`
            : "—"
        } | ${decision.market ?? "—"} | ${decision.territory ?? "—"} | ${
          decision.reason
        } | ${decision.assignmentAction} |`,
    ),
    "",
    "## Simulated coverage and paperwork eligibility",
    "",
    `- Newly eligible after simulated DM assignment: ${newlyEligible.length}`,
    `- P216/P214 candidates still blocked after simulation: ${stillBlocked.length}`,
    ...eligibilitySimulation.map(
      (candidate) =>
        `- \`${candidate.redactedCandidateId}\`: ${candidate.coverageTier}, ${
          candidate.distanceMiles ?? "unknown"
        } miles → ${candidate.paperworkEligibilityAfterAssignment}; blockers after=[${
          candidate.blockersAfterSimulatedAssignment.join(", ") || "none"
        }]`,
    ),
    "",
    "## Safety",
    "",
    "- Position geography comes only from resolved Breezy Position.Location; job titles are never parsed.",
    "- Existing named DMs, manual assignments, inactive candidates, archived candidates, missing locations, unknown territories, and ambiguous DM mappings fail closed.",
    "- Live mode exists but requires `--live --operator-approved --approved-by=<operator>`.",
    `- This execution: previewOnly=${safety.previewOnly}, workflow writes=${safety.workflowWrites}, stage changes=0, paperwork sent=0, external writes=0.`,
    `- Evaluated workflow fields unchanged=${safety.evaluatedWorkflowFieldsUnchanged}; whole workflow store unchanged=${safety.workflowsFileUnchanged}; ingestion store unchanged=${safety.ingestionFileUnchanged}.`,
    "",
  ].join("\n");
  writeArtifact("p218-dm-assignment-preview.md", `${report}\n`);

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p218-dm-assignment-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        mode,
        authorization,
        decisions,
        inputs,
        eligibilitySimulation,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        mode,
        candidatesEvaluated: summary.candidatesEvaluated,
        alreadyAssigned: summary.alreadyAssigned,
        wouldAssign: summary.wouldAssign,
        unableToAssign: summary.unableToAssign,
        reasonDistribution: summary.reasonDistribution,
        newlyEligible: newlyEligible.length,
        stillBlocked: stillBlocked.length,
        testsRequired: 30,
        safety,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
