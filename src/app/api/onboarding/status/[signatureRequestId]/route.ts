import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  applyCandidatePaperworkStatus,
  findCandidateIdBySignatureRequest,
  getCandidateWorkflowState,
} from "@/lib/candidate-workflow-store";
import { DropboxSignError, getSignatureRequest } from "@/lib/dropbox-sign";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ signatureRequestId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "onboarding_status_check",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const { signatureRequestId } = await context.params;
  const id = signatureRequestId?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "signatureRequestId is required." }, { status: 400 });
  }

  try {
    const signature = await getSignatureRequest(id);
    const paperworkStatus = mapSignatureRequestToPaperworkStatus(signature);
    const workflows = await getCandidateWorkflowState();
    const candidateId = findCandidateIdBySignatureRequest(workflows, id);

    let workflow = candidateId
      ? workflows[candidateId]
      : undefined;

    if (candidateId) {
      workflow = await applyCandidatePaperworkStatus({
        candidateId,
        signatureRequestId: id,
        paperworkStatus,
        byUserId: session.userId,
      });
      auditFromSession(session, {
        action: "onboarding_status_check",
        entityType: "candidate_workflow",
        entityId: candidateId,
        metadata: { signatureRequestId: id, paperworkStatus },
      });
    }

    return NextResponse.json({
      ok: true,
      signatureRequestId: id,
      signingStatus: signature.rawStatus,
      isComplete: signature.isComplete,
      isDeclined: signature.isDeclined,
      paperworkStatus,
      candidateId: candidateId ?? null,
      workflow,
    });
  } catch (error) {
    const message =
      error instanceof DropboxSignError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to check signature status.";
    const status = error instanceof DropboxSignError && error.code === "missing_api_key" ? 503 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
