import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildCandidateContextFromWorkflow,
  buildRecommendHirePreview,
  buildRecommendationQueues,
  detectOnboardingBypassFindings,
  executeRecommendHire,
  executeSiblingWorkflowAction,
  P188_1_SOURCE_PHASE,
  previewBulkRecommendHire,
  readP1881Flags,
  validateRecommendHire,
  type P1881AllowedRole,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p188-recommend-hire";

function mapRole(role: string): P1881AllowedRole | null {
  if (role === "recruiter" || role === "dm" || role === "executive") return role;
  if (role === "operator") return "operator";
  return null;
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p188_recommend_hire_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1881Flags();
  if (!flags.recommendationUi && !flags.bypassFindingsDashboard) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P188_1_SOURCE_PHASE,
      message: "P188.1 recommendation UI / bypass dashboard flags are off",
      flags,
      safety: {
        productionWrites: 0,
        approvals: 0,
        paperworkSends: 0,
        melWrites: 0,
      },
    });
  }

  const workflows = Object.values(await getCandidateWorkflowState());
  const bypass = flags.bypassFindingsDashboard
    ? detectOnboardingBypassFindings(workflows, { bypassFindingsDashboard: true })
    : [];
  const queues = flags.recommendationUi
    ? buildRecommendationQueues({
        workflows,
        bypassFindings: bypass,
        actorRole: guard.session.role,
      })
    : null;

  return NextResponse.json({
    ok: true,
    enabled: true,
    sourcePhase: P188_1_SOURCE_PHASE,
    readOnly: true,
    flags,
    queues: queues
      ? Object.fromEntries(
          Object.entries(queues).map(([k, items]) => [
            k,
            { count: items.length, sample: items.slice(0, 8) },
          ]),
        )
      : null,
    bypassFindingsCount: bypass.length,
    safety: {
      productionWrites: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
      p187AuthorityEnabled: false,
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p188_recommend_hire_action",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, `${ROUTE}:post`);

  const flags = readP1881Flags();
  if (!flags.recommendationApi) {
    return NextResponse.json(
      {
        ok: false,
        error: "P188_RECOMMENDATION_API flag is off",
        flags,
      },
      { status: 403 },
    );
  }

  const role = mapRole(guard.session.role);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Role not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    candidateId?: string;
    reason?: string;
    note?: string;
    jobId?: string;
    jobLabel?: string;
    previewOnly?: boolean;
    confirmed?: boolean;
    expectedProductionRecordVersion?: string;
    memberIds?: string[];
    reasonsById?: Record<string, string>;
  };

  const action = body.action ?? "recommend_hire";
  const workflows = await getCandidateWorkflowState();

  if (action === "bulk_preview") {
    const ids = body.memberIds ?? [];
    const members = ids.map((id) => {
      const wf = workflows[id];
      const context = buildCandidateContextFromWorkflow(wf, id, {
        jobId: body.jobId,
        jobLabel: body.jobLabel,
        jobResolved: Boolean(body.jobId),
      });
      return {
        candidateId: id,
        reason: body.reasonsById?.[id] ?? body.reason ?? "Bulk recommend hire",
        context,
      };
    });
    const preview = previewBulkRecommendHire({
      members,
      actor: guard.session.userId,
      role,
      forceFlags: { bulkRecommendationPreview: flags.bulkRecommendationPreview },
    });
    return NextResponse.json({ ok: !("reason" in preview && preview.ok === false), preview });
  }

  if (
    action === "return_for_more_review" ||
    action === "mark_not_qualified" ||
    action === "place_on_hold"
  ) {
    if (!body.candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
    }
    const result = await executeSiblingWorkflowAction({
      action,
      candidateId: body.candidateId,
      actor: guard.session.userId,
      role,
      note: body.note,
      forceFlags: { recommendationApi: true },
    });
    return NextResponse.json({ ok: result.ok, result });
  }

  if (!body.candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
  }

  const wf = workflows[body.candidateId];
  const context = buildCandidateContextFromWorkflow(wf, body.candidateId, {
    jobId: body.jobId,
    jobLabel: body.jobLabel,
    jobResolved: Boolean(body.jobId),
    expectedProductionRecordVersion: body.expectedProductionRecordVersion ?? null,
  });
  const reason = body.reason ?? "";
  const validation = validateRecommendHire({
    actor: guard.session.userId,
    role,
    reason,
    context,
  });
  const preview = buildRecommendHirePreview({ context, validation, reason });

  if (body.previewOnly || !body.confirmed) {
    return NextResponse.json({
      ok: true,
      previewOnly: true,
      preview,
      validation,
      executed: false,
    });
  }

  const result = await executeRecommendHire(
    {
      candidateId: body.candidateId,
      actor: guard.session.userId,
      role,
      reason,
      source: "api",
      expectedProductionRecordVersion: body.expectedProductionRecordVersion,
      context,
    },
    {},
    { recommendationApi: true },
  );

  return NextResponse.json({
    ok: result.ok,
    result,
    preview,
    safety: {
      paperworkSendsAttempted: result.paperworkSendsAttempted,
      approvalsAttempted: result.approvalsAttempted,
      melWritesAttempted: result.melWritesAttempted,
    },
  });
}
