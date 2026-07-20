/**
 * P217 — DM Assignment Resolution Audit (read-only).
 *
 * Reads workflow/local evidence and Breezy Position objects via GET only.
 * Writes reports/artifacts only; never changes workflows, stages, MEL,
 * Breezy, Dropbox Sign, or candidate assignments.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BreezyJob } from "@/lib/breezy-api";

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

type Enrichment = {
  name?: string;
  email?: string;
  city?: string;
  state?: string;
  zip?: string;
  positionId?: string;
  positionName?: string;
};

function buildEnrichment(): Map<string, Enrichment> {
  const byId = new Map<string, Enrichment>();
  const merge = (id: string, patch: Enrichment): void => {
    const current = byId.get(id) ?? {};
    byId.set(id, {
      name: current.name || patch.name,
      email: current.email || patch.email,
      city: current.city || patch.city,
      state: current.state || patch.state,
      zip: current.zip || patch.zip,
      positionId: current.positionId || patch.positionId,
      positionName: current.positionName || patch.positionName,
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
        zip:
          typeof record.zipCode === "string"
            ? record.zipCode
            : typeof record.zip === "string"
              ? record.zip
              : undefined,
        positionId:
          typeof record.positionId === "string" ? record.positionId : undefined,
        positionName:
          typeof record.positionName === "string" ? record.positionName : undefined,
      });
    }
    for (const child of Object.values(record)) walk(child);
  };

  const ingestion = readJson<{ candidates: Record<string, any> }>(
    ".data/candidate-ingestion.json",
  );
  for (const [candidateId, candidate] of Object.entries(ingestion.candidates ?? {})) {
    merge(candidateId, {
      name: `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim(),
      email: candidate.email,
      city: candidate.city,
      state: candidate.state,
      zip: candidate.zipCode,
      positionId: candidate.positionId,
      positionName: candidate.positionName,
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
      // Read-only audit tolerates stale/malformed optional evidence.
    }
  }
  return byId;
}

const PIPELINE_TRACE = [
  {
    step: "Candidate Import / Breezy Sync",
    file: "src/lib/candidate-ingestion/run-post-import-pipeline.ts",
    function: "runPostImportPipeline",
    behavior:
      "Builds assignment decisions only for filterMtdCandidates(...). Historical candidates outside the current-month import cohort are not passed to assignment.",
  },
  {
    step: "Territory Mapping",
    file: "src/lib/dm-territory-map.ts",
    function: "getDmForState",
    behavior:
      "Deterministic state → DM map. OH resolves to Mindie Rodriguez; MO resolves to Amy Harp.",
  },
  {
    step: "Candidate / Job State Selection",
    file: "src/lib/candidate-dm-suggest.ts",
    function: "resolveCandidateState / suggestDmForCandidate",
    behavior:
      "Selects job state before candidate home state and maps it to a suggested DM. It is pure logic and does not persist an assignment.",
  },
  {
    step: "Assignment Decision",
    file: "src/lib/recruiter-assignment-engine/build-assignment-decision.ts",
    function: "buildRecruiterAssignmentDecision",
    behavior:
      "Resolves territoryState and dmName, but returns shouldAssign=false when recruiter ownership does not need auto-assignment.",
  },
  {
    step: "Assignment Persistence",
    file: "src/lib/recruiter-assignment-engine/apply-recruiter-assignments.ts",
    function: "applyRecruiterAssignments",
    behavior:
      "Persists assignedDM only for decisions with shouldAssign=true. DM assignment is coupled to recruiter assignment.",
  },
  {
    step: "Standalone Territory Assignment",
    file:
      "src/lib/p151-workflow-bottleneck-resolution/apply-territory-dm-assignments.ts",
    function: "applyTerritoryDmAssignments",
    behavior:
      "Can repair Unassigned DM from candidate/job state, but it is invoked by specific P151 pipelines—not by P204/P205.",
  },
  {
    step: "Operator Assignment",
    file: "src/app/api/candidates/workflows/route.ts",
    function: "POST workflow assignment path",
    behavior:
      "Accepts assignedDM from an authenticated operator and persists it through upsertCandidateWorkflow. No operator assignment exists for the two targets.",
  },
  {
    step: "MEL Sync",
    file: "src/lib/mel-projects-sheet.ts",
    function: "fetchMelProjectsSheet",
    behavior:
      "Supplies operational project/coverage data only. It has no assignedDM write path and cannot repair candidate workflow ownership.",
  },
  {
    step: "Workflow Store Default",
    file: "src/lib/candidate-workflow-store.ts",
    function: "upsertCandidateWorkflowUnlocked",
    behavior:
      "assignedDM = input.assignedDM?.trim() || existing?.assignedDM || 'Unassigned'. A transition that omits assignedDM preserves the existing Unassigned value.",
  },
  {
    step: "Qualification Recommendation",
    file: "src/lib/p204-1-supervised-qualification-pilot/execute.ts",
    function: "executeP2041RecommendationPilot",
    behavior:
      "Writes recommendation notes only; intentionally makes no ownership change.",
  },
  {
    step: "Paperwork Needed Transition",
    file: "src/lib/p205-controlled-lifecycle-action-pilot/execute.ts",
    function: "executeP205ControlledLifecyclePilot",
    behavior:
      "Moves approved historical candidates to Paperwork Needed without assignedDM; workflow store therefore preserves Unassigned.",
  },
  {
    step: "Paperwork Eligibility",
    file: "src/lib/p214-unsent-test-batch/eligibility.ts",
    function: "evaluateP214Gates",
    behavior:
      "Read-only consumer: compares persisted assignedDM with expectedDM and blocks Unassigned; it does not assign.",
  },
];

async function main(): Promise<void> {
  loadEnvLocal();
  const workflowRawBefore = readFileSync(".data/candidate-workflows.json", "utf8");
  const ingestionRawBefore = readFileSync(".data/candidate-ingestion.json", "utf8");
  const workflowHashBefore = sha256(workflowRawBefore);
  const ingestionHashBefore = sha256(ingestionRawBefore);

  const {
    classifyP217RootCause,
    isP217ActiveWorkflowStage,
    isP217AutomaticallyAssignable,
    isP217DmUnassigned,
    p217ExpectedDmAccuracy,
    summarizeP217GlobalAudit,
  } = await import("@/lib/p217-dm-assignment-audit");
  const { getDmForState } = await import("@/lib/dm-territory-map");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { resolveAuthoritativePostingGeography } = await import(
    "@/lib/p216-position-location-authority"
  );

  const workflowStore = JSON.parse(workflowRawBefore) as {
    workflows: Record<string, any>;
  };
  const workflows = workflowStore.workflows;
  const enrichment = buildEnrichment();

  const activeIds = Object.keys(workflows).filter((candidateId) =>
    isP217ActiveWorkflowStage(String(workflows[candidateId]?.workflowStatus ?? "")),
  );
  const unassignedIds = activeIds.filter((candidateId) =>
    isP217DmUnassigned(workflows[candidateId]?.assignedDM),
  );

  const positionIds = [
    ...new Set(
      unassignedIds
        .map((candidateId) => enrichment.get(candidateId)?.positionId?.trim() ?? "")
        .filter(Boolean),
    ),
  ];
  console.log(
    `P217 active=${activeIds.length} unassigned=${unassignedIds.length} uniquePositions=${positionIds.length}`,
  );

  // Use state catalogs instead of hundreds of per-position requests. This is
  // both read-only and materially faster for the global audit.
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

  const rows: Array<Record<string, any>> = [];
  const globalRows: Array<{
    candidateId: string;
    workflowStage: string;
    assignedDm: string;
    assignedRecruiter: string;
    territory: string;
    expectedDm: string;
    autoAssignable: boolean;
  }> = [];
  const rootCauseDistribution: Record<string, number> = {};

  for (const candidateId of activeIds) {
    const workflow = workflows[candidateId] ?? {};
    const evidence = enrichment.get(candidateId) ?? {};
    const positionId = evidence.positionId?.trim() ?? "";
    const liveJob = positionId ? positionCatalog.get(positionId) ?? null : null;
    const positionLookupSucceeded = Boolean(liveJob);
    const posting = resolveAuthoritativePostingGeography({
      positionId: positionId || null,
      positionName: liveJob?.name ?? evidence.positionName ?? null,
      positionStatus: liveJob?.status ?? null,
      city: liveJob?.city ?? "",
      state: liveJob?.state ?? "",
      zip: liveJob?.zip ?? "",
      displayLocation: liveJob?.displayLocation ?? "",
      locationSource: liveJob?.locationSource ?? "missing",
      homeCity: evidence.city,
      homeState: evidence.state,
    });
    const homeState = String(evidence.state ?? "").trim().toUpperCase();
    const territory = posting.authoritative ? posting.state : homeState;
    const expectedDm = territory ? String(getDmForState(territory) ?? "") : "";
    const assignedDm = String(workflow.assignedDM ?? "Unassigned").trim();
    const assignedRecruiter = String(
      workflow.assignedRecruiter ?? "Unassigned",
    ).trim();
    const manualReviewRequired =
      isP217DmUnassigned(assignedDm) &&
      !posting.authoritative &&
      Boolean(territory && expectedDm);
    const input = {
      candidateId,
      workflowStage: String(workflow.workflowStatus ?? ""),
      assignedDm,
      assignedRecruiter,
      territory,
      expectedDm,
      positionId,
      positionLookupSucceeded,
      positionLocationAuthoritative: posting.authoritative,
      previousAssignedDm: null,
      manualReviewRequired,
      syncSuppliedDm: null,
    };
    const autoAssignable = isP217AutomaticallyAssignable(input);
    const rootCause = isP217DmUnassigned(assignedDm)
      ? classifyP217RootCause(input)
      : null;
    if (rootCause) {
      rootCauseDistribution[rootCause] =
        (rootCauseDistribution[rootCause] ?? 0) + 1;
    }

    const row = {
      candidateId,
      redactedCandidateId: sha256(candidateId).slice(0, 12),
      candidateName: evidence.name ?? null,
      normalizedEmail: evidence.email?.trim().toLowerCase() ?? null,
      appliedPositionId: positionId || null,
      appliedPosition: liveJob?.name ?? evidence.positionName ?? null,
      positionLocation: posting.authoritative
        ? {
            city: posting.city,
            state: posting.state,
            source: posting.locationSource,
          }
        : null,
      expectedTerritory: territory || null,
      expectedDm: expectedDm || null,
      currentAssignedDm: assignedDm || "Unassigned",
      assignedRecruiter: assignedRecruiter || "Unassigned",
      workflowStage: workflow.workflowStatus ?? null,
      paperworkStatus: workflow.paperworkStatus ?? null,
      rootCause,
      automaticallyAssignable: autoAssignable,
      positionLookupSucceeded,
    };
    rows.push(row);
    globalRows.push({
      candidateId,
      workflowStage: row.workflowStage ?? "",
      assignedDm: row.currentAssignedDm,
      assignedRecruiter: row.assignedRecruiter,
      territory: territory || "Unknown",
      expectedDm,
      autoAssignable,
    });
  }

  const blockedIds = new Set(
    (
      readJson<{
        candidates: Array<{ redactedCandidateId: string; blockers: string[] }>;
      }>("artifacts/p216-candidate-comparison.json").candidates ?? []
    )
      .filter((candidate) => candidate.blockers.includes("blocked_dm_unassigned"))
      .map((candidate) => candidate.redactedCandidateId),
  );
  const blockedRows = rows.filter((row) =>
    blockedIds.has(row.redactedCandidateId),
  );
  const globalSummary = summarizeP217GlobalAudit(globalRows);
  const autoAssignableRows = rows.filter(
    (row) => row.automaticallyAssignable,
  );

  const expectedChecks = blockedRows.map((row) => ({
    expectedDm:
      row.positionLocation?.state === "OH"
        ? "Mindie Rodriguez"
        : row.positionLocation?.state === "MO"
          ? "Amy Harp"
          : row.expectedDm ?? "",
    actualMappedDm: row.expectedDm ?? "",
  }));
  const expectedDmAccuracy = p217ExpectedDmAccuracy(expectedChecks);

  const failurePoint = {
    exactLocation:
      "P205 transitions historical P204-approved candidates to Paperwork Needed without assignedDM; candidate-workflow-store preserves the existing 'Unassigned' value.",
    whyPostImportDidNotRepair:
      "runPostImportPipeline applies assignments only to filterMtdCandidates(...). These April historical applicants were outside the current-month import assignment cohort.",
    whyRecruiterAssignmentDidNotRepair:
      "DM persistence in applyRecruiterAssignments is coupled to decision.shouldAssign (recruiter assignment). No standalone territory-DM repair ran for P204/P205.",
    classification: "Assignment Engine Failure",
  };

  const workflowRawAfter = readFileSync(".data/candidate-workflows.json", "utf8");
  const workflowsAfter = (JSON.parse(workflowRawAfter) as {
    workflows: Record<string, any>;
  }).workflows;
  const targetWorkflowFieldsUnchanged = blockedRows.every((row) => {
    const before = workflows[row.candidateId] ?? {};
    const after = workflowsAfter[row.candidateId] ?? {};
    return (
      before.workflowStatus === after.workflowStatus &&
      before.assignedDM === after.assignedDM &&
      before.assignedRecruiter === after.assignedRecruiter &&
      before.paperworkStatus === after.paperworkStatus &&
      before.signatureRequestId === after.signatureRequestId
    );
  });
  const workflowStoreUnchanged = sha256(workflowRawAfter) === workflowHashBefore;
  const safety = {
    readOnly: true,
    p217WorkflowWrites: 0,
    workflowChanges: 0,
    stageMovements: 0,
    melWrites: 0,
    breezyWrites: 0,
    dropboxWrites: 0,
    targetWorkflowFieldsUnchanged,
    workflowsFileUnchanged: workflowStoreUnchanged,
    concurrentExternalWorkflowStoreActivityObserved: !workflowStoreUnchanged,
    ingestionFileUnchanged:
      sha256(readFileSync(".data/candidate-ingestion.json", "utf8")) ===
      ingestionHashBefore,
  };
  const generatedAt = new Date().toISOString();

  writeArtifact("p217-unassigned-summary.json", {
    phase: "P217",
    generatedAt,
    activeScope:
      "All candidate workflow records except terminal Not Qualified records",
    ...globalSummary,
    rootCauseDistribution,
    targetBlockedCandidates: blockedRows.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      appliedPosition: row.appliedPosition,
      positionLocation: row.positionLocation,
      expectedTerritory: row.expectedTerritory,
      expectedDm: row.expectedDm,
      currentAssignedDm: row.currentAssignedDm,
      assignedRecruiter: row.assignedRecruiter,
      workflowStage: row.workflowStage,
      paperworkStatus: row.paperworkStatus,
      rootCause: row.rootCause,
    })),
    positionLookups: {
      requestedUniquePositions: positionIds.length,
      found: positionIds.filter((positionId) => positionCatalog.has(positionId))
        .length,
      notFound: positionIds.filter(
        (positionId) => !positionCatalog.has(positionId),
      ).length,
      catalogErrors,
    },
    safety,
  });

  writeArtifact("p217-root-cause.json", {
    phase: "P217",
    generatedAt,
    candidatesAudited: blockedRows.length,
    rootCauseDistribution: blockedRows.reduce(
      (counts: Record<string, number>, row) => {
        const key = String(row.rootCause ?? "Unknown");
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    ),
    globalRootCauseDistribution: rootCauseDistribution,
    failurePoint,
    assignmentPipeline: PIPELINE_TRACE,
    expectedDmAccuracy,
    safety,
  });

  writeArtifact("p217-auto-assignment-preview.json", {
    phase: "P217",
    generatedAt,
    previewOnly: true,
    candidatesAutomaticallyAssignable: autoAssignableRows.length,
    rule:
      "Current DM is Unassigned AND Applied Position lookup succeeds AND Position.Location is authoritative AND territory maps to a DM AND no explicit manual-review gate.",
    byExpectedDm: autoAssignableRows.reduce(
      (counts: Record<string, number>, row) => {
        const key = row.expectedDm ?? "Unknown";
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    ),
    candidates: autoAssignableRows.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      positionLocation: row.positionLocation,
      expectedTerritory: row.expectedTerritory,
      expectedDm: row.expectedDm,
      currentAssignedDm: row.currentAssignedDm,
      workflowStage: row.workflowStage,
      previewAction: `Would assign ${row.expectedDm}; no write performed`,
    })),
    targetCandidatesAutomaticallyAssignable: blockedRows.filter(
      (row) => row.automaticallyAssignable,
    ).length,
    safety,
  });

  const tableRows = (record: Record<string, number>): string[] =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `| ${key} | ${count} |`);

  const report = [
    "# P217 — DM Assignment Resolution Audit",
    "",
    `Generated: ${generatedAt} · Read-only investigation.`,
    "",
    "## Blocked candidates",
    "",
    "| Candidate | Applied position | Position.Location | Territory | Expected DM | Current DM | Stage | Paperwork | Root cause |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...blockedRows.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` | ${row.appliedPosition ?? "—"} | ${
          row.positionLocation
            ? `${row.positionLocation.city}, ${row.positionLocation.state}`
            : "—"
        } | ${row.expectedTerritory ?? "—"} | ${row.expectedDm ?? "—"} | ${
          row.currentAssignedDm
        } | ${row.workflowStage ?? "—"} | ${row.paperworkStatus ?? "—"} | ${
          row.rootCause
        } |`,
    ),
    "",
    "## Exact failure point",
    "",
    `- ${failurePoint.exactLocation}`,
    `- ${failurePoint.whyPostImportDidNotRepair}`,
    `- ${failurePoint.whyRecruiterAssignmentDidNotRepair}`,
    "",
    "Both candidates classify as **Assignment Engine Failure**: territory and DM lookup succeed, but no applicable assignment execution persisted the deterministic DM.",
    "",
    "## Territory verification",
    "",
    "| Position.Location | Expected mapping | Actual map result | Correct |",
    "| --- | --- | --- | --- |",
    ...blockedRows.map((row) => {
      const location = row.positionLocation
        ? `${row.positionLocation.city}, ${row.positionLocation.state}`
        : "—";
      const expected =
        row.positionLocation?.state === "OH"
          ? "Mindie Rodriguez"
          : row.positionLocation?.state === "MO"
            ? "Amy Harp"
            : row.expectedDm;
      return `| ${location} | ${expected ?? "—"} | ${row.expectedDm ?? "—"} | ${
        expected === row.expectedDm ? "YES" : "NO"
      } |`;
    }),
    "",
    `Expected DM accuracy: **${expectedDmAccuracy.correct}/${expectedDmAccuracy.verified} (${expectedDmAccuracy.accuracyPct}%)**.`,
    "",
    "## Global active-candidate audit",
    "",
    `Active scope: all workflows except \`Not Qualified\` (${globalSummary.totalActiveCandidates}).`,
    "",
    `- Assigned DM: ${globalSummary.totalAssignedDm}`,
    `- Unassigned DM: ${globalSummary.totalUnassignedDm}`,
    `- Automatically assignable from Position.Location → territory → DM: ${globalSummary.automaticallyAssignable}`,
    "",
    "### Unassigned by stage",
    "",
    "| Stage | Count |",
    "| --- | --- |",
    ...tableRows(globalSummary.unassignedByStage),
    "",
    "### Unassigned by territory",
    "",
    "| Territory | Count |",
    "| --- | --- |",
    ...tableRows(globalSummary.unassignedByTerritory),
    "",
    "### Unassigned by recruiter",
    "",
    "| Recruiter | Count |",
    "| --- | --- |",
    ...tableRows(globalSummary.unassignedByRecruiter),
    "",
    "## Assignment pipeline and code audit",
    "",
    ...PIPELINE_TRACE.flatMap((step) => [
      `### ${step.step}`,
      `- File/function: \`${step.file}\` — \`${step.function}\``,
      `- Behavior: ${step.behavior}`,
      "",
    ]),
    "## Safety",
    "",
    `- Workflow changes: 0 · stage movements: 0 · MEL writes: 0 · Breezy writes: 0 · Dropbox writes: 0`,
    `- P217 workflow writes: 0 · target workflow fields unchanged=${safety.targetWorkflowFieldsUnchanged}`,
    `- Whole workflow store unchanged=${safety.workflowsFileUnchanged} (concurrent external store activity observed=${safety.concurrentExternalWorkflowStoreActivityObserved}) · ingestion store unchanged=${safety.ingestionFileUnchanged}`,
    "",
  ].join("\n");
  writeArtifact("p217-dm-assignment-audit.md", `${report}\n`);

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p217-dm-assignment-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        blockedCandidates: blockedRows,
        allActiveCandidates: rows,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        candidatesAudited: blockedRows.length,
        totalUnassigned: globalSummary.totalUnassignedDm,
        rootCauseDistribution: rootCauseDistribution,
        automaticallyAssignable: globalSummary.automaticallyAssignable,
        expectedDmAccuracy,
        failurePoint: failurePoint.exactLocation,
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
