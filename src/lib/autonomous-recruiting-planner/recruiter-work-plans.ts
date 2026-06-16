import type { RecruiterWorkPlan } from "@/lib/autonomous-recruiting-planner/types";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export function buildRecruiterWorkPlans(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  workforce: WorkforceCapacityForecastSnapshot;
  dailyActionPlan: DailyActionPlanSnapshot;
  followUps: ExecutiveAlertFollowUp[];
  recruiterFilter?: string | null;
  referenceMs: number;
}): RecruiterWorkPlan[] {
  const recruiters = input.recruiterFilter
    ? input.workforce.recruiterCapacity.filter(
        (row) => row.recruiterName === input.recruiterFilter,
      )
    : input.workforce.recruiterCapacity;

  return recruiters.slice(0, 15).map((recruiter) => {
    const assignedCandidates = input.bundle.candidates.filter((candidate) => {
      const workflow = input.bundle.workflows[candidate.candidateId];
      return workflow?.assignedRecruiter === recruiter.recruiterName;
    });

    const candidatePriorities = assignedCandidates
      .map((candidate) => {
        const workflow = input.bundle.workflows[candidate.candidateId];
        const needsFollowUp = workflow?.recruitingActions?.needsFollowUp ?? false;
        const priorityScore = needsFollowUp ? 80 : 50;
        return {
          id: candidate.candidateId,
          label: `${candidate.firstName} ${candidate.lastName}`,
          reason: needsFollowUp ? "Follow-up overdue" : "Pipeline advancement",
          priorityScore,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5);

    const territoryPriorities = input.bundle.opportunities
      .filter((opp) => opp.openStatus)
      .slice(0, 4)
      .map((opp, index) => ({
        territory: `${opp.city}, ${opp.state}`,
        reason: opp.priority === "high" ? "High-priority open call" : "Open staffing need",
        priorityScore: 70 - index * 5,
      }));

    const recruiterFollowUps = input.followUps
      .filter((fu) => fu.ownerName === recruiter.recruiterName)
      .slice(0, 5)
      .map((fu, index) => ({
        id: fu.id,
        label: fu.notes ?? `Follow-up for alert ${fu.alertId}`,
        dueLabel: fu.dueDate,
        priorityScore: 90 - index * 3,
      }));

    const dailyActions = input.dailyActionPlan.all
      .filter((item) => item.owner === recruiter.recruiterName)
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        label: item.title,
        dueLabel: "Today",
        priorityScore: item.expectedImpact,
      }));

    const followUpPriorities = [...recruiterFollowUps, ...dailyActions]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5);

    return {
      recruiterName: recruiter.recruiterName,
      weekLabel: "This week",
      candidatePriorities,
      territoryPriorities,
      followUpPriorities,
      capacityState: recruiter.state,
      workloadSummary:
        recruiter.needsHelp
          ? `At ${recruiter.capacityPercent}% capacity — needs support`
          : `${recruiter.activeWorkload} active items, ${recruiter.followUpVolume} follow-ups`,
    };
  });
}
