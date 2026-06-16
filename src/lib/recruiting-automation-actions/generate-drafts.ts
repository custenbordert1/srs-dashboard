import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { buildCandidateReEngagementIntelligenceSnapshot } from "@/lib/candidate-re-engagement-intelligence/build-snapshot";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import {
  getMessageTemplate,
  renderMessageTemplate,
} from "@/lib/recruiting-automation-actions/message-templates";
import {
  appendAuditEntry,
  buildAutomationRecord,
} from "@/lib/recruiting-automation-actions/store";
import type {
  FollowUpCampaignType,
  JobRefreshDraftPayload,
  PostingDraftPayload,
  RecruitingAutomationRecord,
  SourceRecommendationRef,
} from "@/lib/recruiting-automation-actions/types";
import type { AuthSession } from "@/lib/auth/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";

function sourceFromAutopilot(rec: AutopilotRecommendation): SourceRecommendationRef {
  return {
    recommendationId: rec.id,
    recommendationType: rec.kind,
    source: "autopilot",
    label: rec.title,
  };
}

function priorityFromScore(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function buildJobRefreshDraftFromRecommendation(
  rec: AutopilotRecommendation,
): RecruitingAutomationRecord {
  const location =
    rec.entityType === "job-posting"
      ? rec.entityLabel
      : rec.dmName ?? rec.entityLabel;
  const payload: JobRefreshDraftPayload = {
    title: rec.title,
    location,
    project: rec.entityType === "project" ? rec.entityLabel : null,
    reason: rec.reasoning,
    expectedApplicantGain: rec.opportunity.estimatedCandidateGain,
    priority: priorityFromScore(rec.impactScore),
    timing: rec.horizon === "quick-win" ? "Within 24 hours" : "This week",
    jobId: rec.entityType === "job-posting" ? rec.entityId : null,
  };
  return buildAutomationRecord({
    actionType: "job-refresh",
    owner: rec.dmName ?? "Operations",
    reason: rec.reasoning,
    expectedImpact: `+${rec.opportunity.estimatedCandidateGain} applicants · +${rec.opportunity.estimatedCoverageGain}% coverage`,
    payload,
    sourceRecommendation: sourceFromAutopilot(rec),
    territory: rec.entityType === "territory" ? rec.entityLabel : rec.dmName ?? null,
    dmName: rec.dmName ?? null,
  });
}

export function buildPostingDraftFromTerritory(input: {
  territory: string;
  state: string;
  city: string;
  openCalls: number;
  activeJobs: number;
  coveragePercent: number;
  project?: string | null;
  recommendationId?: string;
}): RecruitingAutomationRecord {
  const dmName = getDmForState(input.state) ?? null;
  const payload: PostingDraftPayload = {
    title: "Retail Merchandiser",
    city: input.city,
    state: input.state,
    project: input.project ?? null,
    pay: null,
    radius: 35,
    priority: input.openCalls >= 10 ? "critical" : input.openCalls >= 5 ? "high" : "medium",
    coverageImpact: `+${Math.max(3, Math.round((100 - input.coveragePercent) * 0.15))}% coverage from new posting`,
    territory: input.territory,
  };
  return buildAutomationRecord({
    actionType: "create-posting",
    owner: dmName ?? "Operations",
    reason: `${input.openCalls} open calls with only ${input.activeJobs} active posting(s) in ${input.territory}.`,
    expectedImpact: payload.coverageImpact,
    payload,
    sourceRecommendation: input.recommendationId
      ? {
          recommendationId: input.recommendationId,
          recommendationType: "expand-recruiting-radius",
          source: "autopilot",
          label: "Create posting for coverage gap",
        }
      : null,
    territory: input.territory,
    dmName,
  });
}

function mapSourceToCampaignType(source: string): FollowUpCampaignType {
  if (source === "stalled") return "stalled-candidate";
  if (source === "previous-applicant") return "previous-applicant";
  if (source === "past-worker") return "former-worker";
  if (source === "unfinished-onboarding") return "incomplete-onboarding";
  if (source === "abandoned") return "interview-no-response";
  return "stalled-candidate";
}

export function buildCampaignDraftFromOpportunity(input: {
  candidateId: string;
  candidateName: string;
  city: string;
  state: string;
  source: string;
  owner: string;
  reason: string;
  expectedPlacements: number;
  expectedCoverageGain: number;
  recommendationId?: string;
}): RecruitingAutomationRecord {
  const campaignType = mapSourceToCampaignType(input.source);
  const template = getMessageTemplate(campaignType);
  const [firstName] = input.candidateName.split(" ");
  const message = renderMessageTemplate(template.body, {
    firstName,
    recruiterName: input.owner,
    city: input.city,
  });
  return buildAutomationRecord({
    actionType: "follow-up-campaign",
    owner: input.owner,
    reason: input.reason,
    expectedImpact: `+${input.expectedPlacements} placements · +${input.expectedCoverageGain}% coverage`,
    payload: {
      campaignType,
      candidates: [
        {
          candidateId: input.candidateId,
          candidateName: input.candidateName,
          city: input.city,
          state: input.state,
        },
      ],
      reason: input.reason,
      message,
      outreachMethod: "email",
      owner: input.owner,
      expectedPlacements: input.expectedPlacements,
      expectedCoverageGain: input.expectedCoverageGain,
    },
    sourceRecommendation: input.recommendationId
      ? {
          recommendationId: input.recommendationId,
          recommendationType: "create-candidate-outreach-campaign",
          source: "candidate-recovery",
          label: template.label,
        }
      : null,
    territory: input.state,
    dmName: getDmForState(input.state) ?? null,
  });
}

export function generateDraftsFromIntelligence(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  existing: RecruitingAutomationRecord[];
  session: AuthSession;
}): RecruitingAutomationRecord[] {
  const { bundle, existing, session } = input;
  const existingSourceIds = new Set(
    existing
      .map((row) => row.sourceRecommendation?.recommendationId)
      .filter((id): id is string => Boolean(id)),
  );

  const alerts = buildAlertSnapshot({ bundle }).alerts;
  const autopilot = buildRecruitingAutopilotSnapshot({ bundle, alerts });
  const drafts: RecruitingAutomationRecord[] = [];

  for (const rec of autopilot.all) {
    if (rec.kind !== "refresh-job-posting") continue;
    if (existingSourceIds.has(rec.id)) continue;
    const draft = buildJobRefreshDraftFromRecommendation(rec);
    drafts.push(
      appendAuditEntry(draft, session, {
        action: "created",
        before: null,
        after: { approvalStatus: "Draft", actionType: "job-refresh" },
        note: `Auto-generated from autopilot recommendation ${rec.id}`,
        sourceRecommendationId: rec.id,
      }),
    );
  }

  for (const rec of autopilot.all) {
    if (rec.kind !== "expand-recruiting-radius") continue;
    if (existingSourceIds.has(rec.id)) continue;
    const state = normalizeStateCode(rec.entityLabel) ?? rec.entityLabel;
    const city =
      bundle.jobs.find((job) => normalizeStateCode(job.state) === state)?.city ?? rec.entityLabel;
    const postingDraft = buildPostingDraftFromTerritory({
      territory: rec.entityLabel,
      state,
      city,
      openCalls: rec.supportingMetrics.find((m) => m.label.includes("Open"))?.value
        ? Number.parseInt(rec.supportingMetrics.find((m) => m.label.includes("Open"))!.value, 10) || 5
        : 5,
      activeJobs: bundle.jobs.filter((job) => normalizeStateCode(job.state) === state).length,
      coveragePercent: rec.opportunity.estimatedCoverageGain,
      project: rec.entityType === "project" ? rec.entityLabel : null,
      recommendationId: rec.id,
    });
    drafts.push(
      appendAuditEntry(postingDraft, session, {
        action: "created",
        before: null,
        after: { approvalStatus: "Draft", actionType: "create-posting" },
        note: `Auto-generated posting draft from ${rec.id}`,
        sourceRecommendationId: rec.id,
      }),
    );
  }

  const reEngagement = buildCandidateReEngagementIntelligenceSnapshot({
    bundle,
    session,
  });
  for (const opp of reEngagement.top25.slice(0, 10)) {
    const recId = `recovery:${opp.candidateId}`;
    if (existingSourceIds.has(recId)) continue;
    const campaign = buildCampaignDraftFromOpportunity({
      candidateId: opp.candidateId,
      candidateName: opp.candidateName,
      city: opp.city,
      state: opp.state,
      source: opp.source,
      owner: opp.assignedRecruiter || session.name || session.email,
      reason: opp.recommendedAction,
      expectedPlacements: Math.max(1, Math.round(opp.placementProbability / 40)),
      expectedCoverageGain: Math.round(opp.territoryImpact / 10),
      recommendationId: recId,
    });
    drafts.push(
      appendAuditEntry(campaign, session, {
        action: "created",
        before: null,
        after: { approvalStatus: "Draft", actionType: "follow-up-campaign" },
        note: `Auto-generated campaign from candidate recovery ${opp.candidateId}`,
        sourceRecommendationId: recId,
      }),
    );
  }

  return drafts;
}

export function syncAutomationDrafts(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  existing: RecruitingAutomationRecord[];
  session: AuthSession;
}): RecruitingAutomationRecord[] {
  const generated = generateDraftsFromIntelligence(input);
  const byId = new Map(input.existing.map((row) => [row.id, row]));
  for (const row of generated) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}
