import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildQueueCandidateRow } from "@/lib/candidate-action-queue";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { AuthSession } from "@/lib/auth/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildScopedCandidateRows } from "@/lib/recruiter-operating-system/build-scoped-rows";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import { detectCandidateBottlenecks } from "@/lib/recruiter-action-center/bottlenecks";
import { deriveNextBestAction } from "@/lib/recruiter-action-center/next-best-action";
import {
  priorityBandLabel,
  resolvePriorityBand,
  scoreRecruiterActionCenterPriority,
} from "@/lib/recruiter-action-center/priority-scoring";
import {
  buildProductivityDashboard,
  buildRecruiterScorecard,
} from "@/lib/recruiter-action-center/productivity";
import {
  groupCandidatesIntoQueues,
  pickWorkModeCandidate,
  resolveQueueSection,
} from "@/lib/recruiter-action-center/queue-grouping";
import { buildTeamLeaderView } from "@/lib/recruiter-action-center/team-leader";
import type {
  ActionCenterCandidateRow,
  RecruiterActionCenterScope,
  RecruiterActionCenterSnapshot,
  SmartFilterId,
} from "@/lib/recruiter-action-center/types";
import { resolveOneClickActionsForRow } from "@/lib/recruiter-action-center/workflow-actions";
import { filterActionCenterRows } from "@/lib/recruiter-action-center/filters";

export type BuildRecruiterActionCenterInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  actingRecruiter?: string;
  requestedRecruiter?: string | null;
  referenceMs?: number;
  recruiters?: string[];
  activeFilter?: SmartFilterId | null;
  skippedCandidateIds?: string[];
};

export type BuildRecruiterActionCenterFromRowsInput = {
  rows: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  actingRecruiter: string;
  session?: AuthSession;
  recruiters?: string[];
  referenceMs?: number;
  activeFilter?: SmartFilterId | null;
  skippedCandidateIds?: string[];
  showTeamLeaderView?: boolean;
};

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || row.candidateId;
}

function toScope(session: AuthSession, requestedRecruiter?: string | null): RecruiterActionCenterScope {
  const scope = resolveRecruiterOperatingSystemScope(session, requestedRecruiter);
  return {
    recruiterName: scope.recruiterName,
    recruiterLabel: scope.recruiterLabel,
    territoryStates: scope.territoryStates,
    role: scope.role,
    scopedToRecruiter: scope.scopedToRecruiter,
    showTeamLeaderView: session.role === "admin" || session.role === "executive",
  };
}

