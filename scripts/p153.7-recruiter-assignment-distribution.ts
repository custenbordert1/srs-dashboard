/**
 * P153.7 — Recruiter assignment distribution validation (dry run only)
 *
 * Usage: npx tsx scripts/p153.7-recruiter-assignment-distribution.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import {
  buildLegacyRecruiterAssignmentDecision,
  buildRecruiterAssignmentDecision,
  buildRecruiterAssignmentDecisions,
  RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
} from "@/lib/recruiter-assignment-engine";
import {
  CANONICAL_RECRUITER_ROSTER,
  explainRecruiterEligibility,
  mergeRecruiterRoster,
  RECRUITERS_BY_DM,
} from "@/lib/recruiter-assignment-engine/recruiter-territory-eligibility";

const SESSION = {
  userId: "p153.7-distribution",
  email: "p153.7@local",
  name: "P153.7 Distribution",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

type ConfidenceBucket = "90-100" | "80-89" | "70-79" | "60-69" | "50-59" | "below-50";

function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence >= 90) return "90-100";
  if (confidence >= 80) return "80-89";
  if (confidence >= 70) return "70-79";
  if (confidence >= 60) return "60-69";
  if (confidence >= 50) return "50-59";
  return "below-50";
}

function emptyBuckets(): Record<ConfidenceBucket, number> {
  return { "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "50-59": 0, "below-50": 0 };
}

function countDistribution(labels: string[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const label of labels) {
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function formatMarkdown(report: Record<string, unknown>): string {
  const s = report.summary as Record<string, number>;
  const dist = report.confidenceDistribution as Record<string, number>;
  const before = report.before as { recruiterDistribution: { label: string; count: number }[] };
  const after = report.after as {
    recruiterDistribution: { label: string; count: number }[];
    dmDistribution: { label: string; count: number }[];
    assignmentsByState: { state: string; count: number }[];
    assignmentsByTerritory: { territory: string; count: number }[];
  };
  const topManual = (report.topManualReviewReasons as { reason: string; count: number }[]) ?? [];
  const investigation = report.investigation as { storedRoster: string[]; effectiveRoster: string[] };
  const lines = [
    "# P153.7 — Recruiter Assignment Distribution Fix",
    "",
    `Generated: ${report.generatedAt}`,
    "Dry run only — no workflow or Breezy writes.",
    "",
    "## Root cause",
    "",
    String(report.rootCause),
    "",
    "### Investigation",
    "",
    `- Stored roster: ${investigation.storedRoster.join(", ")}`,
    `- Effective roster (after merge): ${investigation.effectiveRoster.length} recruiters`,
    `- Production threshold: **${report.threshold}%** (unchanged)`,
    "",
    "## Summary",
    "",
    `- Candidates evaluated: **${s.candidatesEvaluated}**`,
    `- Eligible unassigned pool: **${s.eligibleUnassignedPool}**`,
    `- Threshold-qualified before (legacy, Taylor-only structural): **${s.thresholdQualifiedBefore}** (${s.taylorShareBeforePct}% Taylor)`,
    `- Threshold-qualified with current ownership (legacy): **${s.thresholdQualifiedWithCurrentOwnership}**`,
    `- Threshold-qualified after (fixed): **${s.thresholdQualifiedAfter}** (${s.taylorShareAfterPct}% Taylor)`,
    `- Unique recruiters before: **${s.uniqueRecruitersBefore}** → after: **${s.uniqueRecruitersAfter}**`,
    `- Still Manual Review after fix: **${s.stillManualReviewAfter}**`,
    "",
    "## Before vs after recruiter distribution",
    "",
    "| Recruiter | Before | After |",
    "|-----------|--------|-------|",
  ];

  const recruiters = new Set([
    ...before.recruiterDistribution.map((r) => r.label),
    ...after.recruiterDistribution.map((r) => r.label),
  ]);
  const beforeMap = new Map(before.recruiterDistribution.map((r) => [r.label, r.count]));
  const afterMap = new Map(after.recruiterDistribution.map((r) => [r.label, r.count]));
  for (const recruiter of [...recruiters].sort()) {
    lines.push(`| ${recruiter} | ${beforeMap.get(recruiter) ?? 0} | ${afterMap.get(recruiter) ?? 0} |`);
  }

  lines.push("", "## DM distribution (after fix)", "", "| DM | Count |", "|----|-------|");
  for (const row of after.dmDistribution) {
    lines.push(`| ${row.label} | ${row.count} |`);
  }

  lines.push("", "## Assignments by state (after fix)", "", "| State | Count |", "|-------|-------|");
  for (const row of after.assignmentsByState.slice(0, 15)) {
    lines.push(`| ${row.state} | ${row.count} |`);
  }

  lines.push(
    "",
    "## Confidence distribution (threshold-qualified)",
    "",
    `| Bucket | Count |`,
    `|--------|-------|`,
    `| 90–100 | ${dist["90-100"]} |`,
    `| 80–89 | ${dist["80-89"]} |`,
    `| 70–79 | ${dist["70-79"]} |`,
    `| 60–69 | ${dist["60-69"]} |`,
    `| 50–59 | ${dist["50-59"]} |`,
    `| Below 50 | ${dist["below-50"]} |`,
    "",
    "## Top Manual Review reasons (after fix)",
    "",
  );
  if (topManual.length === 0) {
    lines.push("_None_");
  } else {
    lines.push("| Reason | Count |", "|--------|-------|");
    for (const row of topManual) {
      lines.push(`| ${row.reason} | ${row.count} |`);
    }
  }

  lines.push(
    "",
    "## Recommendation",
    "",
    String(report.recommendation),
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);

  const [candidatesResult, jobsResult, bundle, onboardingRecords] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "fast" }),
    fetchBreezyJobs("published"),
    getCandidateWorkflowBundle(),
    listAllCandidateOnboardingRecords().catch(() => []),
  ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(SESSION, candidatesResult.candidates)
    : [];
  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const workflows = bundle.workflows;
  const rosters = { ...bundle.rosters, recruiters: mergeRecruiterRoster(bundle.rosters.recruiters) };

  const ownership = new Map<string, { total: number; byState: Map<string, number> }>();
  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter?.trim();
    if (!recruiter || isUnassignedRecruiter(recruiter)) continue;
    const bucket = ownership.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    ownership.set(recruiter, bucket);
  }

  const beforeRecruiters: string[] = [];
  const beforeStructuralRecruiters: string[] = [];
  const afterRecruiters: string[] = [];
  const beforeDms: string[] = [];
  const afterDms: string[] = [];
  const byState: Record<string, number> = {};
  const byTerritory: Record<string, number> = {};
  const confidenceDistribution = emptyBuckets();
  const manualReviewReasons = new Map<string, number>();
  const recruiterEligibilityAudit: Array<Record<string, unknown>> = [];
  let eligiblePool = 0;
  let thresholdBefore = 0;
  let thresholdBeforeStructural = 0;
  let thresholdAfter = 0;
  let stillManualReview = 0;

  for (const candidate of candidates) {
    const workflow = workflows[candidate.candidateId];
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    if (!isUnassignedRecruiter(row.assignedRecruiter)) continue;

    const legacy = buildLegacyRecruiterAssignmentDecision({
      candidate,
      workflow,
      jobState: jobsByPositionId.get(candidate.positionId ?? "")?.state,
      rosters: bundle.rosters,
      ownership,
    });
    const legacyStructural = buildLegacyRecruiterAssignmentDecision({
      candidate,
      workflow,
      jobState: jobsByPositionId.get(candidate.positionId ?? "")?.state,
      rosters: bundle.rosters,
      ownership: new Map(),
    });
    const fixed = buildRecruiterAssignmentDecision({
      candidate,
      workflow,
      jobState: jobsByPositionId.get(candidate.positionId ?? "")?.state,
      rosters,
      ownership,
    });

    if (!fixed.territoryState) continue;
    eligiblePool += 1;

    if (legacy.shouldAssign) {
      thresholdBefore += 1;
      beforeRecruiters.push(legacy.recruiter);
      if (legacy.dmName) beforeDms.push(legacy.dmName);
    }
    if (legacyStructural.shouldAssign) {
      thresholdBeforeStructural += 1;
      beforeStructuralRecruiters.push(legacyStructural.recruiter);
    }
    if (fixed.shouldAssign) {
      thresholdAfter += 1;
      afterRecruiters.push(fixed.recruiter);
      if (fixed.dmName) afterDms.push(fixed.dmName);
      confidenceDistribution[confidenceBucket(fixed.confidence)] += 1;
      byState[fixed.territoryState] = (byState[fixed.territoryState] ?? 0) + 1;
      byTerritory[fixed.territoryState] = (byTerritory[fixed.territoryState] ?? 0) + 1;
    }

    const evalAfter = evaluateRecruiterAssignmentCandidate({
      row,
      candidate,
      assignment: fixed,
      jobsByPositionId,
      publishedJobs,
      onboarding: onboardingByCandidate.get(candidate.candidateId) ?? null,
      referenceMs,
    });
    if (evalAfter.recommendation === "Manual Review") {
      stillManualReview += 1;
      manualReviewReasons.set(evalAfter.reason, (manualReviewReasons.get(evalAfter.reason) ?? 0) + 1);
    }

    if (candidate.candidateId === "705cdc0e7f30" || legacyStructural.recruiter !== fixed.recruiter) {
      recruiterEligibilityAudit.push({
        candidateId: candidate.candidateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(),
        territoryState: fixed.territoryState,
        before: {
          recruiter: legacyStructural.recruiter,
          confidence: legacyStructural.confidence,
          shouldAssign: legacyStructural.shouldAssign,
        },
        after: { recruiter: fixed.recruiter, confidence: fixed.confidence, shouldAssign: fixed.shouldAssign },
        eligibility: explainRecruiterEligibility({
          territoryState: fixed.territoryState,
          rosterRecruiters: rosters.recruiters,
        }),
        p151Recommendation: evalAfter.recommendation,
        p151Reason: evalAfter.reason,
      });
    }
  }

  const pilotAudit = recruiterEligibilityAudit.find((row) => row.candidateId === "705cdc0e7f30");
  const beforeDist = countDistribution(beforeStructuralRecruiters);
  const afterDist = countDistribution(afterRecruiters);
  const taylorBeforePct =
    thresholdBeforeStructural > 0
      ? Math.round(((beforeDist.find((r) => r.label === "Taylor")?.count ?? 0) / thresholdBeforeStructural) * 100)
      : 0;
  const taylorAfterPct =
    thresholdAfter > 0 ? Math.round(((afterDist.find((r) => r.label === "Taylor")?.count ?? 0) / thresholdAfter) * 100) : 0;
  const uniqueRecruitersAfter = afterDist.length;

  const report = {
    sourcePhase: "P153.7",
    generatedAt,
    dryRun: true,
    threshold: RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
    rootCause:
      "Legacy engine used a single-recruiter effective pool (stored roster only had Taylor) and global tie-breaking favored the lowest-workload recruiter globally, collapsing 100% of assignments to Taylor. Fixed engine uses DM-aligned territory recruiter pools and deterministic tie-breaks within each territory.",
    investigation: {
      storedRoster: bundle.rosters.recruiters,
      effectiveRoster: rosters.recruiters,
      canonicalRecruiters: CANONICAL_RECRUITER_ROSTER,
      recruitersByDm: RECRUITERS_BY_DM,
    },
    summary: {
      candidatesEvaluated: candidates.length,
      eligibleUnassignedPool: eligiblePool,
      thresholdQualifiedBefore: thresholdBeforeStructural,
      thresholdQualifiedWithCurrentOwnership: thresholdBefore,
      thresholdQualifiedAfter: thresholdAfter,
      stillManualReviewAfter: stillManualReview,
      taylorShareBeforePct: taylorBeforePct,
      taylorShareAfterPct: taylorAfterPct,
      uniqueRecruitersBefore: beforeDist.length,
      uniqueRecruitersAfter,
    },
    before: {
      recruiterDistribution: beforeDist,
      dmDistribution: countDistribution(beforeDms),
    },
    after: {
      recruiterDistribution: afterDist,
      dmDistribution: countDistribution(afterDms),
      assignmentsByState: Object.entries(byState)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count),
      assignmentsByTerritory: Object.entries(byTerritory)
        .map(([territory, count]) => ({ territory, count }))
        .sort((a, b) => b.count - a.count),
    },
    confidenceDistribution,
    topManualReviewReasons: [...manualReviewReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    pilotCandidateAudit: pilotAudit ?? null,
    recruiterEligibilityAudit: [
      ...recruiterEligibilityAudit.filter((row) => row.candidateId === "705cdc0e7f30"),
      ...recruiterEligibilityAudit
        .filter((row) => row.candidateId !== "705cdc0e7f30")
        .slice(0, 49),
    ],
    recommendation:
      uniqueRecruitersAfter >= 5 && taylorAfterPct < 40
        ? "Fixed algorithm distributes assignments across territory recruiter pools. Safe for dry-run review; keep threshold at 65%."
        : "Review territory recruiter pools and roster merge before production enablement.",
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p153.7-recruiter-assignment-distribution.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p153.7-recruiter-assignment-distribution.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, summary: report.summary, recommendation: report.recommendation }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
