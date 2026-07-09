import { readFileSync } from "node:fs";
import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { evaluateP169CycleGates } from "@/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { discoverCandidate } from "@/lib/p170-unified-candidate-discovery/discover-candidate";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type {
  P1761CandidateRow,
  P1761PostAssignmentReport,
  P1761PatriciaIrbyValidation,
} from "@/lib/p176.1-post-assignment-paperwork-validation/types";
import { P1761_SOURCE_PHASE } from "@/lib/p176.1-post-assignment-paperwork-validation/types";
import type { P176CandidateSnapshot } from "@/lib/p176-recruiter-assignment-before-paperwork/types";

const P176_ARTIFACT = path.join(
  process.cwd(),
  "artifacts",
  "p176-recruiter-assignment-before-paperwork.json",
);

function displayName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
  return name || candidate.email || candidate.candidateId;
}

function pickNewest25(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return [...candidates]
    .sort((a, b) => (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate))
    .slice(0, 25);
}

function loadP176Baseline(): {
  beforeById: Map<string, P176CandidateSnapshot>;
  afterById: Map<string, P176CandidateSnapshot>;
  generatedAt: string | null;
  recruitersAssigned: number;
} {
  try {
    const raw = JSON.parse(readFileSync(P176_ARTIFACT, "utf8")) as {
      generatedAt?: string;
      summary?: { recruitersAssigned?: number };
      before?: P176CandidateSnapshot[];
      after?: P176CandidateSnapshot[];
    };
    return {
      beforeById: new Map((raw.before ?? []).map((r) => [r.candidateId, r])),
      afterById: new Map((raw.after ?? []).map((r) => [r.candidateId, r])),
      generatedAt: raw.generatedAt ?? null,
      recruitersAssigned: raw.summary?.recruitersAssigned ?? 0,
    };
  } catch {
    return {
      beforeById: new Map(),
      afterById: new Map(),
      generatedAt: null,
      recruitersAssigned: 0,
    };
  }
}

function evaluateP152(input: {
  candidate: BreezyCandidate;
  workflow: Awaited<ReturnType<typeof getCandidateWorkflowState>>[string] | undefined;
  auditEvents: Awaited<ReturnType<typeof loadDecisionCohort>>["auditEvents"];
  onboarding: ReturnType<typeof pickActiveOnboardingRecord>;
}) {
  const row = buildScoredWorkflowRow(input.candidate, input.workflow, { job: undefined });
  return detectImmediatePaperworkHardBlockers({
    row,
    candidate: input.candidate,
    onboarding: input.onboarding,
    auditEvents: input.auditEvents,
  });
}

