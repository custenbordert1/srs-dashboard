import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { loadP253OpportunityPoints, resolveP253HomePoint } from "@/lib/p253-controlled-live-paperwork-send/refresh";
import { evaluateP235Proximity } from "@/lib/p235-controlled-newest-five-send/eligibility";
import { p240DisplayName } from "@/lib/p240-autonomous-new-applicant-pipeline/cohort";
import type { P260CandidateSnapshot } from "@/lib/p260-live-paperwork-workspace/types";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function isExpiredDropboxStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "expired" || s.includes("expired");
}

function looksManuallyRecovered(input: {
  candidateId: string;
  notes: string[];
  cwd?: string;
  flag?: boolean;
}): boolean {
  if (input.flag) return true;
  if (input.notes.some((n) => /manual(ly)?\s+recover|p255|recovered/i.test(n))) {
    return true;
  }
  const artifact = path.join(input.cwd ?? process.cwd(), "artifacts/p255-recovery-report.json");
  if (!existsSync(artifact)) return false;
  try {
    const parsed = JSON.parse(readFileSync(artifact, "utf8")) as {
      candidates?: Array<{ candidateId?: string; nowEligible?: boolean }>;
    };
    return Boolean(
      parsed.candidates?.some(
        (c) => c.candidateId === input.candidateId && c.nowEligible === true,
      ),
    );
  } catch {
    return false;
  }
}

/**
 * Pre-send refresh for one candidate: workflow, onboarding, Dropbox, distance/coverage.
 * Does not invent new eligibility stores — recomputes from authoritative sources.
 */
export async function refreshP260Candidate(input: {
  candidateId: string;
  allowNetworkGeocode?: boolean;
  manuallyRecovered?: boolean;
  cwd?: string;
}): Promise<P260CandidateSnapshot> {
  const candidateId = input.candidateId.trim();
  const [workflows, onboardingRecords, store, opportunityPoints] = await Promise.all([
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    readIngestionStore(),
    loadP253OpportunityPoints({ allowNetwork: input.allowNetworkGeocode === true }),
  ]);

  const wf = workflows[candidateId];
  const onboarding = onboardingRecords.find((r) => r.candidateId === candidateId) ?? null;
  const candidate =
    listIngestedCandidates(store).find((c) => c.candidateId === candidateId) ?? null;

  const name = p240DisplayName({
    firstName: candidate?.firstName,
    lastName: candidate?.lastName,
    email: candidate?.email ?? wf?.onboardingContactEmail,
    candidateId,
  });
  const email = String(candidate?.email ?? wf?.onboardingContactEmail ?? "").trim();
  const phone = String(candidate?.phone ?? "").trim();
  const city = String(candidate?.city ?? "").trim();
  const state = String(candidate?.state ?? "").trim();
  const zip = String(candidate?.zipCode ?? "").trim();
  const recruiter = String(wf?.assignedRecruiter ?? "Unassigned");
  const dm = String(wf?.assignedDM ?? "Unassigned");
  const signatureRequestId =
    String(wf?.signatureRequestId ?? onboarding?.signatureRequestId ?? "").trim() || null;

  let dropboxStatus: string | null = null;
  let priorExpiredPacket = false;
  if (signatureRequestId) {
    try {
      const remote = await getSignatureRequest(signatureRequestId);
      dropboxStatus = remote.rawStatus;
      if (isExpiredDropboxStatus(remote.rawStatus)) {
        priorExpiredPacket = true;
      }
      // Dropbox may surface expired via signer status codes.
      if (
        remote.signatures.some((s) => /expired/i.test(s.statusCode)) ||
        /expired/i.test(remote.rawStatus)
      ) {
        priorExpiredPacket = true;
        dropboxStatus = "expired";
      }
    } catch {
      dropboxStatus = "lookup_failed";
    }
  }

  const notes = (wf?.notes ?? []).map((n) => (typeof n === "string" ? n : String(n)));
  if (notes.some((n) => /expired/i.test(n))) priorExpiredPacket = true;

  let nearestMiles: number | null = null;
  let coverageKnown = false;
  const home = await resolveP253HomePoint({
    city,
    state,
    zip,
    allowNetwork: input.allowNetworkGeocode === true,
  });
  const proximity = evaluateP235Proximity({
    home,
    assignedDm: dm,
    expectedDm: dm,
    jobCity: city,
    jobState: state,
    opportunities: opportunityPoints,
  });
  nearestMiles = proximity.nearestMiles;
  coverageKnown = proximity.coverageKnown;

  const manuallyRecovered = looksManuallyRecovered({
    candidateId,
    notes,
    cwd: input.cwd,
    flag: input.manuallyRecovered,
  });

  return {
    candidateId,
    name,
    email,
    phone,
    workflowStatus: String(wf?.workflowStatus ?? ""),
    paperworkStatus: String(wf?.paperworkStatus ?? "not_sent"),
    signatureRequestId,
    paperworkSentAt: wf?.paperworkSentAt ?? null,
    paperworkViewedAt: wf?.paperworkViewedAt ?? null,
    paperworkSignedAt: wf?.paperworkSignedAt ?? null,
    recruiter,
    districtManager: dm,
    templateKey: String(wf?.paperworkTemplateKey ?? "onboarding_packet"),
    nearestMiles,
    coverageKnown,
    dropboxStatus,
    priorExpiredPacket,
    manuallyRecovered,
  };
}