function buildCandidateRows(input: {
  rows: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  actingRecruiter: string;
  referenceMs: number;
}): ActionCenterCandidateRow[] {
  const { rows, opportunities, actingRecruiter, referenceMs } = input;

  return rows
    .map((row) => {
      const queueRow = buildQueueCandidateRow(row, referenceMs);
      const priorityScore = scoreRecruiterActionCenterPriority({
        row,
        opportunities,
        referenceMs,
      });
      const priorityBand = resolvePriorityBand(priorityScore);
      const next = deriveNextBestAction({ row, opportunities, referenceMs });
      const followUpOverdue = isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      });
      const dueDate = row.followUpDueAt ?? null;
      const queueSection = resolveQueueSection({
        priorityScore,
        priorityBand,
        dueDate,
        referenceMs,
        followUpOverdue,
      });
      const locationLabel = [row.city, row.state].filter(Boolean).join(", ") || "—";
      const jobLabel = row.positionName?.trim() || "Open role";

      return {
        candidateId: row.candidateId,
        candidateName: candidateName(row),
        locationLabel,
        projectLabel: jobLabel,
        jobLabel,
        workflowStatus: row.workflowStatus,
        priorityScore,
        priorityBand,
        queueSection,
        nextAction: next.action,
        nextActionLabel: next.label,
        reason: next.reason,
        expectedImpact: next.expectedImpact,
        relatedNeed: next.relatedNeed,
        dueDate,
        lastActivityAt: row.lastActionAt ?? row.appliedDate ?? null,
        assignedRecruiter: row.assignedRecruiter,
        bottlenecks: detectCandidateBottlenecks(row, referenceMs),
        oneClickActions: resolveOneClickActionsForRow({
          workflowStatus: row.workflowStatus,
          assignedRecruiter: row.assignedRecruiter,
          actingRecruiter,
        }),
        sourceRow: queueRow,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

function assembleSnapshot(input: {
  scope: RecruiterActionCenterScope;
  actingRecruiter: string;
  rows: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  recruiters: string[];
  referenceMs: number;
  activeFilter?: SmartFilterId | null;
  skippedCandidateIds?: string[];
}): RecruiterActionCenterSnapshot {
  const allCandidates = buildCandidateRows({
    rows: input.rows,
    opportunities: input.opportunities,
    actingRecruiter: input.actingRecruiter,
    referenceMs: input.referenceMs,
  });
  const filtered = filterActionCenterRows(
    allCandidates,
    input.activeFilter ?? null,
    input.actingRecruiter,
    input.referenceMs,
  );
  const productivity = buildProductivityDashboard({
    rows: input.rows.filter((row) => row.assignedRecruiter.trim() === input.actingRecruiter.trim()),
    referenceMs: input.referenceMs,
  });
  const recruiterScore = buildRecruiterScorecard({
    rows: input.rows.filter((row) => row.assignedRecruiter.trim() === input.actingRecruiter.trim()),
    productivity,
    referenceMs: input.referenceMs,
  });
  const teamLeaderView = input.scope.showTeamLeaderView
    ? buildTeamLeaderView({
        rows: input.rows,
        recruiters: input.recruiters,
        referenceMs: input.referenceMs,
      })
    : [];

  const queues = groupCandidatesIntoQueues(filtered);
  const nextCandidate = pickWorkModeCandidate(allCandidates, input.skippedCandidateIds ?? []);

  return {
    generatedAt: new Date(input.referenceMs).toISOString(),
    scope: input.scope,
    actingRecruiter: input.actingRecruiter,
    queues,
    allCandidates,
    productivity,
    recruiterScore,
    teamLeaderView,
    activeFilter: input.activeFilter ?? null,
    workMode: {
      nextCandidate,
      progressToday: productivity.today.candidatesWorked,
      goalToday: 12,
      skippedCandidateIds: input.skippedCandidateIds ?? [],
    },
  };
}

export function buildRecruiterActionCenterSnapshot(
  input: BuildRecruiterActionCenterInput,
): RecruiterActionCenterSnapshot {
  const referenceMs = input.referenceMs ?? Date.parse(input.bundle.fetchedAt);
  const scope = toScope(input.session, input.requestedRecruiter);
  const actingRecruiter = input.actingRecruiter ?? scope.recruiterName;
  const rows = buildScopedCandidateRows(input.bundle, {
    ...scope,
    recruiterName: actingRecruiter,
    recruiterLabel: actingRecruiter,
  });

  return assembleSnapshot({
    scope,
    actingRecruiter,
    rows,
    opportunities: input.bundle.opportunities,
    recruiters: input.recruiters ?? [actingRecruiter],
    referenceMs,
    activeFilter: input.activeFilter,
    skippedCandidateIds: input.skippedCandidateIds,
  });
}

export function buildRecruiterActionCenterFromRows(
  input: BuildRecruiterActionCenterFromRowsInput,
): RecruiterActionCenterSnapshot {
  const referenceMs = input.referenceMs ?? Date.now();
  const scope: RecruiterActionCenterScope = input.session
    ? toScope(input.session)
    : {
        recruiterName: input.actingRecruiter,
        recruiterLabel: input.actingRecruiter,
        territoryStates: [],
        role: "recruiter",
        scopedToRecruiter: true,
        showTeamLeaderView: input.showTeamLeaderView ?? false,
      };

  return assembleSnapshot({
    scope,
    actingRecruiter: input.actingRecruiter,
    rows: input.rows,
    opportunities: input.opportunities,
    recruiters: input.recruiters ?? [input.actingRecruiter],
    referenceMs,
    activeFilter: input.activeFilter,
    skippedCandidateIds: input.skippedCandidateIds,
  });
}

export { priorityBandLabel };
