import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  DEFAULT_CANDIDATE_ONBOARDING_POLICY,
  loadCandidateOnboardingPolicy,
  saveCandidateOnboardingPolicy,
} from "@/lib/candidate-onboarding-engine";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mergePolicy(
  current: CandidateOnboardingPolicy,
  body: Partial<CandidateOnboardingPolicy>,
): CandidateOnboardingPolicy {
  return {
    ...current,
    ...body,
    send: { ...current.send, ...body.send },
    reminders: { ...current.reminders, ...body.reminders },
    escalation: { ...current.escalation, ...body.escalation },
    reminderHours: body.reminderHours ?? current.reminderHours,
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  return NextResponse.json({
    ok: true,
    policy: await loadCandidateOnboardingPolicy(),
    defaults: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<CandidateOnboardingPolicy>;
  const next = mergePolicy(await loadCandidateOnboardingPolicy(), body);

  if (next.maxEscalationsPerRun < 0 || next.maxEscalationsPerRun > 100) {
    return NextResponse.json(
      { ok: false, error: "maxEscalationsPerRun must be between 0 and 100." },
      { status: 400 },
    );
  }
  if (next.maxSendsPerRun < 0 || next.maxSendsPerRun > 100) {
    return NextResponse.json(
      { ok: false, error: "maxSendsPerRun must be between 0 and 100." },
      { status: 400 },
    );
  }

  const policy = await saveCandidateOnboardingPolicy(next);
  return NextResponse.json({ ok: true, policy });
}
