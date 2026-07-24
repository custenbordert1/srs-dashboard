import { getSignatureRequest } from "@/lib/dropbox-sign";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { P253IntegrityCheck } from "@/lib/p253-controlled-live-paperwork-send/types";

export async function verifyP253Integrity(input: {
  createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }>;
}): Promise<P253IntegrityCheck> {
  const createdRequestIds = input.createdRequestIds.map((c) => c.signatureRequestId);
  const verifiedRequestIds: string[] = [];
  const missingRequestIds: string[] = [];
  const workflowMismatches: P253IntegrityCheck["workflowMismatches"] = [];

  const workflows = await getCandidateWorkflowState();
  const seen = new Set<string>();
  let duplicatePacketsDetected = 0;

  for (const entry of input.createdRequestIds) {
    if (seen.has(entry.signatureRequestId)) {
      duplicatePacketsDetected += 1;
      continue;
    }
    seen.add(entry.signatureRequestId);

    try {
      const remote = await getSignatureRequest(entry.signatureRequestId);
      if (remote?.signatureRequestId) {
        verifiedRequestIds.push(entry.signatureRequestId);
      } else {
        missingRequestIds.push(entry.signatureRequestId);
      }
    } catch {
      missingRequestIds.push(entry.signatureRequestId);
    }

    const wf = workflows[entry.candidateId];
    const sig = String(wf?.signatureRequestId ?? "").trim();
    const statusOk =
      wf?.workflowStatus === "Paperwork Sent" ||
      wf?.paperworkStatus === "sent" ||
      wf?.paperworkStatus === "viewed";
    if (!wf || sig !== entry.signatureRequestId || !statusOk) {
      workflowMismatches.push({
        candidateId: entry.candidateId,
        expectedSignatureRequestId: entry.signatureRequestId,
        workflowStatus: String(wf?.workflowStatus ?? ""),
        paperworkStatus: String(wf?.paperworkStatus ?? ""),
        signatureRequestId: sig || null,
      });
    }
  }

  // Cross-check: no two created candidates share a signature request id.
  const bySig = new Map<string, string[]>();
  for (const entry of input.createdRequestIds) {
    const list = bySig.get(entry.signatureRequestId) ?? [];
    list.push(entry.candidateId);
    bySig.set(entry.signatureRequestId, list);
  }
  for (const [, ids] of bySig) {
    if (ids.length > 1) duplicatePacketsDetected += ids.length - 1;
  }

  const verified =
    missingRequestIds.length === 0 &&
    workflowMismatches.length === 0 &&
    duplicatePacketsDetected === 0;

  return {
    verified,
    createdRequestIds,
    verifiedRequestIds,
    missingRequestIds,
    workflowMismatches,
    duplicatePacketsDetected,
    detail: verified
      ? `Integrity OK — verified ${verifiedRequestIds.length}/${createdRequestIds.length} Dropbox request(s).`
      : `Integrity issues: missing=${missingRequestIds.length} mismatches=${workflowMismatches.length} duplicates=${duplicatePacketsDetected}`,
  };
}
