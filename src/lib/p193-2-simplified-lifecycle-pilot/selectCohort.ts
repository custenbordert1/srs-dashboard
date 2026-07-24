import { createHash, randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P193_2_AUTH_EXPIRATION_HOURS,
  P193_2_MAX_COHORT,
  P193_2_MIN_COHORT,
  P193_2_SCHEMA_VERSION,
  type P1932CohortMember,
  type P1932FrozenCohort,
} from "@/lib/p193-2-simplified-lifecycle-pilot/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function evaluatePilotEligibility(input: {
  candidate: BreezyCandidate;
  workflow?: CandidateWorkflowRecord | null;
}): { ok: boolean; blockers: string[] } {
  const c = input.candidate;
  const wf = input.workflow;
  const blockers: string[] = [];

  if (!EMAIL_RE.test((c.email ?? "").trim())) blockers.push("invalid_email");
  if (String(c.phone ?? "").replace(/\D/g, "").length < 10) blockers.push("invalid_phone");
  const hasResume = Boolean(c.hasResume || ((c.resumeText ?? "").length > 40));
  if (!hasResume) blockers.push("missing_resume_or_experience");
  if (!c.hasQuestionnaire) blockers.push("missing_questionnaire");
  if (!c.positionId?.trim()) blockers.push("job_unresolved");
  if (!((c.city && c.state) || c.zipCode)) blockers.push("missing_location");

  const priorPaper =
    Boolean(wf?.signatureRequestId) ||
    Boolean(wf?.paperworkSentAt) ||
    (wf?.paperworkStatus && wf.paperworkStatus !== "not_sent");
  if (priorPaper) blockers.push("prior_paperwork_or_envelope");

  const status = wf?.workflowStatus ?? "Applied";
  if (!["Applied", "Needs Review", "Qualified"].includes(status)) {
    blockers.push(`status_not_fresh:${status}`);
  }

  const haystack = [...(wf?.notes ?? []), status, c.stage ?? ""].join(" ");
  if (/withdrawn|archived|\[hold\]|recruiter hold/i.test(haystack)) {
    blockers.push("withdrawn_archived_or_held");
  }
  if ((wf?.notes ?? []).some((n) => /P189|P190|P191|P185\.|test cohort|HISTORICAL_TEST/i.test(n))) {
    blockers.push("historical_or_prior_pilot");
  }

  return { ok: blockers.length === 0, blockers };
}

/**
 * Select up to 10 fresh applicants meeting hard gates. Does not lower standards.
 */
export function selectP1932PilotCohort(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  maxSize?: number;
  nowMs?: number;
}): {
  cohort: P1932FrozenCohort;
  belowMinimum: boolean;
  selectionBlockers: Record<string, number>;
} {
  const nowMs = input.nowMs ?? Date.now();
  const maxSize = Math.min(input.maxSize ?? P193_2_MAX_COHORT, P193_2_MAX_COHORT);
  const selectionBlockers: Record<string, number> = {};
  const members: P1932CohortMember[] = [];
  const emailSeen = new Set<string>();

  const scored: Array<{ c: BreezyCandidate; score: number }> = [];
  for (const c of input.candidates) {
    const evalResult = evaluatePilotEligibility({
      candidate: c,
      workflow: input.workflows[c.candidateId],
    });
    if (!evalResult.ok) {
      for (const b of evalResult.blockers) {
        selectionBlockers[b] = (selectionBlockers[b] ?? 0) + 1;
      }
      continue;
    }
    const email = (c.email ?? "").trim().toLowerCase();
    if (emailSeen.has(email)) {
      selectionBlockers.duplicate_email = (selectionBlockers.duplicate_email ?? 0) + 1;
      continue;
    }
    emailSeen.add(email);
    let score = 0;
    score += c.hasQuestionnaire ? 20 : 0;
    score += c.hasResume || (c.resumeText ?? "").length > 40 ? 20 : 0;
    score += c.zipCode ? 5 : 0;
    scored.push({ c, score });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const { c } of scored.slice(0, maxSize)) {
    const wf = input.workflows[c.candidateId];
    members.push({
      candidateId: c.candidateId,
      positionId: c.positionId!,
      positionName: c.positionName ?? "",
      city: c.city ?? null,
      state: c.state ?? null,
      zipCode: c.zipCode ?? null,
      hasResume: Boolean(c.hasResume || ((c.resumeText ?? "").length > 40)),
      hasQuestionnaire: Boolean(c.hasQuestionnaire),
      emailHash: hash(c.email ?? ""),
      phoneHash: hash(String(c.phone ?? "").replace(/\D/g, "")),
      legacyWorkflowStatus: wf?.workflowStatus ?? null,
    });
  }

  const ids = members.map((m) => m.candidateId);
  const frozenAt = new Date(nowMs).toISOString();
  const cohort: P1932FrozenCohort = {
    schemaVersion: P193_2_SCHEMA_VERSION,
    pilotId: `p193-2-pilot-${randomUUID().slice(0, 10)}`,
    fingerprint: cohortFingerprint(ids),
    frozenAt,
    expiresAt: new Date(nowMs + P193_2_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    immutable: true,
    maxSize,
    members,
    selectionBlockers,
    candidatesEvaluated: input.candidates.length,
  };

  return {
    cohort,
    belowMinimum: members.length < P193_2_MIN_COHORT,
    selectionBlockers,
  };
}

export function assertInsideCohort(cohort: P1932FrozenCohort, candidateId: string): void {
  if (!cohort.immutable) throw new Error("Cohort not immutable");
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(`Candidate ${candidateId} outside P193.2 cohort`);
  }
}
