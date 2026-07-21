/**
 * P243 pipeline health — pure report builders for Ops / Slack / Email.
 * Dry-run comparison of qualification before vs after forceFreshReset.
 */
import { createHash } from "node:crypto";
import type { DataQualityAssessment } from "@/lib/candidate-evaluation-orchestrator/data-quality";
import type {
  AutonomousCandidateResult,
  AutonomousCycleReport,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import { P243_SOURCE_PHASE } from "@/lib/p243-autonomous-end-to-end-pipeline/types";

const LOW_ADVANCE_PCT = 25;
const HIGH_DQ_ISSUE_PCT = 30;
const EXAMPLE_CAP = 3;
const FAILURE_REASON_CAP = 8;

export type P243FailureReasonExample = {
  reason: string;
  count: number;
  examples: Array<{
    redactedCandidateId: string;
    name: string;
    outcome: string;
  }>;
};

export type P243DataQualityIssueCount = {
  code: string;
  count: number;
  severity: string;
  examples: Array<{ redactedCandidateId: string; reason: string }>;
};

export type P243QualificationDelta = {
  candidateId: string;
  redactedCandidateId: string;
  name: string;
  beforeOutcome: string;
  afterOutcome: string;
  beforeRecommendation: string | null;
  afterRecommendation: string | null;
  improved: boolean;
  regressed: boolean;
};

export type P243OutcomeTally = {
  auto_advance: number;
  human_review: number;
  auto_reject: number;
  skipped: number;
  error: number;
  other: number;
};

export type P243PipelineHealthReport = {
  sourcePhase: typeof P243_SOURCE_PHASE;
  generatedAt: string;
  mode: "dry_run_only";
  limit: number;
  sample: {
    beforePulled: number;
    afterPulled: number;
    compared: number;
    overlapPct: number;
  };
  autoAdvance: {
    before: { count: number; ratePct: number; scored: number };
    after: { count: number; ratePct: number; scored: number };
    /** After rate minus before rate (percentage points). */
    deltaPctPoints: number;
  };
  outcomes: {
    before: P243OutcomeTally;
    after: P243OutcomeTally;
  };
  /** Remaining failure / non-advance reasons after fresh reset (primary Ops view). */
  topFailureReasons: P243FailureReasonExample[];
  /** Before-path failure reasons (stale-data baseline). */
  topFailureReasonsBefore: P243FailureReasonExample[];
  qualificationDeltas: P243QualificationDelta[];
  improvedCount: number;
  regressedCount: number;
  unchangedCount: number;
  dataQuality: {
    assessed: number;
    averageScore: number;
    preferHumanReviewCount: number;
    topIssues: P243DataQualityIssueCount[];
  };
  freshResetApplied: number;
  recommendations: string[];
  warnings: string[];
  beforeBatchId: string;
  afterBatchId: string;
  ceoTraceIds: { before: string; after: string };
};

function redact(id: string): string {
  return createHash("sha256").update(`p243-health:${id}`).digest("hex").slice(0, 12);
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function tallyOutcomes(candidates: AutonomousCandidateResult[]): P243OutcomeTally {
  const t: P243OutcomeTally = {
    auto_advance: 0,
    human_review: 0,
    auto_reject: 0,
    skipped: 0,
    error: 0,
    other: 0,
  };
  for (const c of candidates) {
    if (c.outcome === "auto_advance") t.auto_advance += 1;
    else if (c.outcome === "human_review") t.human_review += 1;
    else if (c.outcome === "auto_reject") t.auto_reject += 1;
    else if (c.outcome === "error") t.error += 1;
    else if (c.outcome.startsWith("skipped_")) t.skipped += 1;
    else t.other += 1;
  }
  return t;
}

function failureKey(c: AutonomousCandidateResult): string | null {
  if (c.outcome === "auto_advance") return null;
  if (c.error) return `error:${c.error.slice(0, 100)}`;
  if (c.skipReason) return `skip:${c.skipReason}`;
  if (c.p204Recommendation) return `rec:${c.p204Recommendation}`;
  return `outcome:${c.outcome}`;
}

/**
 * Rank non-advance reasons with redacted examples (pure / testable).
 */
export function buildP243FailureReasonExamples(
  candidates: AutonomousCandidateResult[],
  cap = FAILURE_REASON_CAP,
): P243FailureReasonExample[] {
  const buckets = new Map<
    string,
    {
      count: number;
      examples: P243FailureReasonExample["examples"];
    }
  >();

  for (const c of candidates) {
    const key = failureKey(c);
    if (!key) continue;
    const existing = buckets.get(key) ?? { count: 0, examples: [] };
    existing.count += 1;
    if (existing.examples.length < EXAMPLE_CAP) {
      existing.examples.push({
        redactedCandidateId: c.redactedCandidateId || redact(c.candidateId),
        name: c.name,
        outcome: c.outcome,
      });
    }
    buckets.set(key, existing);
  }

  return [...buckets.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, examples: v.examples }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, cap);
}

/**
 * Aggregate data-quality assessments into Ops-friendly issue tallies.
 */
export function buildP243DataQualityIssueCounts(
  assessments: DataQualityAssessment[],
): {
  assessed: number;
  averageScore: number;
  preferHumanReviewCount: number;
  topIssues: P243DataQualityIssueCount[];
} {
  const assessed = assessments.length;
  const averageScore =
    assessed > 0
      ? Math.round(
          (assessments.reduce((s, a) => s + a.score, 0) / assessed) * 10,
        ) / 10
      : 0;
  const preferHumanReviewCount = assessments.filter((a) => a.preferHumanReview).length;

  const buckets = new Map<
    string,
    {
      count: number;
      severity: string;
      examples: P243DataQualityIssueCount["examples"];
    }
  >();

  for (const a of assessments) {
    for (const issue of a.issues) {
      const existing = buckets.get(issue.code) ?? {
        count: 0,
        severity: issue.severity,
        examples: [],
      };
      existing.count += 1;
      if (existing.examples.length < EXAMPLE_CAP) {
        existing.examples.push({
          redactedCandidateId: redact(a.candidateId),
          reason: issue.reason,
        });
      }
      buckets.set(issue.code, existing);
    }
  }

  const topIssues = [...buckets.entries()]
    .map(([code, v]) => ({
      code,
      count: v.count,
      severity: v.severity,
      examples: v.examples,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, FAILURE_REASON_CAP);

  return { assessed, averageScore, preferHumanReviewCount, topIssues };
}

const ADVANCE_RANK: Record<string, number> = {
  auto_advance: 3,
  human_review: 2,
  auto_reject: 1,
  error: 0,
};

function outcomeRank(outcome: string): number {
  if (outcome in ADVANCE_RANK) return ADVANCE_RANK[outcome]!;
  if (outcome.startsWith("skipped_")) return 0;
  return 1;
}

function buildQualificationDeltas(
  before: AutonomousCycleReport,
  after: AutonomousCycleReport,
): P243QualificationDelta[] {
  const afterById = new Map(after.candidates.map((c) => [c.candidateId, c]));
  const deltas: P243QualificationDelta[] = [];

  for (const b of before.candidates) {
    const a = afterById.get(b.candidateId);
    if (!a) continue;
    const beforeRank = outcomeRank(b.outcome);
    const afterRank = outcomeRank(a.outcome);
    const improved = afterRank > beforeRank;
    const regressed = afterRank < beforeRank;
    deltas.push({
      candidateId: b.candidateId,
      redactedCandidateId: b.redactedCandidateId || redact(b.candidateId),
      name: b.name,
      beforeOutcome: b.outcome,
      afterOutcome: a.outcome,
      beforeRecommendation: b.p204Recommendation,
      afterRecommendation: a.p204Recommendation,
      improved,
      regressed,
    });
  }

  return deltas;
}

/**
 * Build actionable recommendations from before/after + DQ signals.
 * Never recommends enabling live unattended automation.
 */
export function buildP243HealthRecommendations(input: {
  afterAdvanceRatePct: number;
  deltaPctPoints: number;
  improvedCount: number;
  regressedCount: number;
  compared: number;
  topFailureReasons: P243FailureReasonExample[];
  dataQuality: P243PipelineHealthReport["dataQuality"];
  freshResetApplied: number;
}): string[] {
  const recs: string[] = [];
  const { afterAdvanceRatePct, deltaPctPoints, compared, dataQuality } = input;

  if (deltaPctPoints >= 10 || input.improvedCount >= Math.max(1, Math.floor(compared * 0.2))) {
    recs.push(
      "Fresh reset materially improved qualification — keep forceFreshReset for replay/debug cycles and investigate stale workflow fields on durable stores.",
    );
  } else if (deltaPctPoints <= 2 && input.freshResetApplied > 0) {
    recs.push(
      "Fresh reset did not move advance rate much — remaining blockers are likely real qualification/data gates, not stale-state noise.",
    );
  }

  if (afterAdvanceRatePct < LOW_ADVANCE_PCT && compared >= 5) {
    const top = input.topFailureReasons[0]?.reason ?? "unknown";
    recs.push(
      `After-reset auto-advance is low (${afterAdvanceRatePct}%). Prioritize top remaining reason: ${top}.`,
    );
  }

  for (const issue of dataQuality.topIssues.slice(0, 3)) {
    const issuePct = pct(issue.count, Math.max(1, dataQuality.assessed));
    if (issuePct < HIGH_DQ_ISSUE_PCT && issue.severity !== "blocking") continue;
    if (issue.code === "missing_phone") {
      recs.push(
        `Missing phone on ~${issuePct}% of sample — tighten Breezy phone capture / enrichment before scoring.`,
      );
    } else if (issue.code === "missing_location") {
      recs.push(
        `Missing city/state on ~${issuePct}% of sample — fix location ingestion (blocks distance/qualification).`,
      );
    } else if (issue.code === "missing_email") {
      recs.push(
        `Missing/invalid email on ~${issuePct}% of sample — block auto-advance until contact is remediated.`,
      );
    } else if (issue.code === "stale_action_type") {
      recs.push(
        "Stale actionType (send-paperwork / await-signature) still present — confirm fresh-reset coverage on those fields.",
      );
    } else if (issue.code === "missing_questionnaire" || issue.code === "missing_resume") {
      recs.push(
        `${issue.code.replace(/_/g, " ")} common (~${issuePct}%) — expect more human_review until capture improves.`,
      );
    } else if (issue.severity === "blocking") {
      recs.push(
        `Blocking data-quality issue ${issue.code} on ${issue.count}/${dataQuality.assessed} — remediate before raising autonomy.`,
      );
    }
  }

  if (input.regressedCount > 0) {
    recs.push(
      `${input.regressedCount} candidate(s) looked worse after reset — spot-check Breezy refresh failures and reset validation notes.`,
    );
  }

  if (recs.length === 0) {
    recs.push(
      "No critical health gaps in this dry-run sample — continue monitoring; do not enable live unattended sends from this check alone.",
    );
  } else {
    recs.push(
      "This health check is dry-run only — do not enable live automation or Dropbox sends from these results.",
    );
  }

  return recs;
}

/**
 * Compare before (no reset) vs after (forceFreshReset) cycle reports + optional DQ.
 */
export function buildP243PipelineHealthReport(input: {
  before: AutonomousCycleReport;
  after: AutonomousCycleReport;
  dataQualityAssessments?: DataQualityAssessment[];
  limit?: number;
  generatedAt?: string;
}): P243PipelineHealthReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const before = input.before;
  const after = input.after;
  const deltas = buildQualificationDeltas(before, after);
  const compared = deltas.length;
  const overlapDenom = Math.max(before.pulled, after.pulled, 1);
  const overlapPct = pct(compared, overlapDenom);

  const beforeAdvance = {
    count: before.autoAdvance,
    ratePct: before.advanceRatePct,
    scored: before.scored,
  };
  const afterAdvance = {
    count: after.autoAdvance,
    ratePct: after.advanceRatePct,
    scored: after.scored,
  };
  const deltaPctPoints =
    Math.round((afterAdvance.ratePct - beforeAdvance.ratePct) * 10) / 10;

  const topFailureReasons = buildP243FailureReasonExamples(after.candidates);
  const topFailureReasonsBefore = buildP243FailureReasonExamples(before.candidates);
  const dataQuality = buildP243DataQualityIssueCounts(
    input.dataQualityAssessments ?? [],
  );

  const improvedCount = deltas.filter((d) => d.improved).length;
  const regressedCount = deltas.filter((d) => d.regressed).length;
  const unchangedCount = compared - improvedCount - regressedCount;

  const recommendations = buildP243HealthRecommendations({
    afterAdvanceRatePct: afterAdvance.ratePct,
    deltaPctPoints,
    improvedCount,
    regressedCount,
    compared,
    topFailureReasons,
    dataQuality,
    freshResetApplied: after.freshResetApplied,
  });

  const warnings = [
    ...new Set([
      ...before.warnings,
      ...after.warnings,
      ...(compared < Math.min(before.pulled, after.pulled)
        ? [
            `Sample overlap ${compared}/${overlapDenom} — before/after pulls may have drifted; prefer comparing shared candidateIds.`,
          ]
        : []),
    ]),
  ];

  return {
    sourcePhase: P243_SOURCE_PHASE,
    generatedAt,
    mode: "dry_run_only",
    limit: input.limit ?? Math.max(before.pulled, after.pulled),
    sample: {
      beforePulled: before.pulled,
      afterPulled: after.pulled,
      compared,
      overlapPct,
    },
    autoAdvance: {
      before: beforeAdvance,
      after: afterAdvance,
      deltaPctPoints,
    },
    outcomes: {
      before: tallyOutcomes(before.candidates),
      after: tallyOutcomes(after.candidates),
    },
    topFailureReasons,
    topFailureReasonsBefore,
    qualificationDeltas: deltas,
    improvedCount,
    regressedCount,
    unchangedCount,
    dataQuality,
    freshResetApplied: after.freshResetApplied,
    recommendations,
    warnings,
    beforeBatchId: before.batchId,
    afterBatchId: after.batchId,
    ceoTraceIds: {
      before: before.ceoTraceId,
      after: after.ceoTraceId,
    },
  };
}

/**
 * Concise markdown for Ops panel / Slack / Email alert.
 */
export function formatP243PipelineHealthMarkdown(
  report: P243PipelineHealthReport,
): string {
  const a = report.autoAdvance;
  const dq = report.dataQuality;
  const lines: string[] = [
    `# P243 Pipeline Health`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Mode: **DRY-RUN ONLY** (no live send)`,
    `Sample limit: ${report.limit} | compared: ${report.sample.compared} (overlap ${report.sample.overlapPct}%)`,
    `Fresh Reset Applied: **${report.freshResetApplied}**`,
    ``,
    `## Auto-advance`,
    ``,
    `| Path | Advance | Rate | Scored |`,
    `| --- | ---: | ---: | ---: |`,
    `| Before (no reset) | ${a.before.count} | ${a.before.ratePct}% | ${a.before.scored} |`,
    `| After (forceFreshReset) | ${a.after.count} | ${a.after.ratePct}% | ${a.after.scored} |`,
    `| Delta | | **${a.deltaPctPoints >= 0 ? "+" : ""}${a.deltaPctPoints} pp** | |`,
    ``,
    `Qualification deltas: improved=${report.improvedCount} regressed=${report.regressedCount} unchanged=${report.unchangedCount}`,
    ``,
    `## Top remaining failure reasons (after reset)`,
    ``,
  ];

  if (report.topFailureReasons.length === 0) {
    lines.push(`- None (all scored paths auto-advanced or sample empty)`);
  } else {
    for (const f of report.topFailureReasons) {
      const ex = f.examples
        .map((e) => `${e.name}(${e.redactedCandidateId})`)
        .join(", ");
      lines.push(`- **${f.reason}** ×${f.count}${ex ? ` — e.g. ${ex}` : ""}`);
    }
  }

  lines.push(``, `## Data quality`, ``);
  lines.push(
    `- Assessed: ${dq.assessed} | avg score: **${dq.averageScore}/100** | prefer human review: ${dq.preferHumanReviewCount}`,
  );
  if (dq.topIssues.length === 0) {
    lines.push(`- No data-quality issues in sample`);
  } else {
    for (const issue of dq.topIssues) {
      lines.push(
        `- **${issue.code}** (${issue.severity}) ×${issue.count}`,
      );
    }
  }

  lines.push(``, `## Recommendations`, ``);
  for (const r of report.recommendations) {
    lines.push(`- ${r}`);
  }

  if (report.warnings.length) {
    lines.push(``, `## Warnings`, ``);
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
  }

  lines.push(
    ``,
    `## Traces`,
    ``,
    `- before batch=${report.beforeBatchId} ceo=${report.ceoTraceIds.before}`,
    `- after batch=${report.afterBatchId} ceo=${report.ceoTraceIds.after}`,
  );

  return `${lines.join("\n")}\n`;
}
