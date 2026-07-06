import type { AuthSession } from "@/lib/auth/types";
import { buildPaperworkAutomationBundle } from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import {
  P147_INITIAL_CONFIDENCE_MIN,
  evaluateInitialPaperworkEligibility,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import {
  evaluatePaperworkCandidate,
  type PaperworkAutomationBlocker,
} from "@/lib/recruiting/paperwork-automation-engine";
import type {
  ClassifiedPaperworkCandidate,
  PaperworkClassificationReport,
  PaperworkProductionCategory,
} from "@/lib/p150-controlled-production-activation/types";
import { P150_SOURCE_PHASE } from "@/lib/p150-controlled-production-activation/types";

const CATEGORY_KEYS: PaperworkProductionCategory[] = [
  "READY_TO_SEND",
  "WAITING",
  "COOLDOWN",
  "ALREADY_SENT",
  "MISSING_JOB",
  "LOW_CONFIDENCE",
  "BLOCKED",
  "MANUAL_REVIEW",
  "NOT_REQUIRING_PAPERWORK",
];

function emptyCounts(): Record<PaperworkProductionCategory, number> {
  return Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0])) as Record<
    PaperworkProductionCategory,
    number
  >;
}

function candidateName(firstName?: string, lastName?: string, fallback?: string): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return name || fallback || "Unknown";
}

function classifyCategory(input: {
  queueItem: ReturnType<typeof evaluatePaperworkCandidate>;
  eligibility: ReturnType<typeof evaluateInitialPaperworkEligibility> | null;
  advancementConfidence: number | null;
  advancementAction: string | null;
  blockers: PaperworkAutomationBlocker[];
  row: { paperworkStatus: string; workflowStatus: string; signatureRequestId?: string | null };
}): { category: PaperworkProductionCategory; primaryBlockerReason: string } {
  const { queueItem, eligibility, advancementConfidence, advancementAction, blockers, row } = input;
  const onPaperworkPath =
    advancementAction === "Send Paperwork" ||
    queueItem?.recommendedAction === "Send Initial Paperwork" ||
    queueItem?.recommendedAction?.includes("Reminder") ||
    row.workflowStatus === "Paperwork Needed" ||
    row.workflowStatus === "Paperwork Sent";

  if (
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Signed" ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.signatureRequestId
  ) {
    return { category: "ALREADY_SENT", primaryBlockerReason: "Paperwork already sent or signed." };
  }

  if (blockers.includes("Completed Paperwork")) {
    return { category: "ALREADY_SENT", primaryBlockerReason: "Completed paperwork." };
  }

  if (blockers.includes("Recent Contact Cooldown")) {
    return { category: "COOLDOWN", primaryBlockerReason: "Recent contact cooldown active." };
  }

  if (blockers.some((b) => b.includes("Job") && !blockers.includes("No Published Job") && !blockers.includes("Closed Project"))) {
    return {
      category: "MISSING_JOB",
      primaryBlockerReason: blockers.find((b) => b.includes("Job") || b.includes("Project")) ?? "Missing published job.",
    };
  }

  if (eligibility?.eligible) {
    return { category: "READY_TO_SEND", primaryBlockerReason: "All gates passed." };
  }

  if (queueItem?.recommendedAction === "Manual Review" || blockers.includes("Manual Review Required")) {
    return {
      category: "MANUAL_REVIEW",
      primaryBlockerReason: eligibility?.blockedReason ?? "Manual review required.",
    };
  }

  if (queueItem?.recommendedAction === "Wait" || queueItem?.recommendedAction?.includes("Reminder")) {
    return {
      category: "WAITING",
      primaryBlockerReason: queueItem.reason,
    };
  }

  if (!onPaperworkPath && !queueItem) {
    const reason =
      advancementAction && advancementAction !== "Send Paperwork"
        ? `P144 next action is "${advancementAction}" — not yet paperwork-ready.`
        : "Not ready to send and no outstanding paperwork.";
    return { category: "NOT_REQUIRING_PAPERWORK", primaryBlockerReason: reason };
  }

  if (
    onPaperworkPath &&
    advancementConfidence != null &&
    advancementConfidence < P147_INITIAL_CONFIDENCE_MIN
  ) {
    return {
      category: "LOW_CONFIDENCE",
      primaryBlockerReason: `Advancement confidence ${advancementConfidence}% below ${P147_INITIAL_CONFIDENCE_MIN}%.`,
    };
  }

  if (blockers.length > 0 || eligibility?.blockedReason) {
    return {
      category: "BLOCKED",
      primaryBlockerReason: eligibility?.blockedReason ?? (blockers.join(", ") || "Blocked by eligibility rules."),
    };
  }

  return { category: "BLOCKED", primaryBlockerReason: "Does not meet production send criteria." };
}

