import { createHash } from "node:crypto";
import { readP1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";
import type { P1865MelExportPreview } from "@/lib/p186-5-post-sign-mel-queue/types";

function hashId(id: string): string {
  return `cand_${createHash("sha256").update(id).digest("hex").slice(0, 10)}`;
}

/**
 * Redacted MEL export preview — no secrets, full government IDs, banking, or raw docs.
 */
export function buildMelExportPreview(input: {
  candidateId: string;
  jobOrProjectId?: string | null;
  workerClassification?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  requiredFieldReadinessPct: number;
  missingFields: string[];
  sourceSystemReferences?: string[];
  forceFlags?: { melExportPreview: boolean };
}): { ok: boolean; preview: P1865MelExportPreview | null; detail: string } {
  const flags = readP1865Flags(
    input.forceFlags ? { melExportPreview: input.forceFlags.melExportPreview } : undefined,
  );
  if (!flags.melExportPreview) {
    return { ok: false, preview: null, detail: "P186_MEL_EXPORT_PREVIEW flag is off" };
  }

  const refs = (input.sourceSystemReferences ?? []).filter(
    (r) => !/secret|ssn|bank|routing|account|password|token|sign.?url/i.test(r),
  );

  return {
    ok: true,
    detail: "Redacted MEL export preview",
    preview: {
      candidateIdHash: hashId(input.candidateId),
      jobOrProjectId: input.jobOrProjectId ?? null,
      workerClassification: input.workerClassification ?? null,
      recruiter: input.recruiter ?? null,
      dm: input.dm ?? null,
      requiredFieldReadinessPct: input.requiredFieldReadinessPct,
      missingFields: input.missingFields,
      sourceSystemReferences: refs,
      proposedMelAction:
        input.requiredFieldReadinessPct === 100 && input.missingFields.length === 0
          ? "queue_pending_review (no MEL write in P186.5)"
          : "block_until_requirements_complete",
    },
  };
}
