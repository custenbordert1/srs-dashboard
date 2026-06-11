import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import { buildRecruiterProductivitySnapshot } from "@/lib/recruiter-productivity-center/build-recruiter-productivity-snapshot";
import type { RecruiterAiCoachSnapshot } from "@/lib/ai-recruiting-command-center/types";

export function buildRecruiterAiCoach(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
  territoryStates?: string[] | null;
}): RecruiterAiCoachSnapshot {
  if (!input.workflows) {
    return {
      pipelineSummary: "Workflow data unavailable — pipeline analysis is limited to Breezy applicants.",
      followUpSummary: "Enable workflow sync to surface follow-up coaching.",
      conversionSummary: "Conversion metrics require candidate workflow state.",
      productivityTrend: "Productivity trend unavailable without workflows.",
      candidatesToContact: [],
      jobsNeedingApplicants: input.jobs
        .filter((job) => candidatesForJob(job, input.candidates).length === 0)
        .slice(0, 5)
        .map((job) => ({
          jobId: job.jobId,
          title: job.name,
          reason: "Zero applicants on this posting",
        })),
      followUpsDueToday: [],
    };
  }

  const productivity = buildRecruiterProductivitySnapshot({
    candidates: input.candidates,
    workflows: input.workflows,
    fetchedAt: input.fetchedAt,
    filters: { territoryStates: input.territoryStates ?? null },
  });

  const dashboard = productivity.dashboard;
  const avg = (values: Array<number | null>) => {
    const nums = values.filter((value): value is number => value !== null);
    return nums.length > 0 ? Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length) : null;
  };
  const contactRate = avg(productivity.scorecards.map((row) => row.contactRatePercent));
  const paperworkRate = avg(productivity.scorecards.map((row) => row.paperworkConversionPercent));
  const hireRate = avg(productivity.scorecards.map((row) => row.hireConversionPercent));

  const pipelineSummary = `${dashboard.applicantsAssigned} assigned applicants · ${dashboard.followUpsDue} follow-ups due · ${dashboard.paperworkPending} paperwork pending.`;
  const followUpSummary =
    dashboard.followUpsDue > 0
      ? `${dashboard.followUpsDue} candidates need contact today to stay on SLA.`
      : "Follow-up queue is clear for today.";
  const conversionSummary =
    contactRate !== null
      ? `Contact ${contactRate}% · Paperwork ${paperworkRate ?? "—"}% · Hire ${hireRate ?? "—"}%.`
      : "Conversion metrics building from recruiter scorecards.";
  const productivityTrend =
    productivity.productivityScore >= 70
      ? `Productivity score ${productivity.productivityScore} — strong conversion and contact rates.`
      : productivity.productivityScore >= 45
        ? `Productivity score ${productivity.productivityScore} — focus on overdue follow-ups and paperwork.`
        : `Productivity score ${productivity.productivityScore} — pipeline needs immediate attention.`;

  const candidatesToContact = productivity.dailyTasks
    .filter((task) => task.type === "call-candidate" || task.type === "follow-up")
    .slice(0, 8)
    .map((task) => ({
      candidateId: task.candidateId,
      name: task.candidateName,
      reason: task.label,
    }));

  const followUpsDueToday = productivity.dailyTasks
    .filter((task) => task.type === "follow-up")
    .slice(0, 8)
    .map((task) => ({
      candidateId: task.candidateId,
      name: task.candidateName,
      reason: task.label,
    }));

  const jobsNeedingApplicants = input.jobs
    .filter((job) => candidatesForJob(job, input.candidates).length <= 1)
    .slice(0, 8)
    .map((job) => {
      const count = candidatesForJob(job, input.candidates).length;
      return {
        jobId: job.jobId,
        title: job.name,
        reason: count === 0 ? "Zero applicants" : "Only 1 applicant — expand sourcing",
      };
    });

  return {
    pipelineSummary,
    followUpSummary,
    conversionSummary,
    productivityTrend,
    candidatesToContact,
    jobsNeedingApplicants,
    followUpsDueToday,
  };
}
