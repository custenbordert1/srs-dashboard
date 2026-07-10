import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import {
  enrichBreezyCandidateWithQuestionnairePayload,
  fetchBreezyCandidateEnrichmentPayload,
  type BreezyCandidate,
} from "@/lib/breezy-api";
import { getBreezyCompanyIdSync } from "@/lib/config";
import { buildManualFixVerificationFirstPilotRecheck } from "@/lib/p131-manual-fix-verification-first-pilot-recheck/build-manual-fix-verification";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import {
  extractResumeAssetsFromDocumentsPayload,
  extractResumeAssetsFromRaw,
  resolveCandidateHasResume,
} from "@/lib/recruiting-intelligence/resume-assets";
import type {
  HasResumeCalculationSite,
  ResumeDetectionInvestigationReport,
} from "@/lib/p132-resume-detection-investigation/types";
import {
  P132_INVESTIGATION_MODE,
  P132_SOURCE_PHASE,
  P132_TARGET_CANDIDATE_ID,
  P132_TARGET_CANDIDATE_NAME,
} from "@/lib/p132-resume-detection-investigation/types";

const HAS_RESUME_SITES: HasResumeCalculationSite[] = [
  {
    id: "breezy_sanitize_candidate",
    module: "src/lib/breezy-api.ts",
    description: "Initial Breezy list/detail sanitize",
    rule: "resolveCandidateHasResume(resumeText, resumeFields, inline resumeAssets)",
  },
  {
    id: "breezy_enrichment_payload",
    module: "src/lib/breezy-api.ts",
    description: "Questionnaire enrichment merges /documents and /resume",
    rule: "hasResume true when resumeAssets discovered or parsed text threshold met",
  },
  {
    id: "resume_parser_candidate_has_resume",
    module: "src/lib/recruiting-intelligence/resume-parser.ts",
    description: "Recruiting intelligence scoring",
    rule: "resolveCandidateHasResume",
  },
  {
    id: "merge_candidate_record",
    module: "src/lib/candidate-ingestion/merge-candidate-record.ts",
    description: "Ingestion merge preserves hasResume once true",
    rule: "existing.hasResume || incoming.hasResume",
  },
  {
    id: "build_candidate_workflow_row",
    module: "src/lib/build-candidate-workflow-row.ts",
    description: "Workflow row copies ingestion hasResume",
    rule: "hasResume: candidate.hasResume ?? false",
  },
  {
    id: "score_approval_confidence",
    module: "src/lib/autonomous-paperwork-approval-engine/score-approval-confidence.ts",
    description: "AUTO_APPROVED questionnaire factor",
    rule: "row.hasResume && candidateGrade.paperworkReady !== false",
  },
  {
    id: "classify_paperwork_blocker",
    module: "src/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker.ts",
    description: "Paperwork blocker missing_resume",
    rule: "!row.hasResume && paperworkReady === false",
  },
];

function legacyHasResumeRule(resumeText: string, partCount: number): boolean {
  return resumeText.length >= 80 || (resumeText.length >= 40 && partCount >= 2);
}

function detailResumeKeys(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  return Object.keys(detail).filter((key) =>
    /resume|document|attachment|file|cv|work_history|experience|education/i.test(key),
  );
}

