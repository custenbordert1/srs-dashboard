import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  DEFAULT_CANDIDATE_EXECUTION_POLICY,
  loadCandidateExecutionPolicy,
  saveCandidateExecutionPolicy,
} from "@/lib/candidate-automation-execution";
import type { CandidateExecutionPolicy } from "@/lib/candidate-automation-execution/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mergePolicy(
  current: CandidateExecutionPolicy,
  body: Partial<CandidateExecutionPolicy>,
): CandidateExecutionPolicy {
  return {
    ...current,
    ...body,
    paperwork: { ...current.paperwork, ...body.paperwork },
    escalation: { ...current.escalation, ...body.escalation },
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const policy = await loadCandidateExecutionPolicy();

  return NextResponse.json({
    ok: true,
    policy,
    defaults: DEFAULT_CANDIDATE_EXECUTION_POLICY,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<CandidateExecutionPolicy>;
  const current = await loadCandidateExecutionPolicy();
  const next = mergePolicy(current, body);

  if (next.maxEscalationsPerRun < 0 || next.maxEscalationsPerRun > 100) {
    return NextResponse.json(
      { ok: false, error: "maxEscalationsPerRun must be between 0 and 100." },
      { status: 400 },
    );
  }
  if (next.maxRetries < 0 || next.maxRetries > 10) {
    return NextResponse.json({ ok: false, error: "maxRetries must be between 0 and 10." }, { status: 400 });
  }
  if (next.escalationDelayHours < 1 || next.escalationDelayHours > 168) {
    return NextResponse.json(
      { ok: false, error: "escalationDelayHours must be between 1 and 168." },
      { status: 400 },
    );
  }

  const policy = await saveCandidateExecutionPolicy(next);

  return NextResponse.json({
    ok: true,
    policy,
  });
}
