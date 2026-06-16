import { readAutomationStore } from "@/lib/recruiting-automation-actions/store";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";
import type { AutomationOpportunitySummary } from "@/lib/executive-morning-brief/types";

function impactScore(record: RecruitingAutomationRecord): number {
  const text = record.expectedImpact ?? "";
  const match = text.match(/\+(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : 50;
}

function automationTitle(record: RecruitingAutomationRecord): string {
  const payload = record.payload;
  if ("title" in payload && typeof payload.title === "string") return payload.title;
  if (record.sourceRecommendation?.label) return record.sourceRecommendation.label;
  return record.reason;
}

function toOpportunity(record: RecruitingAutomationRecord): AutomationOpportunitySummary {
  return {
    id: record.id,
    actionType: record.actionType,
    title: automationTitle(record),
    expectedImpact: record.expectedImpact,
    approvalStatus: record.approvalStatus,
    impactScore: impactScore(record),
  };
}

export async function buildAutomationOpportunitiesSection() {
  const store = await readAutomationStore();
  const records = store.automations;
  const pending = records.filter((row) => row.approvalStatus === "Pending Approval");
  const drafts = records.filter((row) => row.approvalStatus === "Draft");

  const highestImpact = [...drafts, ...pending]
    .sort((a, b) => impactScore(b) - impactScore(a))
    .slice(0, 5)
    .map(toOpportunity);

  return {
    jobRefreshDrafts: records.filter((row) => row.actionType === "job-refresh").length,
    postingDrafts: records.filter((row) => row.actionType === "create-posting").length,
    followUpCampaigns: records.filter((row) => row.actionType === "follow-up-campaign").length,
    pendingApprovals: pending.length,
    highestImpact,
  };
}
