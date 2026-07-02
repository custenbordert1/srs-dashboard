/**
 * P132 — Re-run Tyree resume enrichment (read-only Breezy fetch, local store update).
 * Usage: npx tsx scripts/p132-enrich-tyree-resume.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  enrichBreezyCandidateWithQuestionnairePayload,
  fetchBreezyCandidateEnrichmentPayload,
  resolveBreezyCompany,
} from "@/lib/breezy-api";
import { enrichCandidateWithQuestionnaireDetail } from "@/lib/candidate-ingestion/enrich-candidate-questionnaires";
import { readIngestionStore, writeIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { mergeCandidateRecord } from "@/lib/candidate-ingestion/merge-candidate-record";
import { P132_TARGET_CANDIDATE_ID } from "@/lib/p132-resume-detection-investigation/types";

function loadEnvLocal(): void {
  const envPath = resolve(".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const company = await resolveBreezyCompany();
  if (!company.ok) throw new Error(company.error);

  const store = await readIngestionStore();
  const existing = store.candidates[P132_TARGET_CANDIDATE_ID];
  if (!existing?.positionId) {
    throw new Error(`P132 — candidate ${P132_TARGET_CANDIDATE_ID} not found in ingestion store.`);
  }

  let result = await enrichCandidateWithQuestionnaireDetail({
    candidate: existing,
    companyId: company.companyId,
  });

  if (!result.attempted && existing.positionId) {
    const payloadResult = await fetchBreezyCandidateEnrichmentPayload({
      companyId: company.companyId,
      positionId: existing.positionId,
      candidateId: P132_TARGET_CANDIDATE_ID,
    });
    if (!payloadResult.ok) throw new Error(payloadResult.error);

    const enriched = enrichBreezyCandidateWithQuestionnairePayload(existing, payloadResult.payload);
    const hasResumeAssets = (enriched.resumeAssets?.length ?? 0) > 0;
    result = {
      candidateId: P132_TARGET_CANDIDATE_ID,
      candidate: {
        ...enriched,
        questionnaireEnrichmentAttemptedAt: new Date().toISOString(),
        hasResume: enriched.hasResume || hasResumeAssets,
      },
      enriched: hasResumeAssets || enriched.hasResume || (enriched.questionnaireAnswers?.length ?? 0) > 0,
      attempted: true,
      empty: (enriched.questionnaireAnswers?.length ?? 0) === 0,
      failed: false,
    };
  }

  if (result.failed) throw new Error(result.error ?? "Tyree enrichment failed.");

  const merged = mergeCandidateRecord(existing, result.candidate);
  const nextStore = {
    ...store,
    candidates: {
      ...store.candidates,
      [P132_TARGET_CANDIDATE_ID]: merged,
    },
  };
  await writeIngestionStore(nextStore);

  console.log(
    JSON.stringify(
      {
        ok: true,
        candidateId: P132_TARGET_CANDIDATE_ID,
        hasResume: merged.hasResume,
        resumeAssetsCount: merged.resumeAssets?.length ?? 0,
        resumeAssets: merged.resumeAssets,
        enriched: result.enriched,
        attempted: result.attempted,
        breezyWrites: false,
        executeBatchCalled: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