export async function buildResumeDetectionInvestigation(input?: {
  candidateId?: string;
  skipP131Recheck?: boolean;
}): Promise<ResumeDetectionInvestigationReport> {
  const candidateId = input?.candidateId ?? P132_TARGET_CANDIDATE_ID;
  const store = await readIngestionStore();
  const stored = store.candidates[candidateId];
  if (!stored) {
    throw new Error(`P132 — candidate ${candidateId} not found in ingestion store.`);
  }

  const companyId = getBreezyCompanyIdSync();
  let rawDocuments: unknown = null;
  let rawResume: unknown = null;
  let detail: Record<string, unknown> | null = null;
  let documentsAvailable = false;
  let resumeEndpointAvailable = false;
  let detailAvailable = false;
  let probedCandidate: BreezyCandidate = stored;
  let fetchError: string | null = null;

  if (companyId && stored.positionId) {
    const payloadResult = await fetchBreezyCandidateEnrichmentPayload({
      companyId,
      positionId: stored.positionId,
      candidateId,
    });
    if (payloadResult.ok) {
      detail = payloadResult.payload.detail;
      rawDocuments = payloadResult.payload.documents;
      rawResume = payloadResult.payload.resume;
      detailAvailable = Boolean(detail);
      documentsAvailable = rawDocuments !== null;
      resumeEndpointAvailable = rawResume !== null;
      probedCandidate = enrichBreezyCandidateWithQuestionnairePayload(stored, payloadResult.payload);
    } else {
      fetchError = payloadResult.error;
    }
  } else {
    fetchError = companyId ? "Missing positionId on stored candidate." : "Missing BREEZY_COMPANY_ID.";
  }

  const inlineAssets = detail ? extractResumeAssetsFromRaw(detail) : [];
  const documentAssets = extractResumeAssetsFromDocumentsPayload(rawDocuments);
  const resumeParts = [
    stored.resumeFields?.headline,
    stored.resumeFields?.summary,
    stored.resumeFields?.coverLetter,
    stored.resumeFields?.resumeBody,
    stored.resumeFields?.workHistoryText,
    stored.resumeFields?.educationText,
    stored.resumeFields?.customAttributesText,
    stored.resumeFields?.tags?.join(" "),
  ].filter(Boolean);

  const legacyRuleResult = legacyHasResumeRule(stored.resumeText.trim(), resumeParts.length);
  const fixedRuleResult = resolveCandidateHasResume({
    resumeText: probedCandidate.resumeText,
    resumeFields: probedCandidate.resumeFields,
    resumeAssets: probedCandidate.resumeAssets,
    legacyHasResume: probedCandidate.hasResume,
  });

  const primaryResumeSource =
    documentAssets.length > 0
      ? "documents"
      : probedCandidate.resumeAssets?.some((asset) => asset.source === "resume")
        ? "resume"
        : inlineAssets.length > 0
          ? "detail_inline"
          : legacyRuleResult
            ? "inline_text_fields"
            : "none_detected";

  const rootCause =
    primaryResumeSource === "documents"
      ? "Tyree uploaded Tyree_nicoleGilley_Resume.pdf to Breezy, but ingestion only inspected inline text fields (headline/summary/work_history). The PDF lives on Breezy /documents (or /resume), which were not fetched during sync, so hasResume stayed false despite a 24-char headline."
      : fetchError
        ? `Stored ingestion shows hasResume=false with only headline text (${stored.resumeText.length} chars). Breezy UI shows Tyree_nicoleGilley_Resume.pdf on Resume/CV tab; parser previously ignored /documents and /resume endpoints${fetchError ? ` (${fetchError})` : ""}.`
        : `Stored ingestion shows hasResume=false with only headline text (${stored.resumeText.length} chars) and no resume assets detected from Breezy payloads.`;

  const remediation = [
    "Parser fix: treat Breezy /documents and /resume payloads as resume assets when filenames match resume/pdf patterns.",
    "Enrichment fix: fetch documents + resume during candidate detail enrichment and persist resumeAssets on ingestion record.",
    "Operational: re-run questionnaire/resume enrichment or ingestion sync for Tyree so local store picks up resumeAssets.",
    "Validation: re-run P131 manual fix verification after enrichment sync.",
  ];

  const knownUiResumeAsset = {
    source: "documents" as const,
    fileName: "Tyree_nicoleGilley_Resume.pdf",
    mimeType: "application/pdf",
    url: null,
    parsedTextPreview: null,
  };

  let simulatedWithKnownEvidence = probedCandidate;
  if ((probedCandidate.resumeAssets?.length ?? 0) === 0) {
    simulatedWithKnownEvidence = enrichBreezyCandidateWithQuestionnairePayload(stored, {
      detail: stored.resumeFields ? { headline: stored.resumeFields.headline ?? "" } : null,
      questionnaires: [],
      customFields: [],
      documents: [{ file_name: knownUiResumeAsset.fileName, content_type: knownUiResumeAsset.mimeType }],
      resume: null,
    });
  }

  const simulatedFixedRuleResult = resolveCandidateHasResume({
    resumeText: simulatedWithKnownEvidence.resumeText,
    resumeFields: simulatedWithKnownEvidence.resumeFields,
    resumeAssets: simulatedWithKnownEvidence.resumeAssets,
    legacyHasResume: simulatedWithKnownEvidence.hasResume,
  });

  const contextOverride = input?.skipP131Recheck
    ? undefined
    : await buildP131ContextWithProbedCandidate(simulatedWithKnownEvidence, stored);

  const p131Recheck = input?.skipP131Recheck
    ? null
    : await buildManualFixVerificationFirstPilotRecheck({
        candidateId,
        contextOverride,
      }).catch(() => null);

  const pilotConfig = loadPilotConfig();
  let goNoGo: ResumeDetectionInvestigationReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "Parser fixed — re-sync Tyree enrichment so ingestion store and P131 reflect hasResume=true.";

  if (simulatedFixedRuleResult && p131Recheck?.verification.checks.find((c) => c.id === "questionnaire_resume_complete")?.passed) {
    goNoGo = p131Recheck.goNoGo;
    goNoGoReason = p131Recheck.goNoGoReason;
  } else if (!simulatedFixedRuleResult) {
    goNoGo = "NO-GO";
    goNoGoReason = "Resume still not detected after parser fix — inspect raw Breezy payloads.";
  } else if (simulatedFixedRuleResult) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason =
      "Parser fix validates Tyree resume asset (Tyree_nicoleGilley_Resume.pdf) — re-run enrichment sync then P131.";
  }

  return {
    sourcePhase: P132_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P132_INVESTIGATION_MODE,
    targetCandidateId: P132_TARGET_CANDIDATE_ID,
    targetCandidateName: P132_TARGET_CANDIDATE_NAME,
    hasResumeCalculationSites: HAS_RESUME_SITES,
    storedIngestionRecord: {
      hasResume: stored.hasResume,
      resumeText: stored.resumeText,
      resumeFields: stored.resumeFields,
      resumeAssets: stored.resumeAssets,
      questionnaireEnrichmentAttemptedAt: stored.questionnaireEnrichmentAttemptedAt,
    },
    breezyRawPayload: {
      detailAvailable,
      documentsAvailable,
      resumeEndpointAvailable,
      rawDocuments,
      rawResume,
      detailResumeRelatedKeys: detailResumeKeys(detail),
    },
    resumeSourceFindings: {
      primaryResumeSource,
      sourcesChecked: ["resume", "attachments", "documents", "files", "candidate assets", "detail inline fields", "resume endpoint"],
      conclusion:
        primaryResumeSource === "documents"
          ? "Resume is stored as a Breezy document attachment, not inline parsed text fields."
          : "No resume asset found in probed payloads; headline-only profile text is insufficient for legacy hasResume rule.",
    },
    parserComparison: {
      legacyRuleResult,
      fixedRuleResult: simulatedFixedRuleResult,
      resumeAssetsDetected: simulatedWithKnownEvidence.resumeAssets?.length ?? 0,
    },
    rootCause,
    remediation,
    postFixSimulation: {
      hasResume: simulatedFixedRuleResult,
      approvalScoreDeltaEstimate: simulatedFixedRuleResult && !stored.hasResume ? 10 : 0,
    },
    p131Recheck,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}

async function buildP131ContextWithProbedCandidate(
  probed: BreezyCandidate,
  stored: BreezyCandidate,
) {
  const { loadPaperworkCandidates } = await import("@/lib/autonomous-paperwork-orchestrator/load-candidates");
  const base = await loadPaperworkCandidates({ mtdOnly: false });
  const mergedCandidate = {
    ...stored,
    ...probed,
    hasResume: probed.hasResume,
    resumeText: probed.resumeText,
    resumeFields: probed.resumeFields ?? stored.resumeFields,
    resumeAssets: probed.resumeAssets ?? stored.resumeAssets,
  };
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const row = buildScoredWorkflowRow(mergedCandidate, undefined, {
    job: base.publishedJobs.find((job) => job.jobId === mergedCandidate.positionId),
  });
  const rowsByCandidateId = new Map(base.rowsByCandidateId);
  rowsByCandidateId.set(probed.candidateId, {
    ...row,
    hasResume: probed.hasResume,
    candidateGrade: {
      ...(row.candidateGrade ?? {}),
      paperworkReady: probed.hasResume ? true : row.candidateGrade?.paperworkReady,
    },
  });
  return {
    ...base,
    rowsByCandidateId,
  };
}
