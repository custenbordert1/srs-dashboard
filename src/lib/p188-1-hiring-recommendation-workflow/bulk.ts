import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import { executeRecommendHire, type RecommendHireDeps } from "@/lib/p188-1-hiring-recommendation-workflow/recommendHire";
import { validateRecommendHire } from "@/lib/p188-1-hiring-recommendation-workflow/validator";
import {
  P188_1_BULK_MAX,
  type P1881BulkPreviewResult,
  type P1881CandidateContext,
  type P1881AllowedRole,
  type P1881RecommendHireResult,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

export type BulkMember = {
  candidateId: string;
  reason: string;
  context: P1881CandidateContext;
};

/**
 * Bulk Recommend Hire — preview by default; execution behind separate flag.
 */
export function previewBulkRecommendHire(input: {
  members: BulkMember[];
  actor: string;
  role: P1881AllowedRole;
  forceFlags?: { bulkRecommendationPreview: boolean };
}): P1881BulkPreviewResult | { ok: false; reason: string } {
  const flags = readP1881Flags(
    input.forceFlags
      ? { bulkRecommendationPreview: input.forceFlags.bulkRecommendationPreview }
      : undefined,
  );
  if (!flags.bulkRecommendationPreview) {
    return { ok: false, reason: "P188_BULK_RECOMMENDATION_PREVIEW flag is off" };
  }
  if (input.members.length > P188_1_BULK_MAX) {
    return { ok: false, reason: `Batch exceeds max ${P188_1_BULK_MAX}` };
  }

  const eligible: string[] = [];
  const blocked: Array<{ candidateId: string; blockers: string[] }> = [];
  for (const m of input.members) {
    const v = validateRecommendHire({
      actor: input.actor,
      role: input.role,
      reason: m.reason,
      context: m.context,
    });
    if (v.eligible) eligible.push(m.candidateId);
    else blocked.push({ candidateId: m.candidateId, blockers: v.blockers });
  }

  return {
    ok: true,
    previewOnly: true,
    batchSize: input.members.length,
    maxBatchSize: P188_1_BULK_MAX,
    eligible,
    blocked,
    paperworkSendsAttempted: 0,
    executed: false,
  };
}

export async function executeBulkRecommendHire(input: {
  members: BulkMember[];
  actor: string;
  role: P1881AllowedRole;
  confirmed: boolean;
  deps?: RecommendHireDeps;
  forceFlags?: {
    bulkRecommendationExecution: boolean;
    recommendationApi: boolean;
  };
}): Promise<{
  ok: boolean;
  executed: boolean;
  results: P1881RecommendHireResult[];
  partialSuccess: boolean;
  paperworkSendsAttempted: 0;
  detail: string;
}> {
  const flags = readP1881Flags(input.forceFlags);
  if (!flags.bulkRecommendationExecution) {
    return {
      ok: false,
      executed: false,
      results: [],
      partialSuccess: false,
      paperworkSendsAttempted: 0,
      detail: "P188_BULK_RECOMMENDATION_EXECUTION flag is off",
    };
  }
  if (!input.confirmed) {
    return {
      ok: false,
      executed: false,
      results: [],
      partialSuccess: false,
      paperworkSendsAttempted: 0,
      detail: "Explicit confirmation required",
    };
  }
  if (input.members.length > P188_1_BULK_MAX) {
    return {
      ok: false,
      executed: false,
      results: [],
      partialSuccess: false,
      paperworkSendsAttempted: 0,
      detail: `Batch exceeds max ${P188_1_BULK_MAX}`,
    };
  }

  const results: P1881RecommendHireResult[] = [];
  for (const m of input.members) {
    const result = await executeRecommendHire(
      {
        candidateId: m.candidateId,
        actor: input.actor,
        role: input.role,
        reason: m.reason,
        source: "bulk",
        context: m.context,
      },
      input.deps,
      { recommendationApi: true },
    );
    results.push(result);
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return {
    ok: failed === 0,
    executed: true,
    results,
    partialSuccess: succeeded > 0 && failed > 0,
    paperworkSendsAttempted: 0,
    detail: `succeeded=${succeeded} failed=${failed}`,
  };
}
