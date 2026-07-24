import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  questionnaireEvidenceHash,
  resumeEvidenceHash,
} from "@/lib/p204-1-supervised-qualification-pilot/evidence";
import type { P2041RecommendationRecord } from "@/lib/p204-1-supervised-qualification-pilot/types";
import { listP2041Recommendations } from "@/lib/p204-1-supervised-qualification-pilot/store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P204_2_EXPECTED_COHORT_ID,
  P204_2_EXPECTED_FINGERPRINT,
  type P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";

export type P2042LoadedCohort = {
  cohortId: string;
  fingerprint: string;
  recommendations: P2041RecommendationRecord[];
  localMembers: Array<{
    candidateId: string;
    name: string;
    email: string;
    phone: string;
    state: string;
    city: string;
    recommendation: string;
    confidence: number;
  }>;
};

export async function loadP2042FrozenCohort(options?: {
  cohortId?: string;
  fingerprint?: string;
}): Promise<P2042LoadedCohort> {
  const cohortId = options?.cohortId ?? P204_2_EXPECTED_COHORT_ID;
  const fingerprint = options?.fingerprint ?? P204_2_EXPECTED_FINGERPRINT;

  const recommendations = (await listP2041Recommendations()).filter(
    (r) => r.cohortId === cohortId && r.fingerprint === fingerprint,
  );
  if (recommendations.length === 0) {
    throw new Error(`No P204.1 recommendations for cohort ${cohortId} / ${fingerprint}`);
  }

  let localMembers: P2042LoadedCohort["localMembers"] = [];
  try {
    const raw = await readFile(
      path.join(recruitingDataDir(), "p204-1-supervised-pilot-operator-local.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      cohortId?: string;
      fingerprint?: string;
      members?: P2042LoadedCohort["localMembers"];
    };
    if (parsed.cohortId !== cohortId || parsed.fingerprint !== fingerprint) {
      throw new Error("Local operator file cohort/fingerprint mismatch");
    }
    localMembers = parsed.members ?? [];
  } catch (err) {
    if (err instanceof Error && err.message.includes("mismatch")) throw err;
    // Fall back to store-only IDs
    localMembers = recommendations.map((r) => ({
      candidateId: r.candidateId,
      name: "",
      email: "",
      phone: "",
      state: "",
      city: "",
      recommendation: r.recommendation,
      confidence: r.confidence,
    }));
  }

  return { cohortId, fingerprint, recommendations, localMembers };
}

export type P2042FreezeHashRow = {
  redactedCandidateId: string;
  questionnaireHash: string;
  resumeHash: string;
  evidenceHash: string;
  workflowStatus: string;
};

export async function loadFreezeHashIndex(
  cohortId: string,
  fingerprint: string,
): Promise<Map<string, P2042FreezeHashRow>> {
  const out = new Map<string, P2042FreezeHashRow>();
  try {
    const raw = await readFile(
      path.join(process.cwd(), "artifacts", "p204-1-frozen-cohort.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      cohortId?: string;
      fingerprint?: string;
      members?: P2042FreezeHashRow[];
    };
    if (parsed.cohortId !== cohortId || parsed.fingerprint !== fingerprint) {
      return out;
    }
    for (const m of parsed.members ?? []) {
      out.set(m.redactedCandidateId, m);
    }
  } catch {
    // optional
  }
  return out;
}

export function detectStaleMember(input: {
  record: P2041RecommendationRecord;
  workflow: CandidateWorkflowRecord | undefined;
  candidate: BreezyCandidate | undefined;
  freezeHashes?: P2042FreezeHashRow | null;
}): { stale: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.workflow) reasons.push("workflow_missing");
  if (!input.candidate) reasons.push("candidate_missing");
  if (input.workflow && input.workflow.workflowStatus !== "Applied") {
    reasons.push(`stage_changed:${input.workflow.workflowStatus}`);
  }
  if (input.workflow?.signatureRequestId) reasons.push("active_envelope_appeared");
  if (input.workflow?.paperworkStatus && input.workflow.paperworkStatus !== "not_sent") {
    reasons.push(`paperwork_changed:${input.workflow.paperworkStatus}`);
  }
  if (input.candidate && input.freezeHashes) {
    const qHash = questionnaireEvidenceHash(input.candidate);
    const rHash = resumeEvidenceHash(input.candidate);
    if (qHash !== input.freezeHashes.questionnaireHash) {
      reasons.push("questionnaire_evidence_changed");
    }
    if (rHash !== input.freezeHashes.resumeHash) {
      reasons.push("resume_evidence_changed");
    }
    if (input.record.evidenceFingerprint !== input.freezeHashes.evidenceHash) {
      reasons.push("evidence_fingerprint_mismatch");
    }
  }
  return { stale: reasons.length > 0, reasons };
}

export function buildSafetyFlags(record: P2041RecommendationRecord): string[] {
  const flags: string[] = [];
  if (
    record.recommendation === "Advance" &&
    (record.hardGates.length > 0 ||
      record.reasonCodes.includes("missing_questionnaire") ||
      record.questionnaireCompleteness === "missing")
  ) {
    flags.push("advance_despite_hard_gate_or_missing_questionnaire");
  }
  if (
    record.recommendation === "Reject" &&
    record.hardGates.length === 0 &&
    (record.reasonCodes.includes("missing_resume") ||
      record.reasonCodes.includes("missing_questionnaire") ||
      record.reasonCodes.includes("insufficient_enriched_signals"))
  ) {
    flags.push("reject_primarily_missing_data");
  }
  if (record.duplicateStatus !== "clear") {
    flags.push("unresolved_duplicate_evidence");
  }
  if (
    record.positiveFactors.includes("territory_fit") &&
    record.reasonCodes.filter((c) => c === "territory_fit" || c === "nearby_work_available")
      .length >= 2 &&
    !record.positiveFactors.some((p) => /qualified|questionnaire|resume/i.test(p)) &&
    record.recommendation === "Advance"
  ) {
    flags.push("territory_may_dominate_qualification");
  }
  if (
    /Travel\/territory score=100/i.test(record.recruiterExplanation) &&
    record.nearbyJobSignal === "nearest~0mi" &&
    record.recommendation === "Advance"
  ) {
    flags.push("explanation_conflicts_with_zero_distance_signal");
  }
  return flags;
}

export function buildReviewPackage(input: {
  record: P2041RecommendationRecord;
  workflow: CandidateWorkflowRecord | undefined;
  candidate: BreezyCandidate | undefined;
  freezeHashes?: P2042FreezeHashRow | null;
}): P2042ReviewPackage {
  const stale = detectStaleMember(input);
  const nearest =
    input.record.nearbyJobSignal.startsWith("nearest~")
      ? input.record.nearbyJobSignal
      : "unknown";
  const miles = nearest.match(/nearest~(\d+(?:\.\d+)?)mi/i)?.[1];
  const nearbyJobsCount = miles != null ? 1 : 0;
  const years =
    input.candidate?.resumeText?.match(/(\d{1,2})\+?\s*years?/i)?.[1] ??
    null;

  return {
    candidateId: input.record.candidateId,
    redactedCandidateId: input.record.redactedCandidateId,
    aiRecommendation: input.record.recommendation,
    confidence: input.record.confidence,
    topPositiveFactors: input.record.positiveFactors.slice(0, 5),
    topNegativeFactors: input.record.negativeFactors.slice(0, 5),
    hardGateResults: input.record.hardGates,
    questionnaireCompleteness: input.record.questionnaireCompleteness,
    experienceSummary: years ? `~${years} years mentioned on resume` : "no years parsed",
    duplicateStatus: input.record.duplicateStatus,
    nearbyJobsCount,
    nearestJobDistance: nearest,
    currentWorkflowStage: input.workflow?.workflowStatus ?? "missing",
    evidenceFreshness: input.record.evidenceFreshness,
    conciseExplanation: input.record.recruiterExplanation,
    stale: stale.stale,
    staleReasons: stale.reasons,
    safetyFlags: buildSafetyFlags(input.record),
  };
}