export async function buildP1761PostAssignmentReport(): Promise<P1761PostAssignmentReport> {
  const generatedAt = new Date().toISOString();
  const baseline = loadP176Baseline();

  const [store, cohort, workflows, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    loadDecisionCohort(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
  ]);

  const newest25 = pickNewest25(listIngestedCandidates(store));
  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));
  const p169Config = resolveP169EnvConfig();
  const p169Gates = await evaluateP169CycleGates(p169Config);

  const newest25Rows: P1761CandidateRow[] = [];

  for (let i = 0; i < newest25.length; i += 1) {
    const candidate = newest25[i]!;
    const before = baseline.beforeById.get(candidate.candidateId);
    const p176After = baseline.afterById.get(candidate.candidateId);
    const workflow = workflows[candidate.candidateId];
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId);
    const p157 = decisionsById.get(candidate.candidateId) ?? null;
    const p152 = evaluateP152({ candidate, workflow, auditEvents: cohort.auditEvents, onboarding });

    const p157Before = before?.p157Recommendation ?? null;
    const p157After = p157?.action ?? null;
    const p169Outcome = p157
      ? mapP157ToP169Outcome(p157, p169Config.minimumConfidence, null).outcome
      : null;

    const readyForPaperwork =
      !p152.blocked &&
      p157After === "Send Paperwork" &&
      p169Outcome === "AUTO_SEND_PAPERWORK";

    newest25Rows.push({
      rank: i + 1,
      candidateId: candidate.candidateId,
      name: displayName(candidate),
      email: candidate.email?.trim() ?? "",
      appliedAt: candidate.appliedDate || candidate.addedDate,
      assignedRecruiter: workflow?.assignedRecruiter?.trim() || "Unassigned",
      p157Before,
      p157After,
      p157Confidence: p157?.confidence ?? null,
      p157ActionChanged: Boolean(p157Before && p157After && p157Before !== p157After),
      p152EligibleBefore: before?.paperworkEligible ?? false,
      p152EligibleAfter: !p152.blocked,
      p152BlockersAfter: p152.blockers,
      p169Outcome,
      readyForPaperwork,
      duplicateBlocked: p152.primaryHardBlocker === "duplicate_candidate",
      assignedInP176: p176After?.assignedInThisRun ?? false,
    });
  }

  const readyForPaperwork = newest25Rows
    .filter((r) => r.readyForPaperwork)
    .map((r) => ({
      candidateId: r.candidateId,
      name: r.name,
      email: r.email,
      recruiter: r.assignedRecruiter,
      p157Action: r.p157After!,
      p169Outcome: r.p169Outcome!,
    }));

  const stillBlocked = newest25Rows
    .filter((r) => !r.p152EligibleAfter || !r.readyForPaperwork)
    .map((r) => ({
      candidateId: r.candidateId,
      name: r.name,
      blockers:
        r.readyForPaperwork
          ? []
          : [
              ...r.p152BlockersAfter,
              ...(r.p157After !== "Send Paperwork" && r.p152EligibleAfter
                ? [`P157 action is ${r.p157After ?? "unknown"} (not Send Paperwork)`]
                : []),
            ].filter(Boolean),
    }))
    .filter((r) => r.blockers.length > 0);

  const patricia = newest25Rows.find((r) => /patricia irby/i.test(r.name));
  const patriciaWorkflow = patricia ? workflows[patricia.candidateId] : undefined;
  const patriciaP157 = patricia ? decisionsById.get(patricia.candidateId) : null;
  const patriciaP152 = patricia
    ? evaluateP152({
        candidate: newest25.find((c) => c.candidateId === patricia.candidateId)!,
        workflow: patriciaWorkflow,
        auditEvents: cohort.auditEvents,
        onboarding: pickActiveOnboardingRecord(onboardingRecords, patricia.candidateId),
      })
    : null;

  const patriciaIrby: P1761PatriciaIrbyValidation = {
    assignedToLogan: patricia?.assignedRecruiter === "Logan",
    assignedRecruiter: patricia?.assignedRecruiter ?? "—",
    p170Discoverable: Boolean(
      patricia && findInIngestionStore(store, parseP170SearchQuery("Irby")),
    ),
    p157Evaluated: Boolean(patriciaP157),
    p157Action: patriciaP157?.action ?? null,
    p152PaperworkEligible: patriciaP152 ? !patriciaP152.blocked : false,
    readyForSend:
      Boolean(patriciaP157?.action === "Send Paperwork" && patriciaP152 && !patriciaP152.blocked),
    blockers: patriciaP152?.blockers ?? ["Patricia Irby not found in newest 25."],
  };

  if (patriciaIrby.p152PaperworkEligible && patriciaIrby.p157Action !== "Send Paperwork") {
    patriciaIrby.blockers.push(
      `P157 recommends ${patriciaIrby.p157Action ?? "unknown"} — not Send Paperwork yet.`,
    );
  }

  const projectedDropboxApiCalls = readyForPaperwork.length;
  const dropboxProjection = projectDropboxUsage(projectedDropboxApiCalls);

  const controlledReasons: string[] = [];
  if (!p169Gates.pass) controlledReasons.push(...p169Gates.blockingFactors);
  if (readyForPaperwork.length === 0) {
    controlledReasons.push("No newest-25 candidates are fully ready (P157 Send Paperwork + P152 eligible).");
  }
  if (newest25Rows.some((r) => r.duplicateBlocked && r.p152EligibleAfter)) {
    controlledReasons.push("Duplicate-blocked candidate incorrectly marked P152 eligible.");
  }

  const controlledOperatorSendSafe =
    p169Gates.pass && readyForPaperwork.length > 0 && controlledReasons.length === 0;

  const p157AssignRecruiterBefore = newest25Rows.filter(
    (r) => r.p157Before === "Assign Recruiter",
  ).length;
  const p157SendPaperworkAfter = newest25Rows.filter((r) => r.p157After === "Send Paperwork").length;

  let conclusion: string;
  if (controlledOperatorSendSafe) {
    conclusion = `${readyForPaperwork.length} candidates are ready for controlled paperwork send. Production gates pass.`;
  } else if (readyForPaperwork.length > 0) {
    conclusion = `${readyForPaperwork.length} candidates are paperwork-ready at P157/P152, but controlled operator send is blocked by production gates.`;
  } else {
    conclusion =
      "P176 assignments improved P152 eligibility, but P157 has not yet moved assigned candidates to Send Paperwork — additional review gates remain.";
  }

  return {
    sourcePhase: P1761_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    p176Baseline: {
      artifactPath: P176_ARTIFACT,
      generatedAt: baseline.generatedAt,
      recruitersAssigned: baseline.recruitersAssigned,
    },
    summary: {
      newest25Count: newest25Rows.length,
      p157AssignRecruiterBefore,
      p157SendPaperworkAfter,
      p157ActionChangedCount: newest25Rows.filter((r) => r.p157ActionChanged).length,
      p152EligibleBefore: newest25Rows.filter((r) => r.p152EligibleBefore).length,
      p152EligibleAfter: newest25Rows.filter((r) => r.p152EligibleAfter).length,
      readyForPaperworkCount: readyForPaperwork.length,
      stillBlockedCount: stillBlocked.length,
      duplicateBlockedCount: newest25Rows.filter((r) => r.duplicateBlocked).length,
      projectedDropboxApiCalls: dropboxProjection.totalRequests,
      dropboxWithinBudget: dropboxProjection.withinBudget,
      controlledOperatorSendSafe,
    },
    newest25: newest25Rows,
    readyForPaperwork,
    stillBlocked,
    patriciaIrby,
    controlledOperatorSendCycle: {
      safe: controlledOperatorSendSafe,
      reasons: controlledReasons,
      p169GatesPass: p169Gates.pass,
      p169BlockingFactors: p169Gates.blockingFactors,
    },
    conclusion,
  };
}