function explainQueueZero(counts: Record<PaperworkProductionCategory, number>, inQueue: number): string[] {
  const lines: string[] = [];
  if (inQueue > 0) {
    lines.push(`${inQueue} candidates appear in the paperwork queue.`);
    return lines;
  }
  lines.push("Paperwork queue is empty because no candidate is both ready-to-send and outstanding.");
  if (counts.NOT_REQUIRING_PAPERWORK > 0) {
    lines.push(
      `${counts.NOT_REQUIRING_PAPERWORK} candidates are not yet on the paperwork send path (early funnel stage).`,
    );
  }
  if (counts.ALREADY_SENT > 0) {
    lines.push(`${counts.ALREADY_SENT} candidates already have paperwork sent or completed.`);
  }
  if (counts.WAITING > 0) {
    lines.push(`${counts.WAITING} candidates are waiting on candidate action or reminder timing.`);
  }
  if (counts.LOW_CONFIDENCE > 0) {
    lines.push(`${counts.LOW_CONFIDENCE} candidates fail P144/P147 confidence thresholds.`);
  }
  if (counts.MANUAL_REVIEW > 0) {
    lines.push(`${counts.MANUAL_REVIEW} candidates require manual review.`);
  }
  if (counts.BLOCKED > 0) {
    lines.push(`${counts.BLOCKED} candidates are blocked by eligibility rules.`);
  }
  if (counts.READY_TO_SEND === 0) {
    lines.push("Zero candidates classified READY_TO_SEND for controlled activation.");
  }
  return lines;
}

export async function classifyPaperworkCandidatesForProduction(
  session: AuthSession,
): Promise<PaperworkClassificationReport> {
  const bundle = await buildPaperworkAutomationBundle(session);
  const referenceMs = Date.parse(bundle.meta.refreshedAt);
  const advancementById = new Map(bundle.advancements.map((a) => [a.candidateId, a]));
  const counts = emptyCounts();
  const classified: ClassifiedPaperworkCandidate[] = [];

  for (const context of bundle.contexts) {
    const queueItem = evaluatePaperworkCandidate({ ...context, referenceMs });
    const advancement = advancementById.get(context.row.candidateId) ?? null;
    const eligibility = advancement
      ? evaluateInitialPaperworkEligibility({
          context,
          advancement,
          auditEvents: bundle.auditEvents,
          referenceMs,
        })
      : null;

    const blockers = queueItem?.blockers ?? [];
    const { category, primaryBlockerReason } = classifyCategory({
      queueItem,
      eligibility,
      advancementConfidence: advancement?.confidence ?? null,
      advancementAction: advancement?.nextAction ?? null,
      blockers,
      row: context.row,
    });

    counts[category] += 1;

    const blockerReasons = [
      ...blockers,
      ...(eligibility?.validation.reasons ?? []),
    ].filter(Boolean);

    classified.push({
      candidateId: context.row.candidateId,
      candidateName: candidateName(context.row.firstName, context.row.lastName, context.row.candidateId),
      email: context.row.email?.trim() ?? null,
      recruiter: context.row.assignedRecruiter || "Unassigned",
      project: context.row.positionName || "—",
      workflowStatus: context.row.workflowStatus,
      paperworkStatus: context.row.paperworkStatus,
      category,
      recommendedAction: queueItem?.recommendedAction ?? null,
      confidence: queueItem?.confidence ?? null,
      advancementAction: advancement?.nextAction ?? null,
      advancementConfidence: advancement?.confidence ?? null,
      blockers: blockerReasons,
      primaryBlockerReason,
      inPaperworkQueue: queueItem != null,
    });
  }

  const inPaperworkQueue = classified.filter((c) => c.inPaperworkQueue).length;
  const blockerSummary: Record<string, number> = {};
  const eligibilitySummary: Record<string, number> = {};
  for (const c of classified) {
    eligibilitySummary[c.primaryBlockerReason] = (eligibilitySummary[c.primaryBlockerReason] ?? 0) + 1;
    if (c.category === "READY_TO_SEND" || c.category === "NOT_REQUIRING_PAPERWORK") continue;
    blockerSummary[c.primaryBlockerReason] = (blockerSummary[c.primaryBlockerReason] ?? 0) + 1;
  }

  return {
    sourcePhase: P150_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: bundle.candidatesEvaluated,
    inPaperworkQueue,
    categoryCounts: counts,
    blockerSummary,
    eligibilitySummary,
    candidates: classified.sort((a, b) => {
      if (a.category === b.category) return a.candidateName.localeCompare(b.candidateName);
      return a.category.localeCompare(b.category);
    }),
    queueZeroExplanation: explainQueueZero(counts, inPaperworkQueue),
    executeBatchCalled: false,
    breezyWrites: false,
  };
}
