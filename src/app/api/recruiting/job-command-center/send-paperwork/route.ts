import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  P260_CONFIRMATION_PHRASE,
  runP260LivePaperworkSend,
  type P260RunInput,
} from "@/lib/p260-live-paperwork-workspace";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/recruiting/job-command-center/send-paperwork
 *
 * Thin Job Command Center adapter to the production Dropbox Sign send engine.
 * One candidate at a time. Fail-closed on quota 0 / missing credentials.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "jcc_send_paperwork",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
  }

  if (Array.isArray(input.candidateIds) && input.candidateIds.length > 1) {
    return NextResponse.json(
      { ok: false, error: "Bulk send is forbidden. One candidate at a time only." },
      { status: 400 },
    );
  }

  const mode = input.mode === "send" ? "send" : "preview";
  const confirmationPhrase =
    typeof input.confirmationPhrase === "string" ? input.confirmationPhrase : undefined;
  const typedConfirmation =
    typeof input.typedConfirmation === "string" ? input.typedConfirmation : undefined;

  if (mode === "send" && input.cancel !== true) {
    const phrase = (typedConfirmation ?? confirmationPhrase ?? "").trim();
    if (phrase !== P260_CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          ok: false,
          error: `confirmationPhrase must be exactly: "${P260_CONFIRMATION_PHRASE}"`,
          requiredPhrase: P260_CONFIRMATION_PHRASE,
        },
        { status: 400 },
      );
    }
  }

  const runInput: P260RunInput = {
    candidateId,
    mode,
    confirmationPhrase: confirmationPhrase ?? typedConfirmation,
    typedConfirmation,
    nonstandardOverride: input.nonstandardOverride === true,
    manuallyRecovered: input.manuallyRecovered === true,
    cancel: input.cancel === true,
    byUserId: session.userId,
    allowNetworkGeocode: input.allowNetworkGeocode === true,
  };

  try {
    const result = await runP260LivePaperworkSend(runInput);

    if (result.mode === "send" && result.ok && "signatureRequestId" in result) {
      auditFromSession(session, {
        action: "jcc_send_paperwork",
        entityType: "candidate_workflow",
        entityId: candidateId,
        metadata: {
          signatureRequestId: result.signatureRequestId,
          source: "Job Command Center",
          verified: result.verified,
        },
      });
    }

    const httpStatus =
      result.mode === "preview"
        ? 200
        : result.mode === "cancelled"
          ? 200
          : result.ok
            ? 200
            : result.aborted
              ? 409
              : 502;

    return NextResponse.json(
      {
        ok: result.ok,
        result,
        requiredPhrase: P260_CONFIRMATION_PHRASE,
      },
      { status: httpStatus },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "P260 send failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    phase: "P260-live-paperwork-workspace",
    endpoint: "POST /api/recruiting/job-command-center/send-paperwork",
    requiredPhrase: P260_CONFIRMATION_PHRASE,
    rules: {
      oneCandidateAtATime: true,
      bulkForbidden: true,
      failClosedOnQuotaZero: true,
      source: "Job Command Center",
    },
  });
}
