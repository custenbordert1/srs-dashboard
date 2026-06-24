import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  loadCandidateAutomationPolicy,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine";
import type { CandidateAutomationMode, CandidateAutomationPolicy } from "@/lib/candidate-automation-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODES = new Set<CandidateAutomationMode>(["manual", "semi-automatic", "automatic"]);

function mergePolicy(
  current: CandidateAutomationPolicy,
  body: Partial<CandidateAutomationPolicy>,
): CandidateAutomationPolicy {
  return {
    ...current,
    ...body,
    assign: { ...current.assign, ...body.assign },
    actions: { ...current.actions, ...body.actions },
    progression: { ...current.progression, ...body.progression },
    execution: { ...current.execution, ...body.execution },
    escalation: { ...current.escalation, ...body.escalation },
    rebalance: { ...current.rebalance, ...body.rebalance },
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const policy = await loadCandidateAutomationPolicy();

  return NextResponse.json({
    ok: true,
    policy,
    defaults: DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<CandidateAutomationPolicy>;
  const current = await loadCandidateAutomationPolicy();
  const next = mergePolicy(current, body);

  if (body.mode && !MODES.has(body.mode)) {
    return NextResponse.json({ ok: false, error: "Invalid automation mode." }, { status: 400 });
  }

  if (next.rebalance.enabled) {
    return NextResponse.json(
      { ok: false, error: "Rebalance controls are disabled until P65.3." },
      { status: 400 },
    );
  }

  const policy = await saveCandidateAutomationPolicy(next);

  return NextResponse.json({
    ok: true,
    policy,
  });
}
