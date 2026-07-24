import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  hasQuestionnaire,
  hasResume,
  hasValidEmail,
} from "@/lib/p207-autonomous-readiness-dashboard/classify";
import type {
  P207DropboxDiagnostics,
  P207DrillRow,
  P207Stage,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export type P207BlockerHit = {
  candidateId: string;
  stage: P207Stage;
  blockerId: string;
  blockerLabel: string;
  reasonCodes: string[];
  nextAction: string;
};

const SUPPRESSION_RE =
  /\[P198_SUPPRESSION\]|permanent.?fail|send.?suppress|do.?not.?send/i;

export function detectBlockersForCandidate(input: {
  stage: P207Stage;
  candidate: BreezyCandidate | undefined;
  workflow: CandidateWorkflowRecord | undefined;
  dropbox: P207DropboxDiagnostics;
  aiRecommendation?: string | null;
  confidence?: number | null;
}): P207BlockerHit[] {
  const hits: P207BlockerHit[] = [];
  const c = input.candidate;
  const wf = input.workflow;
  const notes = (wf?.notes ?? []).join("\n");
  const push = (
    blockerId: string,
    blockerLabel: string,
    reasonCodes: string[],
    nextAction: string,
  ) => {
    hits.push({
      candidateId: c?.candidateId ?? wf?.candidateId ?? "unknown",
      stage: input.stage,
      blockerId,
      blockerLabel,
      reasonCodes,
      nextAction,
    });
  };

  if (input.stage === "Applied" || input.stage === "Needs Review") {
    if (!hasQuestionnaire(c)) {
      push("missing_questionnaire", "Missing questionnaire", ["missing_questionnaire"], "Capture questionnaire");
    }
    if (!hasResume(c)) {
      push("missing_resume", "Missing resume", ["missing_resume"], "Capture resume");
    }
    if (!hasValidEmail(c)) {
      push("missing_email", "Missing/invalid email", ["missing_email"], "Fix contact email");
    }
    if (!wf?.assignedRecruiter || wf.assignedRecruiter === "Unassigned") {
      push("missing_recruiter", "Missing recruiter", ["missing_recruiter"], "Assign recruiter");
    }
    if (input.stage === "Applied" && !input.aiRecommendation) {
      push("missing_approval", "Missing AI/operator approval", ["missing_approval"], "Run AI qualification review");
    }
    if (input.stage === "Needs Review") {
      push("awaiting_recruiter_review", "Awaiting recruiter review", ["needs_review"], "Complete recruiter review");
    }
  }

  if (input.stage === "Paperwork Needed") {
    if (input.dropbox.vendorBlocked || (input.dropbox.productionQuota ?? 0) <= 0) {
      push("dropbox_quota", "Dropbox production quota", ["dropbox_quota"], "Restore Dropbox API quota");
    }
    if (input.dropbox.testMode === true) {
      push("test_mode", "Dropbox test_mode=true", ["test_mode"], "Force production test_mode=false");
    }
    if (!hasValidEmail(c)) {
      push("missing_email", "Missing/invalid email", ["missing_email"], "Fix contact email");
    }
    if (SUPPRESSION_RE.test(notes)) {
      push("suppression", "Send suppression", ["suppression"], "Clear suppression flag");
    }
    if (wf?.signatureRequestId) {
      push("stale_envelope", "Unexpected prior envelope", ["stale_envelope"], "Reconcile envelope state");
    }
  }

  if (input.stage === "Paperwork Sent") {
    if (wf?.paperworkStatus === "declined") {
      push("declined", "Declined", ["declined"], "Review decline reason");
    } else if (/expired/i.test(notes)) {
      push("expired", "Expired packet", ["expired"], "Reissue paperwork (future pilot)");
    } else {
      push("awaiting_signature", "Awaiting signature", ["awaiting_signature"], "Wait for candidate signature");
    }
  }

  if (input.stage === "Signed") {
    push("ready_for_mel_blocked", "Ready for MEL blocked", ["ready_for_mel_blocked"], "Run MEL readiness review");
  }

  return hits;
}

export function summarizeBlockers(
  hits: P207BlockerHit[],
): Array<{ id: string; label: string; count: number }> {
  const map = new Map<string, { id: string; label: string; count: number }>();
  for (const h of hits) {
    const cur = map.get(h.blockerId) ?? { id: h.blockerId, label: h.blockerLabel, count: 0 };
    cur.count += 1;
    map.set(h.blockerId, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function estimateHoursToClear(
  stage: P207Stage,
  largestBlockerId: string | null,
  dropbox: P207DropboxDiagnostics,
): number | null {
  if (!largestBlockerId) return 0;
  if (largestBlockerId === "dropbox_quota") {
    return dropbox.vendorBlocked ? 24 : 8;
  }
  if (largestBlockerId === "awaiting_signature") return 48;
  if (largestBlockerId === "missing_questionnaire") return 12;
  if (largestBlockerId === "awaiting_recruiter_review") return 8;
  if (largestBlockerId === "ready_for_mel_blocked") return 4;
  if (stage === "Paperwork Needed") return 6;
  return 12;
}

export function toDrillRow(input: {
  hit: P207BlockerHit;
  candidate: BreezyCandidate | undefined;
  workflow: CandidateWorkflowRecord | undefined;
  confidence: number | null;
  aiRecommendation: string | null;
}): P207DrillRow {
  const c = input.candidate;
  const owner = input.workflow?.assignedRecruiter ?? "Unassigned";
  const nearestWork =
    c?.city || c?.state
      ? [c.city, c.state].filter(Boolean).join(", ")
      : null;
  return {
    candidateId: input.hit.candidateId,
    displayName: c
      ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || input.hit.candidateId.slice(0, 8)
      : input.hit.candidateId.slice(0, 8),
    stage: input.hit.stage,
    blocker: input.hit.blockerLabel,
    reasonCodes: input.hit.reasonCodes,
    confidence: input.confidence,
    assignedRecruiter: owner,
    owner,
    aiRecommendation: input.aiRecommendation,
    nextAction: input.hit.nextAction,
    nearestWork,
    lastActivityAt:
      input.workflow?.lastActionAt ??
      input.workflow?.updatedAt ??
      input.workflow?.paperworkSentAt ??
      null,
  };
}
